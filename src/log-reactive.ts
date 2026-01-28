import { Graph, ReactiveValue } from "derivation";
import { Reactive } from "./reactive.js";
import { Log } from "./log.js";
import { LogOperations, type LogCommand } from "./log-operations.js";
import { ZSet } from "./z-set.js";
import { ZSetOperations } from "./z-set-operations.js";

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
      return reducer(result, cmd);
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

/**
 * Map over a reactive Log, transforming each entry.
 * Uses incremental computation to only map new entries.
 */
export function mapLog<T, U>(
  graph: Graph,
  source: Reactive<Log<T>>,
  func: (item: T) => U,
): Reactive<Log<U>> {
  const operations = new LogOperations<U>();

  // When log entries are added, map the new entries
  const changes = source.changes.map((cmd) => {
    const commands = cmd as Array<LogCommand<T>>;
    return commands.map(func);
  });

  // Initial snapshot: map all entries in the initial log
  const initialSnapshot = new Log<U>(
    source.previousSnapshot.toArray().map(func)
  );

  return Reactive.create(graph, operations, changes, initialSnapshot);
}

/**
 * Flatten a reactive Log of ZSets into a single reactive ZSet.
 * Unions all ZSets in the log together.
 * Uses incremental computation to union only new entries.
 */
export function unionLogOfZSets<T>(
  graph: Graph,
  source: Reactive<Log<ZSet<T>>>,
): Reactive<ZSet<T>> {
  const operations = new ZSetOperations<T>();

  // When log entries are added, union all the new ZSets together
  const changes = source.changes.map((cmd) => {
    const commands = cmd as Array<ZSet<T>>;
    return commands.reduce((acc, zset) => acc.union(zset), new ZSet<T>());
  });

  // Initial snapshot: union all ZSets in the initial log
  const initialSnapshot = source.previousSnapshot
    .toArray()
    .reduce((acc, zset) => acc.union(zset), new ZSet<T>());

  return Reactive.create(graph, operations, changes, initialSnapshot);
}
