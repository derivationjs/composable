import { Graph, ReactiveValue } from "derivation";
import { Reactive } from "./reactive.js";
import { Changes } from "./operations.js";
import { Log } from "./log.js";
import { LogOperations, type LogCommand } from "./log-operations.js";
import { Operations, asBase } from "./operations.js";

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
    if (command === null) return acc;
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
    if (command === null) return length;
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
    if (cmd === null) return null;
    const commands = cmd as Array<LogCommand<T>>;
    return commands.map(func);
  });

  // Initial snapshot: map all entries in the initial log
  const initialSnapshot = new Log<U>(
    source.previousSnapshot.toArray().map(func),
  );

  return Reactive.create<Log<U>>(graph, operations, changes, initialSnapshot);
}

/**
 * Apply a log of commands to produce a Reactive value.
 * Each log entry is a command that gets applied using the provided operations.
 * Uses incremental computation to apply only new commands.
 */
export function applyLog<T>(
  graph: Graph,
  source: Reactive<Log<Changes<T>>>,
  operations: Operations<T>,
  initial: T,
): Reactive<T> {
  // Apply all historical commands to build initial state
  const initialSnapshot = source.previousSnapshot
    .toArray()
    .reduce(
      (state: T, command: Changes<T>) =>
        asBase(operations).apply(state, command),
      initial,
    );

  // When log entries are added, merge them into a single command
  const changes = source.changes.map((cmd) => {
    if (cmd === null) return null as Changes<T>;
    return cmd.reduce(
      (acc: Changes<T>, command: Changes<T>) =>
        asBase(operations).mergeCommands(acc, command),
      null as Changes<T>,
    );
  });

  return Reactive.create(graph, operations, changes, initialSnapshot);
}

export function applyLogSequential<T, X>(
  graph: Graph,
  source: Reactive<Log<X>>,
  operations: Operations<T>,
  initial: T,
  f: (state: T, event: X) => Changes<T>,
): Reactive<T> {
  // Process all initial events to build initial snapshot
  const initialSnapshot = source.previousSnapshot
    .toArray()
    .reduce((state, event) => {
      const command = f(state, event);
      return asBase(operations).apply(state, command);
    }, initial);

  // Use accumulate to track state and generate commands
  const accumulated = source.changes.accumulate(
    {
      state: initialSnapshot,
      command: null as Changes<T>,
    },
    (acc, cmd) => {
      if (cmd === null) return { state: acc.state, command: null as Changes<T> };
      const events = cmd as Array<X>;

      return events.reduce(
        (current, event) => {
          const command = f(current.state, event);
          const mergedCommand = asBase(operations).mergeCommands(
            current.command,
            command,
          );
          const state = asBase(operations).apply(current.state, command);
          return { state, command: mergedCommand };
        },
        { state: acc.state, command: null as Changes<T> },
      );
    },
  );

  // Extract just the command from the accumulated state
  const changes = accumulated.map((acc) => acc.command);

  return Reactive.create(graph, operations, changes, initialSnapshot);
}
