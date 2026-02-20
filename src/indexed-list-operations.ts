import { IndexedList } from "@derivation/indexed-list";
import { OperationsBase, Operations, asBase } from "./operations.js";
import { type ListCommand } from "./list-operations.js";

/**
 * Operations implementation for @derivation/indexed-list.
 */
export class IndexedListOperations<NodeId, T>
  implements OperationsBase<IndexedList<NodeId, T>, ListCommand<T>[] | null>
{
  constructor(private itemOps: Operations<T>) {}

  get itemOperations(): Operations<T> {
    return this.itemOps;
  }

  apply(
    state: IndexedList<NodeId, T>,
    commands: ListCommand<T>[] | null,
  ): IndexedList<NodeId, T> {
    if (commands === null) return state;
    return commands.reduce((s, cmd) => {
      switch (cmd.type) {
        case "insert":
          return s.insertAt(cmd.index, cmd.value)[0];
        case "update": {
          const item = s.valueAt(cmd.index);
          if (item === undefined) return s;
          const newItem = asBase(this.itemOps).apply(item, cmd.command);
          return s.removeAt(cmd.index).insertAt(cmd.index, newItem)[0];
        }
        case "remove":
          return s.removeAt(cmd.index);
        case "move": {
          const item = s.valueAt(cmd.from);
          if (item === undefined) return s;
          return s.removeAt(cmd.from).insertAt(cmd.to, item)[0];
        }
        case "clear": {
          let next = s;
          for (let i = next.size() - 1n; i >= 0n; i--) {
            next = next.removeAt(i);
            if (i === 0n) break;
          }
          return next;
        }
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

  replaceCommand(value: IndexedList<NodeId, T>): ListCommand<T>[] {
    const cmds: ListCommand<T>[] = [{ type: "clear" }];
    const size = value.size();
    for (let i = 0n; i < size; i++) {
      const item = value.valueAt(i);
      if (item !== undefined) {
        cmds.push({ type: "insert", index: Number(i), value: item });
      }
    }
    return cmds;
  }
}
