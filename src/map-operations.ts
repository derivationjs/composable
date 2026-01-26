import { Map as IMap } from "immutable";
import { OperationsBase, Operations, asBase } from "./operations.js";

/**
 * Commands for manipulating an Immutable.Map
 */
export type MapCommand<K, V> =
  | { type: "set"; key: K; value: V }
  | { type: "update"; key: K; command: unknown }
  | { type: "delete"; key: K }
  | { type: "clear" };

/**
 * Operations implementation for Immutable.Map
 */
export class MapOperations<K, V> implements OperationsBase<IMap<K, V>> {
  constructor(private valueOps: Operations<V>) {}

  get valueOperations(): Operations<V> {
    return this.valueOps;
  }

  unsafeUpdateValueOperations(valueOps: Operations<V>): void {
    this.valueOps = valueOps;
  }

  apply(state: IMap<K, V>, command: unknown): IMap<K, V> {
    const commands = command as Array<MapCommand<K, V>>;

    return commands.reduce((s, cmd) => {
      switch (cmd.type) {
        case "set":
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

  emptyCommand(): unknown {
    return [];
  }

  isEmpty(command: unknown): boolean {
    const commands = command as Array<MapCommand<K, V>>;
    return commands.length === 0;
  }

  mergeCommands(firstCommand: unknown, secondCommand: unknown): unknown {
    const firstCommands = firstCommand as Array<MapCommand<K, V>>;
    const secondCommands = secondCommand as Array<MapCommand<K, V>>;
    return [...firstCommands, ...secondCommands];
  }
}
