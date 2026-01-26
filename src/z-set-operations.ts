import { ZSet } from "./z-set.js";
import { OperationsBase } from "./operations.js";

export type ZSetCommand<T> = ZSet<T>;

export class ZSetOperations<T> implements OperationsBase<ZSet<T>> {
  constructor() {}

  apply(state: ZSet<T>, command: unknown): ZSet<T> {
    return state.union(command as ZSet<T>);
  }

  emptyCommand(): unknown {
    return new ZSet();
  }

  isEmpty(command: unknown): boolean {
    return (command as ZSet<T>).length === 0;
  }

  mergeCommands(firstCommand: unknown, secondCommand: unknown): unknown {
    return (firstCommand as ZSet<T>).union(secondCommand as ZSet<T>);
  }
}
