import { Graph, ReactiveValue } from "derivation";
import { Operations, Primitive, Changes } from "./operations.js";
import { PrimitiveOperations } from "./primitive-operations.js";
import { Reactive } from "./reactive.js";

export function mapPrimitive<
  T extends NonNullable<unknown>,
  U extends NonNullable<unknown>,
>(
  graph: Graph,
  source: Reactive<T>,
  func: (value: T) => U,
  ..._check: [Primitive<T>] extends [never]
    ? [error: "T must be a primitive type, not a collection"]
    : [Primitive<U>] extends [never]
      ? [error: "U must be a primitive type, not a collection"]
      : []
): Reactive<U> {
  const operations = new PrimitiveOperations<U>();

  const changes = source.changes.map((cmd) =>
    cmd === null ? null : func(cmd as unknown as T),
  );

  const initialSnapshot = func(source.previousSnapshot);

  return Reactive.create(
    graph,
    operations as Operations<U>,
    changes as unknown as ReactiveValue<Changes<U>>,
    initialSnapshot,
  );
}
