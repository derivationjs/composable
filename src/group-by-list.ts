import { List, Map as IMap, is } from "immutable";
import { IndexedList } from "@derivation/indexed-list";
import { Graph } from "derivation";
import { Reactive } from "./reactive.js";
import { Cell } from "./cell.js";
import { Changes, Operations } from "./operations.js";
import { decomposeList, ID } from "./decompose-list.js";
import { MapCommand, MapOperations } from "./map-operations.js";
import { ListCommand, ListOperations } from "./list-operations.js";
import { mapMap } from "./map-reactive.js";
import { TwoThreeTree, Monoid } from "./two-three-tree.js";

type GroupInfo = { count: number; lastId: ID | null };

const groupInfoMonoid: Monoid<GroupInfo> = {
  empty: { count: 0, lastId: null },
  combine: (a, b) => ({
    count: a.count + b.count,
    lastId: b.lastId ?? a.lastId,
  }),
};

function measureGroupEntry(id: ID): GroupInfo {
  return { count: 1, lastId: id };
}

/**
 * Groups a Reactive<List<X>> into a Reactive<Map<K, List<X>>> based on a key function.
 *
 * Items are grouped by the key returned by the key function. When an item's key changes,
 * it moves from one group to another. Groups are created/deleted as needed.
 */
export function groupByList<X, K extends NonNullable<unknown>>(
  graph: Graph,
  list: Reactive<List<X>>,
  keyFn: (x: Reactive<X>) => Reactive<Cell<K>>,
): Reactive<IMap<K, List<X>>> {
  const [structure, valuesMap] = decomposeList(graph, list);
  const keysMap = mapMap(graph, valuesMap, keyFn);

  // Sequence counter for making opaque ID objects comparable in IndexedList
  let nextSeq = 0;
  const idSeq = new WeakMap<object, number>();
  const assignSeq = (id: ID): void => {
    if (!idSeq.has(id)) {
      idSeq.set(id, nextSeq++);
    }
  };
  const compareIds = (a: ID, b: ID): number => {
    return idSeq.get(a)! - idSeq.get(b)!;
  };
  const createEmptyIL = (): IndexedList<ID, ID> =>
    IndexedList.create<ID, ID>({
      compareIds,
      xToNodeId: (id: ID) => id,
    });

  // Source IndexedList: tracks all elements in source order.
  // Provides isBefore() for ordering comparisons and
  // valueAt() for index-to-ID mapping.
  let sourceIL = createEmptyIL();

  // Per-group TwoThreeTrees with a count+lastId monoid.
  // getPrefixSummaryById gives group index in O(log g).
  // insert uses lastId in the threshold to place elements in source order.
  const groupTrees = new Map<K, TwoThreeTree<ID, ID, GroupInfo>>();

  // Key cache: ID -> current key (needed for remove/move where the
  // element may already be gone from the materialized keysMap).
  const keyCache = new Map<ID, K>();

  const createGroupTree = () =>
    new TwoThreeTree<ID, ID, GroupInfo>(groupInfoMonoid, measureGroupEntry);

  function addToGroup(key: K, id: ID, value: X): MapCommand<K, List<X>> {
    let groupTree = groupTrees.get(key);
    const isNew = groupTree === undefined;
    if (isNew) {
      groupTree = createGroupTree();
      groupTrees.set(key, groupTree);
    }
    groupTree!.insert(id, id, (acc) =>
      acc.lastId !== null && sourceIL.isBefore(id, acc.lastId),
    );

    if (isNew) {
      return { type: "add", key, value: List<X>([value]) };
    }
    const idx = groupTree!.getPrefixSummaryById(id)!.count;
    return {
      type: "update",
      key,
      command: [{ type: "insert", index: idx, value }],
    };
  }

  function removeFromGroup(key: K, id: ID): MapCommand<K, List<X>> {
    const groupTree = groupTrees.get(key)!;
    const idx = groupTree.getPrefixSummaryById(id)!.count;
    groupTree.remove(id);

    if (groupTree.summary.count === 0) {
      groupTrees.delete(key);
      return { type: "delete", key };
    }
    return {
      type: "update",
      key,
      command: [{ type: "remove", index: idx }],
    };
  }

  // Build initial groups
  let initialGroups = IMap<K, List<X>>();
  structure.previousSnapshot.forEach((cellId) => {
    const id = cellId.value;
    assignSeq(id);
    const keyCell = keysMap.previousSnapshot.get(id);
    const value = valuesMap.previousSnapshot.get(id);
    if (!keyCell || value === undefined) return;
    const key = keyCell.value;

    sourceIL = sourceIL.append(id)[0];

    let groupTree = groupTrees.get(key);
    if (!groupTree) {
      groupTree = createGroupTree();
      groupTrees.set(key, groupTree);
    }
    groupTree.insert(id, id, () => false); // Append: elements arrive in order
    keyCache.set(id, key);

    const existing = initialGroups.get(key) ?? List<X>();
    initialGroups = initialGroups.set(key, existing.push(value));
  });

  const listOps = new ListOperations(list.operations.itemOperations);
  const mapOps = new MapOperations<K, List<X>>(
    listOps as unknown as Operations<List<X>>,
  );

  const allChanges = structure.changes
    .zip(valuesMap.changes, (structCmds, valCmds) => ({ structCmds, valCmds }))
    .zip(keysMap.changes, ({ structCmds, valCmds }, keyCmds) => ({
      structCmds,
      valCmds,
      keyCmds,
    }))
    .zip(keysMap.materialized, ({ structCmds, valCmds, keyCmds }, keysMat) => ({
      structCmds,
      valCmds,
      keyCmds,
      keysMat,
    }))
    .zip(valuesMap.materialized, ({ structCmds, valCmds, keyCmds, keysMat }, valsMat) => {
      const structCommands = (structCmds ?? []) as ListCommand<Cell<ID>>[];
      const valCommands = (valCmds ?? []) as MapCommand<ID, X>[];
      const keyCommands = (keyCmds ?? []) as MapCommand<ID, Cell<K>>[];
      const outputCmds: MapCommand<K, List<X>>[] = [];
      const insertedIds = new Set<ID>();
      const keyChangedIds = new Set<ID>();

      // Process structural changes
      for (const cmd of structCommands) {
        switch (cmd.type) {
          case "insert": {
            const id = cmd.value.value;
            assignSeq(id);
            insertedIds.add(id);
            sourceIL = sourceIL.insertAt(cmd.index, id)[0];

            const keyCell = keysMat.get(id);
            if (!keyCell) {
              // Transient insert: will be removed later in this batch
              break;
            }
            const key = keyCell.value;
            keyCache.set(id, key);
            outputCmds.push(addToGroup(key, id, valsMat.get(id)!));
            break;
          }
          case "remove": {
            const id = sourceIL.valueAt(cmd.index);
            if (id === undefined) break;

            const key = keyCache.get(id);
            if (key === undefined) {
              // Transient element (no key assigned)
              sourceIL = sourceIL.remove(id);
              break;
            }

            outputCmds.push(removeFromGroup(key, id));
            sourceIL = sourceIL.remove(id);
            keyCache.delete(id);
            break;
          }
          case "move": {
            const id = sourceIL.valueAt(cmd.from);
            if (id === undefined) break;

            const key = keyCache.get(id);
            if (key === undefined) {
              // Transient element
              sourceIL = sourceIL.remove(id);
              sourceIL = sourceIL.insertAt(cmd.to, id)[0];
              break;
            }

            // Get old group index
            const groupTree = groupTrees.get(key)!;
            const oldGroupIdx = groupTree.getPrefixSummaryById(id)!.count;

            // Remove from group and source
            groupTree.remove(id);
            sourceIL = sourceIL.remove(id);

            // Re-insert into source at new position
            sourceIL = sourceIL.insertAt(cmd.to, id)[0];

            // Re-insert into group at correct position (source order via isBefore)
            groupTree.insert(id, id, (acc) =>
              acc.lastId !== null && sourceIL.isBefore(id, acc.lastId),
            );
            const newGroupIdx = groupTree.getPrefixSummaryById(id)!.count;

            if (oldGroupIdx !== newGroupIdx) {
              outputCmds.push({
                type: "update",
                key,
                command: [{ type: "move", from: oldGroupIdx, to: newGroupIdx }],
              });
            }
            break;
          }
          case "clear": {
            sourceIL = createEmptyIL();
            if (groupTrees.size > 0) {
              groupTrees.clear();
              keyCache.clear();
              outputCmds.push({ type: "clear" });
            }
            break;
          }
        }
      }

      // Process key changes
      for (const cmd of keyCommands) {
        if (cmd.type === "update" && cmd.command !== null && !insertedIds.has(cmd.key)) {
          const id = cmd.key;
          const newKey = cmd.command as K;
          const oldKey = keyCache.get(id);
          if (oldKey === undefined || is(oldKey, newKey)) continue;

          const currentValue = valsMat.get(id)!;
          outputCmds.push(removeFromGroup(oldKey, id));
          outputCmds.push(addToGroup(newKey, id, currentValue));
          keyCache.set(id, newKey);
          keyChangedIds.add(id);
        }
      }

      // Process value-only updates (skip IDs that had key changes)
      for (const cmd of valCommands) {
        if (cmd.type === "update" && !insertedIds.has(cmd.key) && !keyChangedIds.has(cmd.key)) {
          const id = cmd.key;
          const key = keyCache.get(id);
          if (key === undefined) continue;

          const groupTree = groupTrees.get(key);
          if (!groupTree) continue;

          const prefix = groupTree.getPrefixSummaryById(id);
          if (prefix === undefined) continue;

          outputCmds.push({
            type: "update",
            key,
            command: [{ type: "update", index: prefix.count, command: cmd.command }],
          });
        }
      }

      return outputCmds.length === 0 ? null : outputCmds;
    });

  return Reactive.create<IMap<K, List<X>>>(
    graph,
    mapOps,
    allChanges,
    initialGroups,
  );
}
