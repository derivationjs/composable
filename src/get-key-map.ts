import { Graph, ReactiveValue } from "derivation";
import { Map as IMap, is } from "immutable";
import { Reactive } from "./reactive.js";
import { Changes, asBase } from "./operations.js";

/**
 * Extract a specific key from a reactive Map, producing a Reactive of the value type.
 */
export function getKeyMap<K, V>(
  graph: Graph,
  source: Reactive<IMap<K, V>>,
  key: K,
  defaultValue: V,
): Reactive<V> {
  const mapOps = source.operations;
  const valueOps = mapOps.valueOperations;
  const baseValueOps = asBase(valueOps);

  const changes = source.changes.map((commands) => {
    if (commands === null) return null as Changes<V>;
    let result: Changes<V> = null as Changes<V>;
    for (const cmd of commands) {
      if (cmd.type === "update" && is(cmd.key, key)) {
        result = baseValueOps.mergeCommands(result, cmd.command);
      } else if (cmd.type === "add" && is(cmd.key, key)) {
        result = baseValueOps.replaceCommand(cmd.value);
      } else if (cmd.type === "delete" && is(cmd.key, key)) {
        result = baseValueOps.replaceCommand(defaultValue);
      } else if (cmd.type === "clear") {
        result = baseValueOps.replaceCommand(defaultValue);
      }
    }
    return result;
  });

  const initialSnapshot = source.previousSnapshot.get(key) ?? defaultValue;

  return Reactive.create(graph, valueOps, changes, initialSnapshot);
}
