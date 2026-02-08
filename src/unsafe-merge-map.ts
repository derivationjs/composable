import { Map as IMap } from "immutable";
import { Graph, constantValue } from "derivation";
import { Reactive } from "./reactive.js";
import { MapOperations, MapCommand } from "./map-operations.js";

/**
 * Merges two Reactive<IMap<K, V>> values that have disjoint key sets.
 *
 * This is "unsafe" because it assumes keys never overlap between the two maps.
 * If keys overlap, behavior is undefined.
 */
export function unsafeMergeMap<K, V>(
  graph: Graph,
  a: Reactive<IMap<K, V>>,
  b: Reactive<IMap<K, V>>,
  ops: MapOperations<K, V>,
): Reactive<IMap<K, V>> {
  const materialized = a.materialized.zip(
    b.materialized,
    (ma, mb) => ma.merge(mb),
  );
  const previousMaterialized = a.previousMaterialized.zip(
    b.previousMaterialized,
    (ma, mb) => ma.merge(mb),
  );
  const changes = a.changes.zip(b.changes, (ca, cb) =>
    ops.mergeCommands(ca, cb),
  );
  return new Reactive(materialized, previousMaterialized, changes, ops);
}

/**
 * Creates an empty Reactive<IMap<K, V>> with no changes.
 */
export function emptyReactiveMap<K, V>(
  graph: Graph,
  ops: MapOperations<K, V>,
): Reactive<IMap<K, V>> {
  const empty = constantValue(graph, IMap<K, V>());
  const noChanges = constantValue(graph, null as MapCommand<K, V>[] | null);
  return new Reactive(empty, empty, noChanges, ops);
}
