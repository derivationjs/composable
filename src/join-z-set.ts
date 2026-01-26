import { Graph } from "derivation";
import { Reactive } from "./reactive.js";
import { ZSet } from "./z-set.js";
import { Tuple } from "./tuple.js";
import { groupByZSet } from "./z-set-reactive.js";
import { joinZMap, mapValuesZMap, flattenZMap } from "./z-map-reactive.js";

/**
 * Join two reactive ZSets using key selectors and a result selector.
 *
 * This is a higher-level join that:
 * 1. Groups both sets by their respective key selectors
 * 2. Joins the grouped maps on matching keys
 * 3. Applies the result selector to combine matched pairs
 * 4. Flattens back to a ZSet
 */
export function joinZSet<T, TOther, TKey, TResult>(
  graph: Graph,
  left: Reactive<ZSet<T>>,
  right: Reactive<ZSet<TOther>>,
  leftKeySelector: (t: T) => TKey,
  rightKeySelector: (o: TOther) => TKey,
  resultSelector: (t: T, o: TOther) => TResult,
): Reactive<ZSet<TResult>> {
  const leftGrouped = groupByZSet(graph, left, leftKeySelector);
  const rightGrouped = groupByZSet(graph, right, rightKeySelector);

  const joined = joinZMap(graph, leftGrouped, rightGrouped);

  const mapped = mapValuesZMap(
    graph,
    joined,
    (tuple: Tuple<[T, TOther]>) => resultSelector(tuple.get(0), tuple.get(1)),
  );

  return flattenZMap(graph, mapped);
}
