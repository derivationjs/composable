import { IndexedList } from "@derivation/indexed-list";
import { List } from "immutable";
import { Graph } from "derivation";
import { Reactive } from "./reactive.js";
import { ListOperations } from "./list-operations.js";
import { type Operable } from "./operations.js";

export function deindexList<NodeId, T extends Operable>(
  graph: Graph,
  source: Reactive<IndexedList<NodeId, T>>,
): Reactive<List<T>> {
  let initial = List<T>();
  for (let i = 0n; i < source.previousSnapshot.size(); i++) {
    const value = source.previousSnapshot.valueAt(i);
    if (value !== undefined) {
      initial = initial.push(value);
    }
  }

  const ops = new ListOperations<T>(source.operations.itemOperations);

  return Reactive.create<List<T>>(
    graph,
    ops,
    source.changes as Reactive<List<T>>["changes"],
    initial,
  );
}
