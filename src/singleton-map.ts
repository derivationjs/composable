import { Graph } from "derivation";
import { Map as IMap, is } from "immutable";
import { Cell } from "./cell.js";
import { Reactive } from "./reactive.js";
import { MapOperations, MapCommand } from "./map-operations.js";

/**
 * Wrap a key and a reactive value into a reactive singleton map.
 */
export function singletonMap<K, V>(
  graph: Graph,
  key: K,
  source: Reactive<V>,
): Reactive<IMap<K, V>> {
  const valueOps = source.operations;
  const mapOps = new MapOperations<K, V>(valueOps);

  const changes = source.changes.map((cmd): MapCommand<K, V>[] | null => {
    if (cmd === null) {
      return null;
    }
    return [{ type: "update", key, command: cmd }];
  });

  const initial = IMap([[key, source.previousSnapshot]]) as IMap<K, V>;

  return Reactive.create<IMap<K, V>>(graph, mapOps, changes, initial);
}

/**
 * Wrap a reactive key and a reactive value into a reactive singleton map.
 */
export function reactiveSingletonMap<K extends NonNullable<unknown>, V>(
  graph: Graph,
  key: Reactive<Cell<K>>,
  source: Reactive<V>,
): Reactive<IMap<K, V>> {
  const valueOps = source.operations;
  const mapOps = new MapOperations<K, V>(valueOps);

  const changes = key.materialized
    .zip(key.previousMaterialized, (currentKey, previousKey) => ({
      currentKey: currentKey.value,
      previousKey: previousKey.value,
    }))
    .zip(source.materialized, (keyState, currentValue) => ({
      ...keyState,
      currentValue,
    }))
    .zip(source.changes, (state, command): MapCommand<K, V>[] | null => {
      if (!is(state.currentKey, state.previousKey)) {
        return [
          { type: "delete", key: state.previousKey },
          { type: "add", key: state.currentKey, value: state.currentValue },
        ];
      }

      if (command === null) {
        return null;
      }

      return [{ type: "update", key: state.currentKey, command }];
    });

  const initial = IMap([[key.previousSnapshot.value, source.previousSnapshot]]) as IMap<
    K,
    V
  >;

  return Reactive.create<IMap<K, V>>(graph, mapOps, changes, initial);
}
