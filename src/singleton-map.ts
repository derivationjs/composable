import { Graph } from "derivation";
import { Map as IMap } from "immutable";
import { Reactive } from "./reactive.js";
import { MapOperations, MapCommand } from "./map-operations.js";

/**
 * Wrap a key and a reactive value into a reactive singleton map.
 */
export function singletonMap<K, V>(
  graph: Graph,
  key: K,
  source: Reactive<V>,
): Reactive<IMap<K, V>> {
  const valueOps = source.operations;
  const mapOps = new MapOperations<K, V>(valueOps);

  const changes = source.changes.map((cmd): MapCommand<K, V>[] | null => {
    if (cmd === null) {
      return null;
    }
    return [{ type: "update", key, command: cmd }];
  });

  const initial = IMap([[key, source.previousSnapshot]]) as IMap<K, V>;

  return Reactive.create<IMap<K, V>>(graph, mapOps, changes, initial);
}
