import { List } from "immutable";
import { Graph, ReactiveValue, constantValue } from "derivation";
import { Reactive } from "./reactive.js";
import { decomposeList } from "./decompose-list.js";
import { composeList } from "./compose-list.js";
import { mapMap } from "./map-reactive.js";

/**
 * Converts a List of reactive values into a reactive List.
 *
 * This "sequences" the reactive values - whenever any of the inner
 * reactive values change, the outer reactive list updates.
 */
export function sequenceList<X>(
  graph: Graph,
  list: List<ReactiveValue<X>>,
): ReactiveValue<List<X>> {
  return list.reduce(
    (acc: ReactiveValue<List<X>>, rv: ReactiveValue<X>) => {
      return acc.zip(rv, (list, x) => list.push(x));
    },
    constantValue(graph, List()),
  );
}

export function mapList<X, Y>(
  graph: Graph,
  list: Reactive<List<X>>,
  f: (x: Reactive<X>) => Reactive<Y>,
): Reactive<List<Y>> {
  const [structure, map] = decomposeList(graph, list);
  const mappedMap = mapMap(graph, map, f);
  return composeList(graph, structure, mappedMap);
}
