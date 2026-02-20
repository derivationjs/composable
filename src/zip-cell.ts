import { Graph, ReactiveValue } from "derivation";
import { Cell } from "./cell.js";
import { Operations, Changes } from "./operations.js";
import { CellOperations } from "./cell-operations.js";
import { Reactive } from "./reactive.js";

export function zipCell<
  A extends NonNullable<unknown>,
  B extends NonNullable<unknown>,
  R extends NonNullable<unknown>,
>(
  graph: Graph,
  sourceA: Reactive<Cell<A>>,
  sourceB: Reactive<Cell<B>>,
  func: (a: A, b: B) => R,
): Reactive<Cell<R>> {
  const operations = new CellOperations<R>();

  const materialized = sourceA.materialized.zip(
    sourceB.materialized,
    (a, b) => {
      return new Cell(func(a.value, b.value));
    },
  );

  const previousMaterialized = materialized.delay(materialized.value);

  const changes = materialized.zip(previousMaterialized, (curr, prev) => {
    if (curr.equals(prev)) return null;
    return curr.value;
  });

  return new Reactive(materialized, previousMaterialized, changes, operations);
}
