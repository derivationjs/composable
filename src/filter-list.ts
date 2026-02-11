import { List, Map as IMap } from "immutable";
import { Graph } from "derivation";
import { Reactive } from "./reactive.js";
import { decomposeList, ID } from "./decompose-list.js";
import { ListOperations } from "./list-operations.js";
import { mapMap } from "./map-reactive.js";

function materializeFilteredList<X>(
  ids: List<ID>,
  values: IMap<ID, X>,
  selected: IMap<ID, boolean>,
): List<X> {
  return List(
    ids
      .filter((id) => selected.get(id) === true)
      .map((id) => values.get(id)!)
      .toArray(),
  );
}

/**
 * Filters a Reactive<List<X>> based on a reactive predicate.
 *
 * The predicate function is called once per item when the item is first inserted.
 * Subsequent updates flow through the per-item reactive predicate.
 */
export function filterList<X>(
  graph: Graph,
  list: Reactive<List<X>>,
  predicate: (x: Reactive<X>) => Reactive<boolean>,
): Reactive<List<X>> {
  // TODO: Make this fully incremental/stateful by emitting minimal list commands
  // instead of materializing the full filtered list and replacing it on changes.
  const [structure, map] = decomposeList(graph, list);
  const selectedMap = mapMap(graph, map, predicate);

  const initialFiltered = materializeFilteredList(
    structure.snapshot,
    map.snapshot,
    selectedMap.snapshot,
  );

  const materialized = structure.materialized
    .zip(map.materialized, (ids, values) => ({ ids, values }))
    .zip(selectedMap.materialized, ({ ids, values }, selected) =>
      materializeFilteredList(ids, values, selected),
    );

  const listOps = new ListOperations(list.operations.itemOperations);
  const changes = materialized
    .delay(initialFiltered)
    .zip(materialized, (previous, current) => {
      if (previous.equals(current)) return null;
      return listOps.replaceCommand(current);
    });

  return Reactive.create<List<X>>(graph, listOps, changes, initialFiltered);
}
