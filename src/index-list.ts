import { IndexedList } from "@derivation/indexed-list";
import { List } from "immutable";
import { Graph } from "derivation";
import { Reactive } from "./reactive.js";
import { IndexedListOperations } from "./indexed-list-operations.js";
import { type Operable } from "./operations.js";

export type IndexListOptions<NodeId, T> = {
  compareIds: (a: NodeId, b: NodeId) => number;
  xToNodeId: (value: T) => NodeId;
};

export function indexList<NodeId, T extends Operable>(
  graph: Graph,
  source: Reactive<List<T>>,
  options: IndexListOptions<NodeId, T>,
): Reactive<IndexedList<NodeId, T>> {
  const initial = IndexedList.create<NodeId, T>({
    initialValues: source.previousSnapshot.toArray(),
    compareIds: options.compareIds,
    xToNodeId: options.xToNodeId,
  });

  const ops = new IndexedListOperations<NodeId, T>(source.operations.itemOperations);

  return Reactive.create<IndexedList<NodeId, T>>(
    graph,
    ops,
    source.changes as Reactive<IndexedList<NodeId, T>>["changes"],
    initial,
  );
}
