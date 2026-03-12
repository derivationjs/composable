import { List, Map as IMap } from "immutable";
import { Graph } from "derivation";
import { Reactive } from "./reactive.js";
import { Cell } from "./cell.js";
import { ListCommand, ListOperations } from "./list-operations.js";
import { MapCommand, MapOperations } from "./map-operations.js";
import { ID } from "./decompose-list.js";
import { TwoThreeTree, Monoid } from "./two-three-tree.js";

const countMonoid: Monoid<number> = {
  empty: 0,
  combine: (a, b) => a + b,
};

export function composeList<T>(
  graph: Graph,
  idList: Reactive<List<Cell<ID>>>,
  map: Reactive<IMap<ID, T>>,
): Reactive<List<T>> {
  const valueOps = map.operations.valueOperations;
  const listOps = new ListOperations(valueOps);

  // Build initial list by looking up each ID in the map
  const initialList = List<T>(
    idList.previousSnapshot.map((id) => map.previousSnapshot.get(id.value)!),
  );

  // Maintain a 2-3 tree for O(log n) index-of-key lookups
  const tree = new TwoThreeTree<ID, Cell<ID>, number>(countMonoid, () => 1);
  idList.previousSnapshot.forEach((cellId) => {
    tree.insert(cellId.value, cellId, () => false); // append at end
  });

  const changes = idList.changes
    .zip(map.changes, (idCmds, mapCmds) => ({
      idCmds: (idCmds ?? []) as ListCommand<Cell<ID>>[],
      mapCmds: (mapCmds ?? []) as MapCommand<ID, T>[],
    }))
    .map(({ idCmds, mapCmds }) => {
      const outputCmds: ListCommand<T>[] = [];
      const insertedIds = new Set<ID>();

      // Process structural changes from the ID list
      for (const cmd of idCmds) {
        switch (cmd.type) {
          case "insert": {
            const value = map.snapshot.get(cmd.value.value)!;
            tree.insert(cmd.value.value, cmd.value, (acc) => acc > cmd.index);
            insertedIds.add(cmd.value.value);
            outputCmds.push({ type: "insert", index: cmd.index, value });
            break;
          }
          case "remove": {
            const found = tree.findByThreshold((acc) => acc > cmd.index);
            if (found) {
              tree.remove(found.id);
            }
            outputCmds.push({ type: "remove", index: cmd.index });
            break;
          }
          case "move": {
            const found = tree.findByThreshold((acc) => acc > cmd.from);
            if (found) {
              tree.remove(found.id);
              tree.insert(found.id, found.value, (acc) => acc > cmd.to);
              outputCmds.push({ type: "move", from: cmd.from, to: cmd.to });
            }
            break;
          }
          case "clear": {
            tree.clear();
            outputCmds.push({ type: "clear" });
            break;
          }
        }
      }

      // Process value updates from the map (skip IDs inserted this batch)
      for (const cmd of mapCmds) {
        if (cmd.type === "update" && !insertedIds.has(cmd.key)) {
          const prefix = tree.getPrefixSummaryById(cmd.key);
          if (prefix !== undefined) {
            outputCmds.push({
              type: "update",
              index: prefix,
              command: cmd.command,
            });
          }
        }
      }

      return outputCmds.length === 0 ? null : outputCmds;
    });

  return Reactive.create<List<T>>(graph, listOps, changes, initialList);
}
