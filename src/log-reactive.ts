import { Graph, ReactiveValue } from "derivation";
import { Reactive } from "./reactive.js";
import { Log } from "./log.js";
import type { LogCommand } from "./log-operations.js";

/**
 * Create a reactive fold operation over a Log.
 * Reduces all entries in the log to a single accumulated value.
 * Uses incremental computation to only process new entries.
 */
export function foldLog<T, S>(
  graph: Graph,
  source: Reactive<Log<T>>,
  initial: S,
  reducer: (acc: S, item: T) => S,
): ReactiveValue<S> {
  // Start with initial fold over the initial log
  let initialValue = initial;
  for (const item of source.previousSnapshot) {
    initialValue = reducer(initialValue, item);
  }

  // Incrementally fold over changes
  return source.changes.accumulate(initialValue, (acc, command) => {
    const commands = command as Array<LogCommand<T>>;
    return commands.reduce((result, cmd) => {
      if (cmd.type === "append") {
        return reducer(result, cmd.value);
      }
      return result;
    }, acc);
  });
}

/**
 * Create a reactive value tracking the length of a Log.
 * Uses incremental computation to track length changes.
 */
export function lengthLog<T>(
  graph: Graph,
  source: Reactive<Log<T>>,
): ReactiveValue<number> {
  const initialLength = source.previousSnapshot.length;

  return source.changes.accumulate(initialLength, (length, command) => {
    const commands = command as Array<LogCommand<T>>;
    return length + commands.length;
  });
}
