import { ZMap } from "./z-map.js";
import { OperationsBase } from "./operations.js";

export type ZMapCommand<K, V> = ZMap<K, V>;

export class ZMapOperations<K, V> implements OperationsBase<ZMap<K, V>> {
  constructor() {}

  apply(state: ZMap<K, V>, command: unknown): ZMap<K, V> {
    return state.union(command as ZMap<K, V>);
  }

  emptyCommand(): unknown {
    return new ZMap();
  }

  isEmpty(command: unknown): boolean {
    return (command as ZMap<K, V>).length === 0;
  }

  mergeCommands(firstCommand: unknown, secondCommand: unknown): unknown {
    return (firstCommand as ZMap<K, V>).union(secondCommand as ZMap<K, V>);
  }
}
