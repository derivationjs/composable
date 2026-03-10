import { Map as IMap } from "immutable";
import { Graph } from "derivation";
import { Reactive } from "./reactive.js";
import { Cell } from "./cell.js";
import { mapMap } from "./map-reactive.js";
import { MapOperations } from "./map-operations.js";
import { asBase } from "./operations.js";

function applyFilter<K, V>(
  source: IMap<K, V>,
  selected: IMap<K, Cell<boolean>>,
): IMap<K, V> {
  let result = IMap<K, V>();
  for (const [key, value] of source) {
    if (selected.get(key)?.value === true) {
      result = result.set(key, value);
    }
  }
  return result;
}

export function filterMap<K, V>(
  graph: Graph,
  source: Reactive<IMap<K, V>>,
  predicate: (value: Reactive<V>, key: K) => Reactive<Cell<boolean>>,
): Reactive<IMap<K, V>> {
  const selected = mapMap(graph, source, predicate);
  const operations = new MapOperations<K, V>(source.operations.valueOperations);
  const baseOps = asBase<IMap<K, V>>(operations);
  const initialSnapshot = applyFilter(
    source.previousSnapshot,
    selected.previousSnapshot,
  );

  const materialized = source.materialized.zip(
    selected.materialized,
    (map, selectedMap) => applyFilter(map, selectedMap),
  );
  const previousMaterialized = materialized.delay(initialSnapshot);
  const changes = materialized.zip(previousMaterialized, (current, previous) => {
    if (current.equals(previous)) {
      return null;
    }
    return baseOps.replaceCommand(current);
  });

  return new Reactive(materialized, previousMaterialized, changes, operations);
}
