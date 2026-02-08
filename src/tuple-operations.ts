import { OperationsBase, Operations, Changes } from "./operations.js";
import { Tuple } from "./tuple.js";

/**
 * Command for manipulating a Tuple<T>.
 * An array of per-element commands, where command[i] is applied to element i.
 */
export type TupleCommand<T extends readonly unknown[]> = {
  [K in keyof T]: Changes<T[K]>;
};

export class TupleOperations<T extends readonly unknown[]>
  implements OperationsBase<Tuple<T>, TupleCommand<T> | null>
{
  private ops: OperationsBase<unknown, unknown>[];

  constructor(
    ...ops: { [K in keyof T]: OperationsBase<T[K], unknown> } & unknown[]
  ) {
    this.ops = ops as unknown as OperationsBase<unknown, unknown>[];
  }

  elementOperations<I extends number & keyof T>(index: I): Operations<T[I]> {
    return this.ops[index] as Operations<T[I]>;
  }

  apply(state: Tuple<T>, command: TupleCommand<T> | null): Tuple<T> {
    if (command === null) return state;
    let result = state;
    for (let i = 0; i < this.ops.length; i++) {
      if (command[i] !== null)
        result = (result as any).set(
          i,
          this.ops[i].apply((result as any).get(i), command[i]),
        );
    }
    return result;
  }

  mergeCommands(
    first: TupleCommand<T> | null,
    second: TupleCommand<T> | null,
  ): TupleCommand<T> | null {
    if (first === null) return second;
    if (second === null) return first;
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
