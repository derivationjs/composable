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
export class LogOperations<T> implements OperationsBase<Log<T>, T[]> {
  constructor() {}

  apply(state: Log<T>, command: T[]): Log<T> {
    const commands = command as Array<LogCommand<T>>;

    return commands.reduce((s, cmd) => {
      return s.append(cmd);
    }, state);
  }

  emptyCommand(): T[] {
    return [];
  }

  isEmpty(command: T[]): boolean {
    const commands = command as Array<LogCommand<T>>;
    return commands.length === 0;
  }

  mergeCommands(firstCommand: T[], secondCommand: T[]): T[] {
    return [...firstCommand, ...secondCommand];
  }

  replaceCommand(_value: Log<T>): T[] {
    throw new Error("LogOperations does not support replaceCommand (append-only)");
  }
}
