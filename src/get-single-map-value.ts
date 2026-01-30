import { Graph } from "derivation";
import { Map as IMap, is } from "immutable";
import { Reactive } from "./reactive.js";
import { Changes, asBase } from "./operations.js";

/**
 * Extracts the only value from a reactive Map when its size is 1.
 * Falls back to defaultValue when the map has size 0 or >1.
 */
export function getSingleMapValue<K, V>(
  graph: Graph,
  source: Reactive<IMap<K, V>>,
  defaultValue: V,
): Reactive<V> {
  const mapOps = source.operations;
  const baseMapOps = asBase(mapOps);
  const valueOps = mapOps.valueOperations;
  const baseValueOps = asBase(valueOps);

  const valueFromMap = (map: IMap<K, V>): V => {
    if (map.size !== 1) {
      return defaultValue;
    }
    return map.values().next().value as V;
  };

  const changes = source.changes.zip(
    source.previousMaterialized,
    (cmds, prevMap): Changes<V> => {
      const nextMap = baseMapOps.apply(prevMap, cmds);
      if (prevMap.size === 1 && nextMap.size === 1) {
        const prevEntry = prevMap.entries().next().value as [K, V];
        const nextEntry = nextMap.entries().next().value as [K, V];
        const [prevKey, prevVal] = prevEntry;
        const [nextKey, nextVal] = nextEntry;

        if (is(prevKey, nextKey)) {
          let merged = baseValueOps.emptyCommand();
          let sawUpdate = false;
          let structural = false;

          for (const cmd of cmds) {
            switch (cmd.type) {
              case "update": {
                if (is(cmd.key, prevKey)) {
                  sawUpdate = true;
                  merged = baseValueOps.mergeCommands(merged, cmd.command);
                } else {
                  structural = true;
                }
                break;
              }
              case "add":
              case "delete":
              case "clear":
                structural = true;
                break;
            }
          }

          if (!structural) {
            if (!sawUpdate || is(prevVal, nextVal)) {
              return baseValueOps.emptyCommand();
            }
            return merged;
          }
        }
      }

      const prevValue = valueFromMap(prevMap);
      const nextValue = valueFromMap(nextMap);
      if (is(prevValue, nextValue)) {
        return baseValueOps.emptyCommand();
      }
      return baseValueOps.replaceCommand(nextValue);
    },
  );

  const initialSnapshot = valueFromMap(source.previousSnapshot);

  return Reactive.create(graph, valueOps, changes, initialSnapshot);
}
