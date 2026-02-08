import { List, Map as IMap } from "immutable";
import { Graph } from "derivation";
import { Reactive } from "./reactive.js";
import { ListCommand, ListOperations } from "./list-operations.js";
import { MapCommand, MapOperations } from "./map-operations.js";
import { ID } from "./decompose-list.js";

export function composeList<T>(
  graph: Graph,
  idList: Reactive<List<ID>>,
  map: Reactive<IMap<ID, T>>,
): Reactive<List<T>> {
  const valueOps = (map.operations as MapOperations<ID, T>).valueOperations;
  const listOps = new ListOperations(valueOps);

  // Build initial list by looking up each ID in the map
  const initialList = List<T>(
    idList.materialized.value.map((id) => map.materialized.value.get(id)!),
  );

  const changes = idList.changes
    .zip(map.changes, (idCmds, mapCmds) => ({
      idCmds: (idCmds ?? []) as ListCommand<ID>[],
      mapCmds: (mapCmds ?? []) as MapCommand<ID, T>[],
    }))
    .accumulate(
      {
        ids: idList.materialized.value,
        commands: [] as ListCommand<T>[],
      },
      (state, { idCmds, mapCmds }) => {
        const outputCmds: ListCommand<T>[] = [];
        let ids = state.ids;
        const insertedIds = new Set<ID>();

        // Process structural changes from the ID list
        for (const cmd of idCmds) {
          switch (cmd.type) {
            case "insert": {
              const value = map.snapshot.get(cmd.value)!;
              ids = ids.insert(cmd.index, cmd.value);
              insertedIds.add(cmd.value);
              outputCmds.push({ type: "insert", index: cmd.index, value });
              break;
            }
            case "remove": {
              ids = ids.remove(cmd.index);
              outputCmds.push({ type: "remove", index: cmd.index });
              break;
            }
            case "move": {
              const id = ids.get(cmd.from);
              if (id) {
                ids = ids.remove(cmd.from).insert(cmd.to, id);
                outputCmds.push({ type: "move", from: cmd.from, to: cmd.to });
              }
              break;
            }
            case "clear": {
              ids = List();
              outputCmds.push({ type: "clear" });
              break;
            }
          }
        }

        // Process value updates from the map (skip IDs inserted this batch)
        for (const cmd of mapCmds) {
          if (cmd.type === "update" && !insertedIds.has(cmd.key)) {
            const index = ids.indexOf(cmd.key);
            if (index >= 0) {
              outputCmds.push({
                type: "update",
                index,
                command: cmd.command,
              });
            }
          }
        }

        return { ids, commands: outputCmds };
      },
    )
    .map((s) => s.commands);

  return Reactive.create<List<T>>(graph, listOps, changes, initialList);
}
