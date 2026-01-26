import { Graph, ReactiveValue } from "derivation";
import { Reactive } from "./reactive.js";
import { ZMap } from "./z-map.js";
import { ZMapOperations } from "./z-map-operations.js";
import { ZSet } from "./z-set.js";
import { ZSetOperations } from "./z-set-operations.js";
import { Tuple } from "./tuple.js";

/**
 * Join two reactive ZMaps on their keys.
 * For each matching key k, produces all combinations of (left_value, right_value)
 * using the product operation on the ZSet values.
 *
 * Uses incremental computation: combines changes×snapshot in three ways to
 * ensure all new combinations are captured without duplication.
 */
export function joinZMap<K, V, V1>(
  graph: Graph,
  left: Reactive<ZMap<K, V>>,
  right: Reactive<ZMap<K, V1>>,
): Reactive<ZMap<K, Tuple<[V, V1]>>> {
  const operations = new ZMapOperations<K, Tuple<[V, V1]>>();

  // Incremental join: combine changes and snapshots three ways
  const changes = left.changes.zip3(
    left.previousMaterialized,
    right.changes,
    right.previousMaterialized,
    (lC, lM, rC, rM) => {
      const lCZMap = lC as ZMap<K, V>;
      const lMZMap = lM as ZMap<K, V>;
      const rCZMap = rC as ZMap<K, V1>;
      const rMZMap = rM as ZMap<K, V1>;

      // Three cases for incremental join:
      // 1. left changes × right snapshot
      // 2. left snapshot × right changes
      // 3. left changes × right changes
      return lCZMap
        .join(rMZMap)
        .union(lMZMap.join(rCZMap))
        .union(lCZMap.join(rCZMap));
    },
  );

  const initialSnapshot = (left.previousSnapshot as ZMap<K, V>).join(
    right.previousSnapshot as ZMap<K, V1>,
  );

  return Reactive.create(graph, operations, changes, initialSnapshot);
}

/**
 * Apply a transformation function to all values in a reactive ZMap.
 */
export function mapValuesZMap<K, V, V1>(
  graph: Graph,
  source: Reactive<ZMap<K, V>>,
  func: (v: V) => V1,
): Reactive<ZMap<K, V1>> {
  const operations = new ZMapOperations<K, V1>();

  const changes = source.changes.map((cmd) => (cmd as ZMap<K, V>).mapValues(func));

  const initialSnapshot = (source.previousSnapshot as ZMap<K, V>).mapValues(func);

  return Reactive.create(graph, operations, changes, initialSnapshot);
}

/**
 * Flatten a reactive ZMap into a reactive ZSet by unioning all value ZSets.
 */
export function flattenZMap<K, V>(
  graph: Graph,
  source: Reactive<ZMap<K, V>>,
): Reactive<ZSet<V>> {
  const operations = new ZSetOperations<V>();

  const changes = source.changes.map((cmd) => (cmd as ZMap<K, V>).flatten());

  const initialSnapshot = (source.previousSnapshot as ZMap<K, V>).flatten();

  return Reactive.create(graph, operations, changes, initialSnapshot);
}

/**
 * Filter a reactive ZMap based on a predicate.
 */
export function filterZMap<K, V>(
  graph: Graph,
  source: Reactive<ZMap<K, V>>,
  pred: (k: K, v: V) => boolean,
): Reactive<ZMap<K, V>> {
  const operations = new ZMapOperations<K, V>();

  const changes = source.changes.map((cmd) => (cmd as ZMap<K, V>).filter(pred));

  const initialSnapshot = (source.previousSnapshot as ZMap<K, V>).filter(pred);

  return Reactive.create(graph, operations, changes, initialSnapshot);
}

/**
 * Union two reactive ZMaps.
 */
export function unionZMap<K, V>(
  graph: Graph,
  left: Reactive<ZMap<K, V>>,
  right: Reactive<ZMap<K, V>>,
): Reactive<ZMap<K, V>> {
  const operations = new ZMapOperations<K, V>();

  const changes = left.changes.zip(right.changes, (lC, rC) =>
    (lC as ZMap<K, V>).union(rC as ZMap<K, V>),
  );

  const initialSnapshot = (left.previousSnapshot as ZMap<K, V>).union(
    right.previousSnapshot as ZMap<K, V>,
  );

  return Reactive.create(graph, operations, changes, initialSnapshot);
}

/**
 * Intersection of two reactive ZMaps.
 * Uses the three-case incremental pattern like join.
 */
export function intersectionZMap<K, V>(
  graph: Graph,
  left: Reactive<ZMap<K, V>>,
  right: Reactive<ZMap<K, V>>,
): Reactive<ZMap<K, V>> {
  const operations = new ZMapOperations<K, V>();

  const changes = left.changes.zip3(
    left.previousMaterialized,
    right.changes,
    right.previousMaterialized,
    (lC, lM, rC, rM) => {
      const lCZMap = lC as ZMap<K, V>;
      const lMZMap = lM as ZMap<K, V>;
      const rCZMap = rC as ZMap<K, V>;
      const rMZMap = rM as ZMap<K, V>;

      return lCZMap
        .intersection(rMZMap)
        .union(lMZMap.intersection(rCZMap))
        .union(lCZMap.intersection(rCZMap));
    },
  );

  const initialSnapshot = (left.previousSnapshot as ZMap<K, V>).intersection(
    right.previousSnapshot as ZMap<K, V>,
  );

  return Reactive.create(graph, operations, changes, initialSnapshot);
}

/**
 * Difference of two reactive ZMaps.
 */
export function differenceZMap<K, V>(
  graph: Graph,
  left: Reactive<ZMap<K, V>>,
  right: Reactive<ZMap<K, V>>,
): Reactive<ZMap<K, V>> {
  const operations = new ZMapOperations<K, V>();

  const changes = left.changes.zip(right.changes, (lC, rC) =>
    (lC as ZMap<K, V>).difference(rC as ZMap<K, V>),
  );

  const initialSnapshot = (left.previousSnapshot as ZMap<K, V>).difference(
    right.previousSnapshot as ZMap<K, V>,
  );

  return Reactive.create(graph, operations, changes, initialSnapshot);
}
