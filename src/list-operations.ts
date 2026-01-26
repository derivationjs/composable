import { List } from "immutable";
import { OperationsBase, Operations, asBase } from "./operations.js";

/**
 * Commands for manipulating an Immutable.List
 */
export type ListCommand<T> =
  | { type: "insert"; index: number; value: T }
  | { type: "update"; index: number; command: unknown }
  | { type: "remove"; index: number }
  | { type: "move"; from: number; to: number }
  | { type: "clear" };

/**
 * Operations implementation for Immutable.List
 */
export class ListOperations<T> implements OperationsBase<List<T>> {
  constructor(private itemOps: Operations<T>) {}

  get itemOperations(): Operations<T> {
    return this.itemOps;
  }

  unsafeUpdateItemOperations(itemOps: Operations<T>): void {
    this.itemOps = itemOps;
  }

  apply(state: List<T>, command: unknown): List<T> {
    const commands = command as Array<ListCommand<T>>;

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

  emptyCommand(): unknown {
    return [];
  }

  isEmpty(command: unknown): boolean {
    const commands = command as Array<ListCommand<T>>;
    return commands.length === 0;
  }

  mergeCommands(firstCommand: unknown, secondCommand: unknown): unknown {
    const firstCommands = firstCommand as Array<ListCommand<T>>;
    const secondCommands = secondCommand as Array<ListCommand<T>>;
    return [...firstCommands, ...secondCommands];
  }
}
