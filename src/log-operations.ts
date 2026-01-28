import { Log } from "./log.js";
import { OperationsBase } from "./operations.js";

/**
 * Commands for manipulating a Log.
 * Only append operations are supported to maintain append-only semantics.
 */
export type LogCommand<T> = T;

/**
 * Operations implementation for append-only Log.
 */
export class LogOperations<T> implements OperationsBase<Log<T>> {
  constructor() {}

  apply(state: Log<T>, command: unknown): Log<T> {
    const commands = command as Array<LogCommand<T>>;

    return commands.reduce((s, cmd) => {
      return s.append(cmd);
    }, state);
  }

  emptyCommand(): unknown {
    return [];
  }

  isEmpty(command: unknown): boolean {
    const commands = command as Array<LogCommand<T>>;
    return commands.length === 0;
  }

  mergeCommands(firstCommand: unknown, secondCommand: unknown): unknown {
    const firstCommands = firstCommand as Array<LogCommand<T>>;
    const secondCommands = secondCommand as Array<LogCommand<T>>;
    return [...firstCommands, ...secondCommands];
  }
}
