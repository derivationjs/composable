import { OperationsBase, Changes } from "./operations.js";
import { Tuple } from "./tuple.js";

/**
 * Command for manipulating a Tuple<T>.
 * An array of per-element commands, where command[i] is applied to element i.
 */
export type TupleCommand<T extends readonly unknown[]> = {
  [K in keyof T]: Changes<T[K]>;
};

export class TupleOperations<T extends readonly unknown[]>
  implements OperationsBase<Tuple<T>, TupleCommand<T>>
{
  private ops: OperationsBase<unknown, unknown>[];

  constructor(
    ...ops: { [K in keyof T]: OperationsBase<T[K], unknown> } & unknown[]
  ) {
    this.ops = ops as unknown as OperationsBase<unknown, unknown>[];
  }

  apply(state: Tuple<T>, command: TupleCommand<T>): Tuple<T> {
    const cmds = command as TupleCommand<T>;
    let result = state;
    for (let i = 0; i < this.ops.length; i++) {
      if (!this.ops[i].isEmpty(cmds[i]))
        result = (result as any).set(
          i,
          this.ops[i].apply((result as any).get(i), cmds[i]),
        );
    }
    return result;
  }

  emptyCommand(): TupleCommand<T> {
    return this.ops.map((o) => o.emptyCommand()) as TupleCommand<T>;
  }

  isEmpty(command: TupleCommand<T>): boolean {
    const cmds = command as TupleCommand<T>;
    return this.ops.every((o, i) => o.isEmpty(cmds[i]));
  }

  mergeCommands(
    first: TupleCommand<T>,
    second: TupleCommand<T>,
  ): TupleCommand<T> {
    return this.ops.map((o, i) =>
      o.mergeCommands(first[i], second[i]),
    ) as TupleCommand<T>;
  }

  replaceCommand(value: Tuple<T>): TupleCommand<T> {
    return this.ops.map((o, i) =>
      o.replaceCommand((value as any).get(i)),
    ) as TupleCommand<T>;
  }
}
