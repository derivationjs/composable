import { Graph, ReactiveValue } from "derivation";
import { Cell } from "./cell.js";
import { Operations, Changes } from "./operations.js";
import { CellOperations } from "./cell-operations.js";
import { Reactive } from "./reactive.js";

export function mapCell<
  T extends NonNullable<unknown>,
  U extends NonNullable<unknown>,
>(
  graph: Graph,
  source: Reactive<Cell<T>>,
  func: (value: T) => U,
): Reactive<Cell<U>> {
  const operations = new CellOperations<U>();

  const changes = source.changes.map((cmd): U | null => {
    if (cmd === null) return null;
    return func(cmd);
  });

  const initialSnapshot = source.previousSnapshot.map(func);

  return Reactive.create<Cell<U>>(
    graph,
    operations as Operations<Cell<U>>,
    changes as unknown as ReactiveValue<Changes<Cell<U>>>,
    initialSnapshot,
  );
}
