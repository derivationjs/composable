import { List, Map as IMap, is } from "immutable";
import { Graph } from "derivation";
import { Reactive } from "./reactive.js";
import { ListCommand, ListOperations } from "./list-operations.js";
import { MapCommand } from "./map-operations.js";
import { asBase } from "./operations.js";

export type MapEntryComparator<K, V> = (left: [K, V], right: [K, V]) => number;

type SortState<K, V> = {
  map: IMap<K, V>;
  sortedKeys: K[];
  sequenceNumbers: IMap<K, number>;
  nextSequenceNumber: number;
};

function findSortedKeyIndex<K>(sortedKeys: K[], key: K): number {
  return sortedKeys.findIndex((existingKey) => is(existingKey, key));
}

function compareEntries<K, V>(
  leftKey: K,
  leftValue: V,
  rightKey: K,
  rightValue: V,
  compare: MapEntryComparator<K, V>,
  sequenceNumbers: IMap<K, number>,
): number {
  const ranked = compare([leftKey, leftValue], [rightKey, rightValue]);
  if (ranked !== 0) return ranked;
  return (sequenceNumbers.get(leftKey) ?? 0) - (sequenceNumbers.get(rightKey) ?? 0);
}

function buildInitialState<K, V>(
  source: IMap<K, V>,
  compare: MapEntryComparator<K, V>,
): SortState<K, V> {
  const entries = [...source.entries()];
  let sequenceNumbers = IMap<K, number>();

  entries.forEach(([key], index) => {
    sequenceNumbers = sequenceNumbers.set(key, index);
  });

  const sortedKeys = entries
    .slice()
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      compareEntries(
        leftKey,
        leftValue,
        rightKey,
        rightValue,
        compare,
        sequenceNumbers,
      ),
    )
    .map(([key]) => key);

  return {
    map: source,
    sortedKeys,
    sequenceNumbers,
    nextSequenceNumber: entries.length,
  };
}

function stateToList<K, V>(state: SortState<K, V>): List<V> {
  return List(
    state.sortedKeys.map((key) => {
      const value = state.map.get(key);
      return value === undefined && !state.map.has(key) ? (undefined as V) : (value as V);
    }),
  );
}

function hasSameObservableEntries<V>(left: List<V>, right: List<V>): boolean {
  if (left.size !== right.size) return false;
  for (let index = 0; index < left.size; index++) {
    if (left.get(index) !== right.get(index)) return false;
  }
  return true;
}

function findInsertIndex<K, V>(
  state: SortState<K, V>,
  key: K,
  value: V,
  compare: MapEntryComparator<K, V>,
): number {
  for (let index = 0; index < state.sortedKeys.length; index++) {
    const existingKey = state.sortedKeys[index];
    const existingValue = state.map.get(existingKey);
    if (existingValue === undefined && !state.map.has(existingKey)) continue;
    const rankedValue = existingValue as V;
    if (
      compareEntries(
        key,
        value,
        existingKey,
        rankedValue,
        compare,
        state.sequenceNumbers,
      ) < 0
    ) {
      return index;
    }
  }
  return state.sortedKeys.length;
}

export function sortMap<K, V>(
  graph: Graph,
  source: Reactive<IMap<K, V>>,
  compare: MapEntryComparator<K, V>,
): Reactive<List<V>> {
  const valueOps = source.operations.valueOperations;
  const baseValueOps = asBase(valueOps);
  const listOps = new ListOperations(valueOps);
  let state = buildInitialState(source.snapshot, compare);
  const initial = stateToList(state);
  let current = initial;
  let pendingInitialCommands = source.changes.value;

  const changes = source.changes.map((rawCommands) => {
    if (rawCommands === pendingInitialCommands) {
      pendingInitialCommands = null;
      return null;
    }
    pendingInitialCommands = null;

    const commands = (rawCommands ?? []) as MapCommand<K, V>[];
    if (commands.length === 0) {
      return null;
    }

    const output: ListCommand<V>[] = [];

    for (const command of commands) {
      switch (command.type) {
        case "add": {
          const nextSequenceNumber = state.nextSequenceNumber;
          state.sequenceNumbers = state.sequenceNumbers.set(
            command.key,
            nextSequenceNumber,
          );
          state.nextSequenceNumber = nextSequenceNumber + 1;
          state.map = state.map.set(command.key, command.value);
          const index = findInsertIndex(state, command.key, command.value, compare);
          state.sortedKeys.splice(index, 0, command.key);
          output.push({ type: "insert", index, value: command.value });
          break;
        }
        case "delete": {
          const index = findSortedKeyIndex(state.sortedKeys, command.key);
          if (index === -1) {
            state.map = state.map.delete(command.key);
            state.sequenceNumbers = state.sequenceNumbers.delete(command.key);
            break;
          }
          state.sortedKeys.splice(index, 1);
          state.map = state.map.delete(command.key);
          state.sequenceNumbers = state.sequenceNumbers.delete(command.key);
          output.push({ type: "remove", index });
          break;
        }
        case "update": {
          if (!state.map.has(command.key)) break;

          const currentValue = state.map.get(command.key) as V;
          const nextValue = baseValueOps.apply(currentValue, command.command);
          const oldIndex = findSortedKeyIndex(state.sortedKeys, command.key);
          if (oldIndex === -1) {
            state.map = state.map.set(command.key, nextValue);
            break;
          }

          state.map = state.map.set(command.key, nextValue);
          if (!is(currentValue, nextValue)) {
            output.push({ type: "update", index: oldIndex, command: command.command });
          }

          state.sortedKeys.splice(oldIndex, 1);
          const newIndex = findInsertIndex(state, command.key, nextValue, compare);
          state.sortedKeys.splice(newIndex, 0, command.key);
          if (oldIndex !== newIndex) {
            output.push({ type: "move", from: oldIndex, to: newIndex });
          }
          break;
        }
        case "clear": {
          const hadEntries = state.sortedKeys.length > 0;
          state = {
            map: IMap<K, V>(),
            sortedKeys: [],
            sequenceNumbers: IMap<K, number>(),
            nextSequenceNumber: state.nextSequenceNumber,
          };
          if (hadEntries) {
            output.push({ type: "clear" });
          }
          break;
        }
      }
    }

    const previous = current;
    const next = stateToList(state);
    current = next;
    if (output.length > 0) {
      return output;
    }
    return hasSameObservableEntries(previous, next)
      ? null
      : listOps.replaceCommand(next);
  });

  return Reactive.create<List<V>>(graph, listOps, changes, initial);
}
