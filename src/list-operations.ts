import { List } from "immutable";
import { OperationsBase, Operations, asBase, Changes } from "./operations.js";

/**
 * Commands for manipulating an Immutable.List
 */
export type ListCommand<T> =
  | { type: "insert"; index: number; value: T }
  | { type: "update"; index: number; command: Changes<T> }
  | { type: "remove"; index: number }
  | { type: "move"; from: number; to: number }
  | { type: "clear" };

/**
 * Operations implementation for Immutable.List
 */
export class ListOperations<T>
  implements OperationsBase<List<T>, ListCommand<T>[]>
{
  constructor(private itemOps: Operations<T>) {}

  get itemOperations(): Operations<T> {
    return this.itemOps;
  }

  apply(state: List<T>, commands: ListCommand<T>[]): List<T> {
    return commands.reduce((s, cmd) => {
      switch (cmd.type) {
        case "insert":
          return s.insert(cmd.index, cmd.value);
        case "update": {
          const item = s.get(cmd.index);
          if (item === undefined) return s;
          const newItem = asBase(this.itemOps).apply(item, cmd.command);
          return s.set(cmd.index, newItem);
        }
        case "remove":
          return s.remove(cmd.index);
        case "move": {
          const item = s.get(cmd.from);
          if (item === undefined) return s;
          return s.remove(cmd.from).insert(cmd.to, item);
        }
        case "clear":
          return List();
        default:
          return s;
      }
    }, state);
  }

  emptyCommand(): ListCommand<T>[] {
    return [];
  }

  isEmpty(command: ListCommand<T>[]): boolean {
    return command.length === 0;
  }

  mergeCommands(
    firstCommand: ListCommand<T>[],
    secondCommand: ListCommand<T>[],
  ): ListCommand<T>[] {
    return [...firstCommand, ...secondCommand];
  }

  replaceCommand(value: List<T>): ListCommand<T>[] {
    const cmds: ListCommand<T>[] = [{ type: "clear" }];
    value.forEach((v, i) => {
      cmds.push({ type: "insert", index: i, value: v });
    });
    return cmds;
  }
}
