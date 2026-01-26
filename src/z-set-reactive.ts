import { Graph, ReactiveValue } from "derivation";
import { Reactive } from "./reactive.js";
import { ZSet } from "./z-set.js";
import { ZSetOperations } from "./z-set-operations.js";
import { ZMap } from "./z-map.js";
import { ZMapOperations } from "./z-map-operations.js";
import { Tuple } from "./tuple.js";

/**
 * Group a reactive ZSet by a key function, producing a reactive ZMap.
 */
export function groupByZSet<T, K>(
  graph: Graph,
  source: Reactive<ZSet<T>>,
  func: (t: T) => K,
): Reactive<ZMap<K, T>> {
  const operations = new ZMapOperations<K, T>();

  const changes = source.changes.map((cmd) => (cmd as ZSet<T>).groupBy(func));

  const initialSnapshot = (source.previousSnapshot as ZSet<T>).groupBy(func);

  return Reactive.create(graph, operations, changes, initialSnapshot);
}

/**
 * Filter a reactive ZSet based on a predicate.
 */
export function filterZSet<T>(
  graph: Graph,
  source: Reactive<ZSet<T>>,
  pred: (t: T) => boolean,
): Reactive<ZSet<T>> {
  const operations = new ZSetOperations<T>();

  const changes = source.changes.map((cmd) => (cmd as ZSet<T>).filter(pred));

  const initialSnapshot = (source.previousSnapshot as ZSet<T>).filter(pred);

  return Reactive.create(graph, operations, changes, initialSnapshot);
}

/**
 * Map a reactive ZSet to a new ZSet with transformed elements.
 * Weights of duplicate results are combined.
 */
export function mapZSet<T, A>(
  graph: Graph,
  source: Reactive<ZSet<T>>,
  func: (t: T) => A,
): Reactive<ZSet<A>> {
  const operations = new ZSetOperations<A>();

  const changes = source.changes.map((cmd) => (cmd as ZSet<T>).map(func));

  const initialSnapshot = (source.previousSnapshot as ZSet<T>).map(func);

  return Reactive.create(graph, operations, changes, initialSnapshot);
}

/**
 * Union two reactive ZSets.
 */
export function unionZSet<T>(
  graph: Graph,
  left: Reactive<ZSet<T>>,
  right: Reactive<ZSet<T>>,
): Reactive<ZSet<T>> {
  const operations = new ZSetOperations<T>();

  const changes = left.changes.zip(right.changes, (lC, rC) =>
    (lC as ZSet<T>).union(rC as ZSet<T>),
  );

  const initialSnapshot = (left.previousSnapshot as ZSet<T>).union(
    right.previousSnapshot as ZSet<T>,
  );

  return Reactive.create(graph, operations, changes, initialSnapshot);
}

/**
 * Intersection of two reactive ZSets.
 * Uses the three-case incremental pattern.
 */
export function intersectionZSet<T>(
  graph: Graph,
  left: Reactive<ZSet<T>>,
  right: Reactive<ZSet<T>>,
): Reactive<ZSet<T>> {
  const operations = new ZSetOperations<T>();

  const changes = left.changes.zip3(
    left.previousMaterialized,
    right.changes,
    right.previousMaterialized,
    (lC, lM, rC, rM) => {
      const lCZSet = lC as ZSet<T>;
      const lMZSet = lM as ZSet<T>;
      const rCZSet = rC as ZSet<T>;
      const rMZSet = rM as ZSet<T>;

      return lCZSet
        .intersection(rMZSet)
        .union(lMZSet.intersection(rCZSet))
        .union(lCZSet.intersection(rCZSet));
    },
  );

  const initialSnapshot = (left.previousSnapshot as ZSet<T>).intersection(
    right.previousSnapshot as ZSet<T>,
  );

  return Reactive.create(graph, operations, changes, initialSnapshot);
}

/**
 * Difference of two reactive ZSets.
 */
export function differenceZSet<T>(
  graph: Graph,
  left: Reactive<ZSet<T>>,
  right: Reactive<ZSet<T>>,
): Reactive<ZSet<T>> {
  const operations = new ZSetOperations<T>();

  const changes = left.changes.zip(right.changes, (lC, rC) =>
    (lC as ZSet<T>).difference(rC as ZSet<T>),
  );

  const initialSnapshot = (left.previousSnapshot as ZSet<T>).difference(
    right.previousSnapshot as ZSet<T>,
  );

  return Reactive.create(graph, operations, changes, initialSnapshot);
}

/**
 * Cartesian product of two reactive ZSets.
 * Uses the three-case incremental pattern.
 */
export function productZSet<T, A>(
  graph: Graph,
  left: Reactive<ZSet<T>>,
  right: Reactive<ZSet<A>>,
): Reactive<ZSet<Tuple<[T, A]>>> {
  const operations = new ZSetOperations<Tuple<[T, A]>>();

  const changes = left.changes.zip3(
    left.previousMaterialized,
    right.changes,
    right.previousMaterialized,
    (lC, lM, rC, rM) => {
      const lCZSet = lC as ZSet<T>;
      const lMZSet = lM as ZSet<T>;
      const rCZSet = rC as ZSet<A>;
      const rMZSet = rM as ZSet<A>;

      // Three cases for incremental product:
      // 1. left changes × right snapshot
      // 2. left snapshot × right changes
      // 3. left changes × right changes
      return lCZSet
        .product(rMZSet)
        .union(lMZSet.product(rCZSet))
        .union(lCZSet.product(rCZSet));
    },
  );

  const initialSnapshot = (left.previousSnapshot as ZSet<T>).product(
    right.previousSnapshot as ZSet<A>,
  );

  return Reactive.create(graph, operations, changes, initialSnapshot);
}
