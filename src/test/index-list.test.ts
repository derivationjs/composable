import { describe, it, expect } from "vitest";
import { Graph, inputValue } from "derivation";
import { List } from "immutable";
import { Reactive } from "../reactive.js";
import { ListOperations, type ListCommand } from "../list-operations.js";
import { CellOperations } from "../cell-operations.js";
import { Cell } from "../cell.js";
import { indexList } from "../index-list.js";
import { deindexList } from "../deindex-list.js";

const c = (n: number) => new Cell(n);

describe("indexList", () => {
  it("converts Reactive<List<T>> to Reactive<IndexedList<NodeId, T>>", () => {
    const graph = new Graph();
    const changes = inputValue(graph, [] as ListCommand<Cell<number>>[]);
    const source = Reactive.create<List<Cell<number>>>(
      graph,
      new ListOperations(new CellOperations<number>()),
      changes,
      List([c(10), c(20)]),
    );

    const indexed = indexList(graph, source, {
      compareIds: (a, b) => (a < b ? -1 : a > b ? 1 : 0),
      firstId: 0n,
      nextId: (id) => id + 1n,
      xToNodeId: (x) => BigInt(x.value),
    });
    graph.step();

    expect(indexed.snapshot.size()).toBe(2n);
    expect(indexed.snapshot.valueAt(0)?.value).toBe(10);
    expect(indexed.snapshot.valueAt(1)?.value).toBe(20);

    changes.push([{ type: "insert", index: 1, value: c(15) }]);
    graph.step();

    expect(indexed.snapshot.valueAt(0)?.value).toBe(10);
    expect(indexed.snapshot.valueAt(1)?.value).toBe(15);
    expect(indexed.snapshot.valueAt(2)?.value).toBe(20);
  });

  it("accepts a custom xToNodeId function", () => {
    const graph = new Graph();
    const changes = inputValue(graph, [] as ListCommand<Cell<number>>[]);
    const source = Reactive.create<List<Cell<number>>>(
      graph,
      new ListOperations(new CellOperations<number>()),
      changes,
      List([c(10), c(20), c(30)]),
    );

    const indexed = indexList(graph, source, {
      compareIds: (a, b) => a.localeCompare(b),
      firstId: "id-0",
      nextId: (id) => `${id}!`,
      xToNodeId: (x) => `id-${x.value}`,
    });
    graph.step();

    expect(indexed.snapshot.isBefore("id-10", "id-20")).toBe(true);
    expect(indexed.snapshot.isBefore("id-20", "id-30")).toBe(true);
  });

  it("round-trips back to Reactive<List<T>> with deindexList", () => {
    const graph = new Graph();
    const changes = inputValue(graph, [] as ListCommand<Cell<number>>[]);
    const source = Reactive.create<List<Cell<number>>>(
      graph,
      new ListOperations(new CellOperations<number>()),
      changes,
      List([c(1), c(2), c(3)]),
    );

    const indexed = indexList(graph, source, {
      compareIds: (a, b) => (a < b ? -1 : a > b ? 1 : 0),
      firstId: 0n,
      nextId: (id) => id + 1n,
      xToNodeId: (x) => BigInt(x.value),
    });
    const deindexed = deindexList(graph, indexed);
    graph.step();

    expect(deindexed.snapshot.map((x) => x.value).toArray()).toEqual([1, 2, 3]);

    changes.push([{ type: "insert", index: 1, value: c(9) }]);
    graph.step();
    expect(deindexed.snapshot.map((x) => x.value).toArray()).toEqual([1, 9, 2, 3]);

    changes.push([{ type: "move", from: 3, to: 0 }]);
    graph.step();
    expect(deindexed.snapshot.map((x) => x.value).toArray()).toEqual([3, 1, 9, 2]);

    changes.push([{ type: "update", index: 2, command: 99 }]);
    graph.step();
    expect(deindexed.snapshot.map((x) => x.value).toArray()).toEqual([3, 1, 99, 2]);
  });
});
