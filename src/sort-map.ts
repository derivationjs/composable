import { List, Map as IMap } from "immutable";
import { Graph } from "derivation";
import { Reactive } from "./reactive.js";
import { ListCommand, ListOperations } from "./list-operations.js";
import { MapCommand } from "./map-operations.js";
import { asBase } from "./operations.js";
import { TwoThreeTree, Monoid } from "./two-three-tree.js";

export type MapEntryComparator<K, V> = (left: [K, V], right: [K, V]) => number;

type SortSummary<K> = { count: number; lastKey: K | null };

function sortMonoid<K>(): Monoid<SortSummary<K>> {
  return {
    empty: { count: 0, lastKey: null },
    combine: (a, b) => ({
      count: a.count + b.count,
      lastKey: b.count > 0 ? b.lastKey : a.lastKey,
    }),
  };
}

function sortMeasure<K>(mapKey: K): SortSummary<K> {
  return { count: 1, lastKey: mapKey };
}

type SortState<K, V> = {
  map: IMap<K, V>;
  tree: TwoThreeTree<object, K, SortSummary<K>>;
  ids: IMap<K, object>;
};

function makeInsertThreshold<K, V>(
  state: SortState<K, V>,
  compare: MapEntryComparator<K, V>,
  key: K,
  value: V,
): (acc: SortSummary<K>) => boolean {
  return (acc) => {
    if (acc.count === 0) return false;
    const accValue = state.map.get(acc.lastKey!) as V;
    return compare([key, value], [acc.lastKey!, accValue]) < 0;
  };
}

function treeIndexOf<K>(
  tree: TwoThreeTree<object, K, SortSummary<K>>,
  id: object,
): number {
  return tree.getPrefixSummaryById(id)!.count;
}

function buildInitialState<K, V>(
  source: IMap<K, V>,
  compare: MapEntryComparator<K, V>,
): SortState<K, V> {
  const tree = new TwoThreeTree<object, K, SortSummary<K>>(
    sortMonoid<K>(),
    sortMeasure,
  );
  const state: SortState<K, V> = {
    map: source,
    tree,
    ids: IMap<K, object>(),
  };

  for (const [key, value] of source.entries()) {
    const id = {};
    state.ids = state.ids.set(key, id);
    tree.insert(id, key, makeInsertThreshold(state, compare, key, value));
  }

  return state;
}

function stateToList<K, V>(state: SortState<K, V>): List<V> {
  const values: V[] = [];
  for (const { value: mapKey } of state.tree) {
    const v = state.map.get(mapKey);
    values.push(
      v === undefined && !state.map.has(mapKey) ? (undefined as V) : (v as V),
    );
  }
  return List(values);
}

export function sortMap<K, V>(
  graph: Graph,
  source: Reactive<IMap<K, V>>,
  compare: MapEntryComparator<K, V>,
): Reactive<List<V>> {
  const valueOps = source.operations.valueOperations;
  const baseValueOps = asBase(valueOps);
  const listOps = new ListOperations(valueOps);
  let state = buildInitialState(source.previousSnapshot, compare);
  const initial = stateToList(state);

  const changes = source.changes.map((rawCommands) => {
    const commands = (rawCommands ?? []) as MapCommand<K, V>[];
    if (commands.length === 0) {
      return null;
    }

    const output: ListCommand<V>[] = [];

    for (const command of commands) {
      switch (command.type) {
        case "add": {
          const id = {};
          state.ids = state.ids.set(command.key, id);
          state.map = state.map.set(command.key, command.value);
          state.tree.insert(
            id,
            command.key,
            makeInsertThreshold(state, compare, command.key, command.value),
          );
          const index = treeIndexOf(state.tree, id);
          output.push({ type: "insert", index, value: command.value });
          break;
        }
        case "delete": {
          const id = state.ids.get(command.key);
          if (id === undefined) {
            state.map = state.map.delete(command.key);
            break;
          }
          const index = treeIndexOf(state.tree, id);
          state.tree.remove(id);
          state.map = state.map.delete(command.key);
          state.ids = state.ids.delete(command.key);
          output.push({ type: "remove", index });
          break;
        }
        case "update": {
          if (!state.map.has(command.key)) break;

          const currentValue = state.map.get(command.key) as V;
          const nextValue = baseValueOps.apply(currentValue, command.command);

          const id = state.ids.get(command.key);
          if (id === undefined) {
            state.map = state.map.set(command.key, nextValue);
            break;
          }

          const oldIndex = treeIndexOf(state.tree, id);

          state.tree.remove(id);
          state.map = state.map.set(command.key, nextValue);
          if (currentValue !== nextValue) {
            output.push({
              type: "update",
              index: oldIndex,
              command: command.command,
            });
          }

          state.tree.insert(
            id,
            command.key,
            makeInsertThreshold(state, compare, command.key, nextValue),
          );
          const newIndex = treeIndexOf(state.tree, id);
          if (oldIndex !== newIndex) {
            output.push({ type: "move", from: oldIndex, to: newIndex });
          }
          break;
        }
        case "clear": {
          const hadEntries = state.tree.summary.count > 0;
          state.tree.clear();
          state.map = IMap<K, V>();
          state.ids = IMap<K, object>();
          if (hadEntries) {
            output.push({ type: "clear" });
          }
          break;
        }
      }
    }

    return output.length > 0 ? output : null;
  });

  return Reactive.create<List<V>>(graph, listOps, changes, initial);
}
