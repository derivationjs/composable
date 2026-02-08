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
export class LogOperations<T> implements OperationsBase<Log<T>, T[] | null> {
  constructor() {}

  apply(state: Log<T>, command: T[] | null): Log<T> {
    if (command === null) return state;
    const commands = command as Array<LogCommand<T>>;

    return commands.reduce((s, cmd) => {
      return s.append(cmd);
    }, state);
  }

  mergeCommands(firstCommand: T[] | null, secondCommand: T[] | null): T[] | null {
    if (firstCommand === null) return secondCommand;
    if (secondCommand === null) return firstCommand;
    return [...firstCommand, ...secondCommand];
  }

  replaceCommand(_value: Log<T>): T[] | null {
    throw new Error("LogOperations does not support replaceCommand (append-only)");
  }
}
