import { List, Map as IMap, is } from "immutable";
import { Graph } from "derivation";
import { Reactive } from "./reactive.js";
import { Cell } from "./cell.js";
import { Changes, Operations } from "./operations.js";
import { decomposeList, ID } from "./decompose-list.js";
import { MapCommand, MapOperations } from "./map-operations.js";
import { ListCommand, ListOperations } from "./list-operations.js";
import { mapMap } from "./map-reactive.js";
import { TwoThreeTree, Monoid } from "./two-three-tree.js";

type GroupSummary<K> = { total: number; perKey: IMap<K, number> };

function groupSummaryMonoid<K>(): Monoid<GroupSummary<K>> {
  return {
    empty: { total: 0, perKey: IMap() },
    combine: (a, b) => ({
      total: a.total + b.total,
      perKey: a.perKey.mergeWith((va, vb) => va + vb, b.perKey),
    }),
  };
}

type TreeEntry<K> = { key: K | null; cellId: Cell<ID> };

function measureEntry<K>(v: TreeEntry<K>): GroupSummary<K> {
  if (v.key === null) return { total: 1, perKey: IMap() };
  return { total: 1, perKey: IMap([[v.key, 1]]) };
}

function groupIndex<K>(
  tree: TwoThreeTree<ID, TreeEntry<K>, GroupSummary<K>>,
  id: ID,
  key: K,
): number {
  return tree.getPrefixSummaryById(id)!.perKey.get(key) ?? 0;
}

/**
 * Mutable tracker for group sizes.
 * Produces incremental outer map commands for add/delete/update of groups.
 */
class ListGroupTracker<X, K extends NonNullable<unknown>> {
  groupSizes = IMap<K, number>();

  private incrementSize(key: K): void {
    this.groupSizes = this.groupSizes.set(key, (this.groupSizes.get(key) ?? 0) + 1);
  }

  private decrementSize(key: K): void {
    const size = this.groupSizes.get(key)!;
    if (size === 1) {
      this.groupSizes = this.groupSizes.delete(key);
    } else {
      this.groupSizes = this.groupSizes.set(key, size - 1);
    }
  }

  addToGroup(key: K, index: number, value: X): MapCommand<K, List<X>> {
    const isNew = !this.groupSizes.has(key);
    this.incrementSize(key);
    if (isNew) {
      return { type: "add", key, value: List<X>([value]) };
    }
    return {
      type: "update",
      key,
      command: [{ type: "insert", index, value }],
    };
  }

  removeFromGroup(key: K, index: number): MapCommand<K, List<X>> {
    const size = this.groupSizes.get(key)!;
    this.decrementSize(key);
    if (size === 1) {
      return { type: "delete", key };
    }
    return {
      type: "update",
      key,
      command: [{ type: "remove", index }],
    };
  }

  updateInGroup(
    key: K,
    index: number,
    command: Changes<X>,
  ): MapCommand<K, List<X>> {
    return {
      type: "update",
      key,
      command: [{ type: "update", index, command }],
    };
  }

  moveInGroup(
    key: K,
    fromIdx: number,
    toIdx: number,
  ): MapCommand<K, List<X>> | null {
    if (fromIdx === toIdx) return null;
    return {
      type: "update",
      key,
      command: [{ type: "move", from: fromIdx, to: toIdx }],
    };
  }

  clear(): void {
    this.groupSizes = IMap();
  }
}

function processStructuralCommand<X, K extends NonNullable<unknown>>(
  tree: TwoThreeTree<ID, TreeEntry<K>, GroupSummary<K>>,
  tracker: ListGroupTracker<X, K>,
  cmd: ListCommand<Cell<ID>>,
  keysMap: IMap<ID, Cell<K>>,
  valuesMap: IMap<ID, X>,
): MapCommand<K, List<X>>[] {
  const results: MapCommand<K, List<X>>[] = [];

  switch (cmd.type) {
    case "insert": {
      const id = cmd.value.value;
      const keyCell = keysMap.get(id);
      if (!keyCell) {
        // Transient insert: will be removed later in this batch
        tree.insert(id, { key: null, cellId: cmd.value }, (acc) => acc.total > cmd.index);
        break;
      }
      const key = keyCell.value;
      tree.insert(id, { key, cellId: cmd.value }, (acc) => acc.total > cmd.index);
      const idx = groupIndex(tree, id, key);
      const value = valuesMap.get(id)!;
      results.push(tracker.addToGroup(key, idx, value));
      break;
    }
    case "remove": {
      const found = tree.findByThreshold((acc) => acc.total > cmd.index);
      if (found) {
        const { id, value: entry } = found;
        if (entry.key === null) {
          tree.remove(id);
          break;
        }
        const idx = groupIndex(tree, id, entry.key);
        tree.remove(id);
        results.push(tracker.removeFromGroup(entry.key, idx));
      }
      break;
    }
    case "move": {
      const found = tree.findByThreshold((acc) => acc.total > cmd.from);
      if (found) {
        const { id, value: entry } = found;
        if (entry.key === null) {
          tree.remove(id);
          tree.insert(id, entry, (acc) => acc.total > cmd.to);
          break;
        }
        const oldIdx = groupIndex(tree, id, entry.key);
        tree.remove(id);
        tree.insert(id, entry, (acc) => acc.total > cmd.to);
        const newIdx = groupIndex(tree, id, entry.key);
        const moveCmd = tracker.moveInGroup(entry.key, oldIdx, newIdx);
        if (moveCmd) results.push(moveCmd);
      }
      break;
    }
    case "clear": {
      tree.clear();
      if (tracker.groupSizes.size > 0) {
        tracker.clear();
        results.push({ type: "clear" });
      }
      break;
    }
  }

  return results;
}

function processKeyChange<X, K extends NonNullable<unknown>>(
  tree: TwoThreeTree<ID, TreeEntry<K>, GroupSummary<K>>,
  tracker: ListGroupTracker<X, K>,
  id: ID,
  newKey: K,
  currentValue: X,
): MapCommand<K, List<X>>[] {
  const entry = tree.get(id);
  if (!entry || entry.key === null || is(entry.key, newKey)) return [];

  const oldKey = entry.key;
  const oldIdx = groupIndex(tree, id, oldKey);
  tree.update(id, { ...entry, key: newKey });
  const newIdx = groupIndex(tree, id, newKey);

  return [
    tracker.removeFromGroup(oldKey, oldIdx),
    tracker.addToGroup(newKey, newIdx, currentValue),
  ];
}

function processValueUpdate<X, K extends NonNullable<unknown>>(
  tree: TwoThreeTree<ID, TreeEntry<K>, GroupSummary<K>>,
  tracker: ListGroupTracker<X, K>,
  id: ID,
  command: Changes<X>,
): MapCommand<K, List<X>>[] {
  const entry = tree.get(id);
  if (!entry || entry.key === null) return [];

  const idx = groupIndex(tree, id, entry.key);
  return [tracker.updateInGroup(entry.key, idx, command)];
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

  const tree = new TwoThreeTree<ID, TreeEntry<K>, GroupSummary<K>>(
    groupSummaryMonoid<K>(),
    measureEntry,
  );
  const tracker = new ListGroupTracker<X, K>();

  // Build initial groups
  let initialGroups = IMap<K, List<X>>();
  structure.previousSnapshot.forEach((cellId) => {
    const id = cellId.value;
    const keyCell = keysMap.previousSnapshot.get(id);
    const value = valuesMap.previousSnapshot.get(id);
    if (!keyCell || value === undefined) return;
    const key = keyCell.value;
    tree.insert(id, { key, cellId }, () => false);
    tracker.groupSizes = tracker.groupSizes.set(
      key,
      (tracker.groupSizes.get(key) ?? 0) + 1,
    );
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
        if (cmd.type === "insert") insertedIds.add(cmd.value.value);
        const cmds = processStructuralCommand(tree, tracker, cmd, keysMat, valsMat);
        outputCmds.push(...cmds);
      }

      // Process key changes (from keysMap.changes directly)
      for (const cmd of keyCommands) {
        if (cmd.type === "update" && cmd.command !== null && !insertedIds.has(cmd.key)) {
          const newKey = cmd.command as K;
          const currentValue = valsMat.get(cmd.key)!;
          const cmds = processKeyChange(tree, tracker, cmd.key, newKey, currentValue);
          if (cmds.length > 0) {
            keyChangedIds.add(cmd.key);
            outputCmds.push(...cmds);
          }
        }
      }

      // Process value-only updates (skip IDs that had key changes)
      for (const cmd of valCommands) {
        if (cmd.type === "update" && !insertedIds.has(cmd.key) && !keyChangedIds.has(cmd.key)) {
          const cmds = processValueUpdate(tree, tracker, cmd.key, cmd.command);
          outputCmds.push(...cmds);
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
