import { ReactiveValue } from "derivation";
import { Reactive } from "./reactive.js";

/**
 * Flattens a ReactiveValue<Reactive<X>> into a Reactive<X>.
 *
 * When the outer ReactiveValue changes to a new Reactive<X>,
 * the result switches to follow the new inner Reactive.
 */
export function joinReactive<X>(
  outer: ReactiveValue<Reactive<X>>,
): Reactive<X> {
  const materialized = outer.map((r) => r.materialized).flatten();
  const previousMaterialized = outer
    .map((r) => r.previousMaterialized)
    .flatten();
  const changes = outer.map((r) => r.changes).flatten();
  const operations = outer.value.operations;
  return new Reactive(materialized, previousMaterialized, changes, operations);
}
