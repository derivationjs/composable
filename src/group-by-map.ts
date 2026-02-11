import { Map as IMap } from "immutable";
import { Graph } from "derivation";
import { Reactive } from "./reactive.js";
import { Primitive, Operations } from "./operations.js";
import { MapOperations } from "./map-operations.js";
import { mapMap } from "./map-reactive.js";

function materializeGroupedMap<ID, T, K>(
  values: IMap<ID, T>,
  keys: IMap<ID, K>,
): IMap<K, IMap<ID, T>> {
  let grouped = IMap<K, IMap<ID, T>>();
  for (const [id, value] of values) {
    const key = keys.get(id);
    if (key === undefined) continue;
    const existing = grouped.get(key) ?? IMap<ID, T>();
    grouped = grouped.set(key, existing.set(id, value));
  }
  return grouped;
}

/**
 * Groups a Reactive<Map<ID, T>> into a Reactive<Map<K, Map<ID, T>>> based on a key function.
 *
 * Items are grouped by the key returned by the key function applied to each entry's
 * reactive value. When an item's key changes, it moves from one group to another.
 * Groups are created/deleted as needed.
 */
export function groupByMap<ID, T, K>(
  graph: Graph,
  source: Reactive<IMap<ID, T>>,
  f: (x: Reactive<T>) => Reactive<K>,
  ..._check: [Primitive<K>] extends [never]
    ? [error: "K must be a primitive type, not a collection"]
    : []
): Reactive<IMap<K, IMap<ID, T>>> {
  // TODO: Make this fully incremental/stateful by producing minimal outer/inner
  // map commands instead of rematerializing grouped output and replacing it.
  const keys = mapMap(graph, source, (rx) => f(rx));
  const initialGroups = materializeGroupedMap(
    source.previousSnapshot,
    keys.previousSnapshot,
  );

  const innerMapOps = new MapOperations<ID, T>(source.operations.valueOperations);
  const outerMapOps = new MapOperations<K, IMap<ID, T>>(
    innerMapOps as unknown as Operations<IMap<ID, T>>,
  );

  const materialized = source.materialized.zip(
    keys.materialized,
    (values, groupedKeys) => materializeGroupedMap(values, groupedKeys),
  );
  const allChanges = materialized
    .delay(initialGroups)
    .zip(materialized, (previous, current) => {
      if (previous.equals(current)) return null;
      return outerMapOps.replaceCommand(current);
    });

  return Reactive.create<IMap<K, IMap<ID, T>>>(
    graph,
    outerMapOps,
    allChanges,
    initialGroups,
  );
}
