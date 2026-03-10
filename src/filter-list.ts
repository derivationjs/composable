import { List, Map as IMap } from "immutable";
import { Graph } from "derivation";
import { Reactive } from "./reactive.js";
import { Cell } from "./cell.js";
import { CellOperations } from "./cell-operations.js";
import { decomposeList, ID } from "./decompose-list.js";
import { ListCommand, ListOperations } from "./list-operations.js";
import { MapCommand } from "./map-operations.js";
import { mapMap } from "./map-reactive.js";
import { composeList } from "./compose-list.js";
import { TwoThreeTree, Monoid } from "./two-three-tree.js";

type Summary = { total: number; selected: number };

const summaryMonoid: Monoid<Summary> = {
  empty: { total: 0, selected: 0 },
  combine: (a, b) => ({
    total: a.total + b.total,
    selected: a.selected + b.selected,
  }),
};

type TreeEntry = { selected: boolean; cellId: Cell<ID> };

const measureEntry = (v: TreeEntry): Summary => ({
  total: 1,
  selected: v.selected ? 1 : 0,
});

function filteredIndex(
  tree: TwoThreeTree<ID, TreeEntry, Summary>,
  id: ID,
): number {
  return tree.getPrefixSummaryById(id)!.selected;
}

function processStructuralCommand(
  tree: TwoThreeTree<ID, TreeEntry, Summary>,
  cmd: ListCommand<Cell<ID>>,
  selectedMap: IMap<ID, Cell<boolean>>,
): ListCommand<Cell<ID>> | null {
  switch (cmd.type) {
    case "insert": {
      const id = cmd.value.value;
      const selected = selectedMap.get(id)?.value === true;
      tree.insert(id, { selected, cellId: cmd.value }, (acc) => acc.total > cmd.index);
      if (selected) {
        return { type: "insert", index: filteredIndex(tree, id), value: cmd.value };
      }
      return null;
    }
    case "remove": {
      const found = tree.findByThreshold((acc) => acc.total > cmd.index);
      if (found) {
        const { id, value: entry } = found;
        if (entry.selected) {
          const idx = filteredIndex(tree, id);
          tree.remove(id);
          return { type: "remove", index: idx };
        }
        tree.remove(id);
      }
      return null;
    }
    case "move": {
      const found = tree.findByThreshold((acc) => acc.total > cmd.from);
      if (found) {
        const { id, value: entry } = found;
        const wasSelected = entry.selected;
        const oldIdx = wasSelected ? filteredIndex(tree, id) : -1;
        tree.remove(id);
        tree.insert(id, entry, (acc) => acc.total > cmd.to);
        if (wasSelected) {
          const newIdx = filteredIndex(tree, id);
          if (oldIdx !== newIdx) {
            return { type: "move", from: oldIdx, to: newIdx };
          }
        }
      }
      return null;
    }
    case "clear": {
      const hadSelected = tree.summary.selected > 0;
      tree.clear();
      return hadSelected ? { type: "clear" } : null;
    }
    default:
      return null;
  }
}

function processSelectionChange(
  tree: TwoThreeTree<ID, TreeEntry, Summary>,
  id: ID,
  newSelected: boolean,
): ListCommand<Cell<ID>> | null {
  const entry = tree.get(id);
  if (!entry || entry.selected === newSelected) return null;

  if (entry.selected && !newSelected) {
    const idx = filteredIndex(tree, id);
    tree.update(id, { ...entry, selected: false });
    return { type: "remove", index: idx };
  } else {
    tree.update(id, { ...entry, selected: true });
    const idx = filteredIndex(tree, id);
    return { type: "insert", index: idx, value: entry.cellId };
  }
}

/**
 * Filters a Reactive<List<X>> based on a reactive predicate.
 *
 * The predicate function is called once per item when the item is first inserted.
 * Subsequent updates flow through the per-item reactive predicate.
 */
export function filterList<X>(
  graph: Graph,
  list: Reactive<List<X>>,
  predicate: (x: Reactive<X>) => Reactive<Cell<boolean>>,
): Reactive<List<X>> {
  const [structure, map] = decomposeList(graph, list);
  const selectedMap = mapMap(graph, map, predicate);

  const tree = new TwoThreeTree<ID, TreeEntry, Summary>(summaryMonoid, measureEntry);

  let initialFilteredIds = List<Cell<ID>>();
  structure.previousSnapshot.forEach((cellId) => {
    const id = cellId.value;
    const selected = selectedMap.previousSnapshot.get(id)?.value === true;
    tree.insert(id, { selected, cellId }, () => false);
    if (selected) {
      initialFilteredIds = initialFilteredIds.push(cellId);
    }
  });

  const filteredIdChanges = structure.changes
    .zip(selectedMap.changes, (structCmds, selCmds) => ({
      structCmds: (structCmds ?? []) as ListCommand<Cell<ID>>[],
      selCmds: (selCmds ?? []) as MapCommand<ID, Cell<boolean>>[],
    }))
    .map(({ structCmds, selCmds }) => {
      const outputCmds: ListCommand<Cell<ID>>[] = [];
      const insertedIds = new Set<ID>();

      for (const cmd of structCmds) {
        if (cmd.type === "insert") insertedIds.add(cmd.value.value);
        const result = processStructuralCommand(tree, cmd, selectedMap.snapshot);
        if (result) outputCmds.push(result);
      }

      for (const cmd of selCmds) {
        if (cmd.type === "update" && !insertedIds.has(cmd.key)) {
          const newSelected = cmd.command as boolean | null;
          if (newSelected === null) continue;
          const result = processSelectionChange(tree, cmd.key, newSelected);
          if (result) outputCmds.push(result);
        }
      }

      return outputCmds.length === 0 ? null : outputCmds;
    });

  const idOps = new CellOperations<ID>();
  const filteredIdListOps = new ListOperations<Cell<ID>>(idOps);
  const filteredIdList = Reactive.create<List<Cell<ID>>>(
    graph,
    filteredIdListOps,
    filteredIdChanges,
    initialFilteredIds,
  );

  return composeList(graph, filteredIdList, map);
}
