import { Graph, constantValue } from "derivation";
import { Cell } from "./cell.js";
import { CellOperations } from "./cell-operations.js";
import { Reactive } from "./reactive.js";

/**
 * Creates a constant reactive Cell with no emitted changes.
 */
export function constantCell<T extends NonNullable<unknown>>(
  graph: Graph,
  value: T,
): Reactive<Cell<T>> {
  return Reactive.create<Cell<T>>(
    graph,
    new CellOperations<T>(),
    constantValue(graph, null as T | null),
    new Cell(value),
  );
}
