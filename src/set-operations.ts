import { Set as ISet } from "immutable";
import { OperationsBase } from "./operations.js";

/**
 * Commands for manipulating an Immutable.Set
 */
export type SetCommand<T> =
  | { type: "add"; value: T }
  | { type: "delete"; value: T }
  | { type: "clear" };

/**
 * Operations implementation for Immutable.Set
 */
export class SetOperations<T> implements OperationsBase<ISet<T>> {
  constructor() {}

  apply(state: ISet<T>, command: unknown): ISet<T> {
    const commands = command as Array<SetCommand<T>>;

    return commands.reduce((s, cmd) => {
      switch (cmd.type) {
        case "add":
          return s.add(cmd.value);
        case "delete":
          return s.delete(cmd.value);
        case "clear":
          return ISet();
        default:
          return s;
      }
    }, state);
  }

  emptyCommand(): unknown {
    return [];
  }

  isEmpty(command: unknown): boolean {
    const commands = command as Array<SetCommand<T>>;
    return commands.length === 0;
  }

  mergeCommands(firstCommand: unknown, secondCommand: unknown): unknown {
    const firstCommands = firstCommand as Array<SetCommand<T>>;
    const secondCommands = secondCommand as Array<SetCommand<T>>;
    return [...firstCommands, ...secondCommands];
  }
}
