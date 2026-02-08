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
  implements OperationsBase<List<T>, ListCommand<T>[] | null>
{
  constructor(private itemOps: Operations<T>) {}

  get itemOperations(): Operations<T> {
    return this.itemOps;
  }

  apply(state: List<T>, commands: ListCommand<T>[] | null): List<T> {
    if (commands === null) return state;
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

  mergeCommands(
    firstCommand: ListCommand<T>[] | null,
    secondCommand: ListCommand<T>[] | null,
  ): ListCommand<T>[] | null {
    if (firstCommand === null) return secondCommand;
    if (secondCommand === null) return firstCommand;
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
