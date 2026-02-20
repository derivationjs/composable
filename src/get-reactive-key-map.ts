import { Graph } from "derivation";
import { Map as IMap } from "immutable";
import { Cell } from "./cell.js";
import { constantCell } from "./constant-cell.js";
import { getSingleMapValue } from "./get-single-map-value.js";
import { joinMap } from "./join-map.js";
import { mapMap } from "./map-reactive.js";
import { Operable } from "./operations.js";
import { projectTuple } from "./project-tuple.js";
import { Reactive } from "./reactive.js";
import { reactiveSingletonMap, singletonMap } from "./singleton-map.js";
import { Tuple } from "./tuple.js";

const SOURCE_ID = "value" as const;
const SELECTOR_ID = "selected" as const;

/**
 * Select a value from a reactive map using a reactive key.
 */
export function getReactiveKeyMap<
  K extends NonNullable<unknown>,
  V extends Operable,
>(
  graph: Graph,
  source: Reactive<IMap<K, V>>,
  key: Reactive<Cell<K>>,
  defaultValue: V,
): Reactive<V> {
  const sourceSingletons = mapMap(graph, source, (valueRx) =>
    singletonMap(graph, SOURCE_ID, valueRx),
  );

  const selectedMarker = constantCell(graph, true);
  const selectorInner = singletonMap(graph, SELECTOR_ID, selectedMarker);
  const selectorByKey = reactiveSingletonMap(graph, key, selectorInner);

  const joined = joinMap(graph, sourceSingletons, selectorByKey);

  const selectedInner = getSingleMapValue(
    graph,
    joined,
    IMap<
      Tuple<[typeof SOURCE_ID, typeof SELECTOR_ID]>,
      Tuple<[V, Cell<boolean>]>
    >(),
  );

  const selectedTuple = getSingleMapValue(
    graph,
    selectedInner,
    Tuple(defaultValue, selectedMarker.previousSnapshot),
  );

  return projectTuple(graph, selectedTuple, 0);
}
