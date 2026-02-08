import { Graph, ReactiveValue } from "derivation";
import { Changes } from "./operations.js";
import { Reactive } from "./reactive.js";
import { Tuple } from "./tuple.js";

/**
 * Project a single element from a Reactive<Tuple<T>>, producing a Reactive<T[I]>.
 * Changes to other elements are filtered out.
 */
export function projectTuple<
  T extends readonly unknown[],
  I extends number & keyof T,
>(graph: Graph, source: Reactive<Tuple<T>>, index: I): Reactive<T[I]> {
  const elementOps = source.operations.elementOperations(index);

  const changes = source.changes.map((command) => {
    if (command === null) return null;
    return command[index];
  });

  const initialSnapshot = source.previousSnapshot.get(index);

  return Reactive.create(
    graph,
    elementOps,
    changes as unknown as ReactiveValue<Changes<T[I]>>,
    initialSnapshot,
  );
}
