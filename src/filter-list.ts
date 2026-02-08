import { List } from "immutable";
import { Graph, ReactiveValue } from "derivation";
import { Reactive } from "./reactive.js";
import { Operations, Changes, asBase } from "./operations.js";
import { decomposeList, ID } from "./decompose-list.js";
import { MapCommand } from "./map-operations.js";
import { groupBy } from "./group-by.js";
import { TwoThreeTree, Monoid } from "./two-three-tree.js";
import { ListCommand, ListOperations } from "./list-operations.js";

// Monoid that counts total elements and selected elements
interface FilterStats {
  total: number;
  selected: number;
}

const filterStatsMonoid: Monoid<FilterStats> = {
  empty: { total: 0, selected: 0 },
  combine: (a, b) => ({
    total: a.total + b.total,
    selected: a.selected + b.selected,
  }),
};

/**
 * Filters a Reactive<List<X>> based on a reactive predicate.
 *
 * The predicate function is called once per item when the item is first inserted.
 * When the predicate's reactive boolean changes, the item enters or leaves the
 * filtered list accordingly.
 */
export function filterList<X>(
  graph: Graph,
  list: Reactive<List<X>>,
  predicate: (x: Reactive<X>) => Reactive<boolean>,
): Reactive<List<X>> {
  // Extract X operations from the list's operations
  const operations = list.operations.itemOperations;
  const [structure, map] = decomposeList(graph, list);

  // Extract per-item update events from map changes
  const updateEvents = map.changes.map((rawCmds) => {
    const cmds = (rawCmds ?? []) as MapCommand<ID, X>[];
    return cmds
      .filter(
        (c): c is Extract<MapCommand<ID, X>, { type: "update" }> =>
          c.type === "update",
      )
      .map((c) => ({ id: c.key, command: c.command }));
  });

  // Group updates by ID
  const groupedUpdates = groupBy(
    updateEvents,
    (u) => u.id,
    (u) => u.command,
  );

  // Map to store reactive state for each ID
  const itemReactives = new Map<ID, Reactive<X>>();
  const predicateReactives = new Map<ID, Reactive<boolean>>();

  // Create initial tree
  function createInitialTree(): TwoThreeTree<ID, boolean, FilterStats> {
    const t = new TwoThreeTree<ID, boolean, FilterStats>(
      filterStatsMonoid,
      (selected) => ({ total: 1, selected: selected ? 1 : 0 }),
    );
    return t;
  }

  const initialTree = createInitialTree();

  // Helper to get or create reactive state for an ID
  function getOrCreateReactives(id: ID): {
    rx: Reactive<X>;
    predRx: Reactive<boolean>;
  } {
    let rx = itemReactives.get(id);
    let predRx = predicateReactives.get(id);

    if (!rx || !predRx) {
      const initialValue = map.snapshot.get(id)!;
      const itemChanges = groupedUpdates
        .select(id)
        .map((cmds) =>
          cmds.reduce(
            (acc: Changes<X>, cmd) => asBase(operations).mergeCommands(acc, cmd),
            null as Changes<X>,
          ),
        );
      rx = Reactive.create(graph, operations, itemChanges, initialValue);
      predRx = predicate(rx);

      itemReactives.set(id, rx);
      predicateReactives.set(id, predRx);
    }

    return { rx: rx!, predRx: predRx! };
  }

  // Initialize tree with initial IDs
  for (const id of structure.snapshot) {
    const { rx, predRx } = getOrCreateReactives(id);
    const isSelected = predRx.snapshot;
    initialTree.insert(id, isSelected, () => false); // Insert at end
  }

  // Build initial filtered list
  const initialFiltered = List(
    structure.snapshot
      .filter((id) => predicateReactives.get(id)!.snapshot)
      .map((id) => itemReactives.get(id)!.snapshot)
      .toArray(),
  );

  const initialSelectedState = new Map<ID, boolean>();
  for (const id of structure.snapshot) {
    const predRx = predicateReactives.get(id);
    if (predRx) {
      initialSelectedState.set(id, predRx.snapshot);
    }
  }

  // Created BEFORE allChanges — dynamic nodes get indices between this and allChanges
  const _reactiveEnsurer = structure.changes.map((structCmds) => {
    const cmds = (structCmds ?? []) as ListCommand<ID>[];
    for (const cmd of cmds) {
      if (cmd.type === "insert") {
        getOrCreateReactives(cmd.value);
      }
    }
  });

  const allChanges = structure.changes
    .zip(updateEvents, (structCmds, upds) => ({
      structCmds: (structCmds ?? []) as ListCommand<ID>[],
      upds,
    }))
    .accumulate(
      {
        tree: initialTree,
        selectedState: initialSelectedState,
        currentIds: structure.snapshot,
        commands: [] as ListCommand<X>[],
      },
      (state, { structCmds, upds }) => {
        const outputCmds: ListCommand<X>[] = [];
        const tree = state.tree;
        const selectedState = state.selectedState;

        // Track current ID list as we process structural commands
        let currentIds = state.currentIds;

        // Process structural changes
        for (const cmd of structCmds) {
          switch (cmd.type) {
            case "insert": {
              const id = cmd.value;
              const { rx, predRx } = getOrCreateReactives(id);
              const key = id;
              const isSelected = predRx.snapshot;

              // Find insertion position in tree based on source index
              tree.insert(
                key,
                isSelected,
                (prefix) => prefix.total >= cmd.index,
              );
              selectedState.set(key, isSelected);
              currentIds = currentIds.insert(cmd.index, id);

              // If selected, emit insert command for filtered list
              if (isSelected) {
                const destIndex = tree.getPrefixSummaryById(key)?.selected ?? 0;
                outputCmds.push({
                  type: "insert",
                  index: destIndex,
                  value: rx.snapshot,
                });
              }
              break;
            }
            case "remove": {
              const id = currentIds.get(cmd.index);
              if (!id) break;

              const key = id;
              const wasSelected = selectedState.get(key) ?? false;

              // If selected, emit remove command (get index before removing from tree)
              if (wasSelected) {
                const destIndex = tree.getPrefixSummaryById(key)?.selected ?? 0;
                outputCmds.push({ type: "remove", index: destIndex });
              }

              tree.remove(key);
              selectedState.delete(key);
              currentIds = currentIds.remove(cmd.index);
              break;
            }
            case "move": {
              const id = currentIds.get(cmd.from);
              if (!id) break;

              const key = id;
              const isSelected = selectedState.get(key) ?? false;

              if (isSelected) {
                const oldDestIndex =
                  tree.getPrefixSummaryById(key)?.selected ?? 0;
                tree.remove(key);
                tree.insert(
                  key,
                  isSelected,
                  (prefix) => prefix.total >= cmd.to,
                );
                const newDestIndex =
                  tree.getPrefixSummaryById(key)?.selected ?? 0;

                if (oldDestIndex !== newDestIndex) {
                  outputCmds.push({
                    type: "move",
                    from: oldDestIndex,
                    to: newDestIndex,
                  });
                }
              } else {
                tree.remove(key);
                tree.insert(
                  key,
                  isSelected,
                  (prefix) => prefix.total >= cmd.to,
                );
              }

              currentIds = currentIds.remove(cmd.from).insert(cmd.to, id);
              break;
            }
            case "clear": {
              // Rebuild empty tree
              state.tree = createInitialTree();
              state.selectedState = new Map();
              currentIds = List();
              outputCmds.push({ type: "clear" });
              break;
            }
          }
        }

        // Process predicate/item updates
        for (const upd of upds) {
          const predRx = predicateReactives.get(upd.id);
          if (!predRx) continue;

          const key = upd.id;
          const oldSelected = selectedState.get(key) ?? false;
          const newSelected = predRx.snapshot;

          if (oldSelected !== newSelected) {
            const rx = itemReactives.get(upd.id)!;
            const sourceIndex = currentIds.indexOf(upd.id);

            if (!oldSelected && newSelected) {
              tree.remove(key);
              tree.insert(
                key,
                newSelected,
                (prefix) => prefix.total >= sourceIndex,
              );
              selectedState.set(key, newSelected);

              const destIndex = tree.getPrefixSummaryById(key)?.selected ?? 0;
              outputCmds.push({
                type: "insert",
                index: destIndex,
                value: rx.snapshot,
              });
            } else if (oldSelected && !newSelected) {
              const destIndex = tree.getPrefixSummaryById(key)?.selected ?? 0;
              outputCmds.push({ type: "remove", index: destIndex });

              tree.remove(key);
              tree.insert(
                key,
                newSelected,
                (prefix) => prefix.total >= sourceIndex,
              );
              selectedState.set(key, newSelected);
            }
          } else if (newSelected) {
            const rx = itemReactives.get(upd.id);
            if (rx) {
              const destIndex = tree.getPrefixSummaryById(key)?.selected ?? 0;
              outputCmds.push({
                type: "update",
                index: destIndex,
                command: upd.command,
              });
            }
          }
        }

        return { tree, selectedState, currentIds, commands: outputCmds };
      },
    )
    .map((state) => state.commands);

  const listOps = new ListOperations(operations);

  return Reactive.create<List<X>>(graph, listOps, allChanges, initialFiltered);
}
