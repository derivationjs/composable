import { Map as IMap } from "immutable";
import { Graph } from "derivation";
import { Reactive } from "./reactive.js";
import { MapCommand, MapOperations } from "./map-operations.js";
import { Tuple } from "./tuple.js";
import { type Operations } from "./operations.js";

/**
 * Flattens a Reactive<Map<K1, Map<K2, V>>> into a Reactive<Map<Tuple<[K1, K2]>, V>>.
 * Each (k1, k2) pair in the nested maps becomes a Tuple key in the output map.
 */
export function flattenMap<K1, K2, V>(
  graph: Graph,
  source: Reactive<IMap<K1, IMap<K2, V>>>,
): Reactive<IMap<Tuple<[K1, K2]>, V>> {
  const innerMapOps = source.operations.valueOperations as MapOperations<K2, V>;
  const valueOps = innerMapOps.valueOperations as Operations<V>;
  const operations = new MapOperations<Tuple<[K1, K2]>, V>(valueOps);

  const changes = source.changes.zip(
    source.previousMaterialized,
    (cmd, prevState) => {
      if (cmd === null) return null;
      const commands = cmd as Array<MapCommand<K1, IMap<K2, V>>>;
      const prev = prevState as IMap<K1, IMap<K2, V>>;
      const result: Array<MapCommand<Tuple<[K1, K2]>, V>> = [];

      for (const command of commands) {
        switch (command.type) {
          case "add": {
            for (const [k2, v] of command.value) {
              result.push({
                type: "add",
                key: Tuple(command.key, k2),
                value: v,
              });
            }
            break;
          }
          case "update": {
            const innerCommands = (command.command ?? []) as Array<MapCommand<K2, V>>;
            for (const inner of innerCommands) {
              switch (inner.type) {
                case "add":
                  result.push({
                    type: "add",
                    key: Tuple(command.key, inner.key),
                    value: inner.value,
                  });
                  break;
                case "update":
                  result.push({
                    type: "update",
                    key: Tuple(command.key, inner.key),
                    command: inner.command,
                  });
                  break;
                case "delete":
                  result.push({
                    type: "delete",
                    key: Tuple(command.key, inner.key),
                  });
                  break;
                case "clear": {
                  const prevInner = prev.get(command.key);
                  if (prevInner) {
                    for (const [k2] of prevInner) {
                      result.push({
                        type: "delete",
                        key: Tuple(command.key, k2),
                      });
                    }
                  }
                  break;
                }
              }
            }
            break;
          }
          case "delete": {
            const prevInner = prev.get(command.key);
            if (prevInner) {
              for (const [k2] of prevInner) {
                result.push({ type: "delete", key: Tuple(command.key, k2) });
              }
            }
            break;
          }
          case "clear": {
            result.push({ type: "clear" });
            break;
          }
        }
      }

      return result;
    },
  );

  // Build initial snapshot
  let initialSnapshot = IMap<Tuple<[K1, K2]>, V>();
  const prevSnapshot = source.previousSnapshot as IMap<K1, IMap<K2, V>>;
  for (const [k1, innerMap] of prevSnapshot) {
    for (const [k2, v] of innerMap) {
      initialSnapshot = initialSnapshot.set(Tuple(k1, k2), v);
    }
  }

  return Reactive.create<IMap<Tuple<[K1, K2]>, V>>(
    graph,
    operations,
    changes,
    initialSnapshot,
  );
}
