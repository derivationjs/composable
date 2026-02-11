import { List, Map as IMap } from "immutable";
import { Graph } from "derivation";
import { Reactive } from "./reactive.js";
import { decomposeList, ID } from "./decompose-list.js";
import { MapOperations } from "./map-operations.js";
import { ListOperations } from "./list-operations.js";
import { mapMap } from "./map-reactive.js";

function materializeGroupedList<X, K>(
  ids: List<ID>,
  values: IMap<ID, X>,
  keys: IMap<ID, K>,
): IMap<K, List<X>> {
  let grouped = IMap<K, List<X>>();
  for (const id of ids) {
    const key = keys.get(id);
    const value = values.get(id);
    if (key === undefined || value === undefined) continue;
    const existing = grouped.get(key) ?? List<X>();
    grouped = grouped.set(key, existing.push(value));
  }
  return grouped;
}

/**
 * Groups a Reactive<List<X>> into a Reactive<Map<K, List<X>>> based on a key function.
 *
 * Items are grouped by the key returned by the key function. When an item's key changes,
 * it moves from one group to another. Groups are created/deleted as needed.
 */
export function groupByList<X, K>(
  graph: Graph,
  list: Reactive<List<X>>,
  keyFn: (x: Reactive<X>) => Reactive<K>,
): Reactive<IMap<K, List<X>>> {
  // TODO: Make this fully incremental/stateful by emitting group-level deltas
  // rather than rebuilding all groups and using a full replace command.
  const [structure, valuesMap] = decomposeList(graph, list);
  const keysMap = mapMap(graph, valuesMap, keyFn);

  const initialGroups = materializeGroupedList(
    structure.previousSnapshot,
    valuesMap.previousSnapshot,
    keysMap.previousSnapshot,
  );

  const materialized = structure.materialized
    .zip(valuesMap.materialized, (ids, values) => ({ ids, values }))
    .zip(keysMap.materialized, ({ ids, values }, keys) =>
      materializeGroupedList(ids, values, keys),
    );

  const listOps = new ListOperations(list.operations.itemOperations);
  const mapOps = new MapOperations<K, List<X>>(listOps);
  const allChanges = materialized
    .delay(initialGroups)
    .zip(materialized, (previous, current) => {
      if (previous.equals(current)) return null;
      return mapOps.replaceCommand(current);
    });

  return Reactive.create<IMap<K, List<X>>>(
    graph,
    mapOps,
    allChanges,
    initialGroups,
  );
}
