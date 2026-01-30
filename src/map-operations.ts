import { Map as IMap } from "immutable";
import { OperationsBase, Operations, asBase, Changes } from "./operations.js";

/**
 * Commands for manipulating an Immutable.Map
 */
export type MapCommand<K, V> =
  | { type: "add"; key: K; value: V } // Must be an unused key
  | { type: "update"; key: K; command: Changes<V> }
  | { type: "delete"; key: K }
  | { type: "clear" };

/**
 * Operations implementation for Immutable.Map
 */
export class MapOperations<K, V>
  implements OperationsBase<IMap<K, V>, MapCommand<K, V>[]>
{
  constructor(private valueOps: Operations<V>) {}

  get valueOperations(): Operations<V> {
    return this.valueOps;
  }

  apply(state: IMap<K, V>, commands: MapCommand<K, V>[]): IMap<K, V> {
    return commands.reduce((s, cmd) => {
      switch (cmd.type) {
        case "add":
          return s.set(cmd.key, cmd.value);
        case "update": {
          const item = s.get(cmd.key);
          if (item === undefined) return s;
          const newItem = asBase(this.valueOps).apply(item, cmd.command);
          return s.set(cmd.key, newItem);
        }
        case "delete":
          return s.delete(cmd.key);
        case "clear":
          return IMap();
        default:
          return s;
      }
    }, state);
  }

  emptyCommand(): MapCommand<K, V>[] {
    return [];
  }

  isEmpty(commands: MapCommand<K, V>[]): boolean {
    return commands.length === 0;
  }

  mergeCommands(
    firstCommand: MapCommand<K, V>[],
    secondCommand: MapCommand<K, V>[],
  ): MapCommand<K, V>[] {
    return [...firstCommand, ...secondCommand];
  }

  replaceCommand(value: IMap<K, V>): MapCommand<K, V>[] {
    const cmds: MapCommand<K, V>[] = [{ type: "clear" }];
    for (const [k, v] of value.entries()) {
      cmds.push({ type: "add", key: k, value: v });
    }
    return cmds;
  }
}
