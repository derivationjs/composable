import { describe, it, expect, beforeEach } from "vitest";
import { Graph, inputValue, Input } from "derivation";
import { List } from "immutable";
import { Reactive } from "../reactive.js";
import { Cell } from "../cell.js";
import { CellOperations } from "../cell-operations.js";
import { ListOperations, ListCommand } from "../list-operations.js";
import { sortList } from "../index.js";

const numberOps = new CellOperations<number>();
const c = (n: number) => new Cell(n);
const values = (list: List<Cell<number>>) => list.map((x) => x.value).toArray();
const byValue = (left: Cell<number>, right: Cell<number>) => left.value - right.value;

describe("sortList", () => {
  let graph: Graph;
  let changes: Input<ListCommand<Cell<number>>[]>;
  let list: Reactive<List<Cell<number>>>;

  beforeEach(() => {
    graph = new Graph();
    changes = inputValue(graph, [] as ListCommand<Cell<number>>[]);
    list = Reactive.create<List<Cell<number>>>(
      graph,
      new ListOperations(numberOps),
      changes,
      List<Cell<number>>(),
    );
  });

  it("sorts the initial list", () => {
    const listWithData = Reactive.create<List<Cell<number>>>(
      graph,
      new ListOperations(numberOps),
      changes,
      List([c(3), c(1), c(2)]),
    );

    const sorted = sortList(graph, listWithData, byValue);
    graph.step();

    expect(values(sorted.snapshot)).toEqual([1, 2, 3]);
  });

  it("recomputes sorted order when an item is inserted", () => {
    const sorted = sortList(graph, list, byValue);
    graph.step();

    changes.push([
      { type: "insert", index: 0, value: c(30) },
      { type: "insert", index: 1, value: c(10) },
    ]);
    graph.step();
    expect(values(sorted.snapshot)).toEqual([10, 30]);

    changes.push([{ type: "insert", index: 1, value: c(20) }]);
    graph.step();

    expect(values(sorted.snapshot)).toEqual([10, 20, 30]);
  });

  it("recomputes sorted order when an update changes rank", () => {
    const listWithData = Reactive.create<List<Cell<number>>>(
      graph,
      new ListOperations(numberOps),
      changes,
      List([c(1), c(2), c(3)]),
    );

    const sorted = sortList(graph, listWithData, byValue);
    graph.step();
    expect(values(sorted.snapshot)).toEqual([1, 2, 3]);

    changes.push([{ type: "update", index: 0, command: 4 }]);
    graph.step();

    expect(values(sorted.snapshot)).toEqual([2, 3, 4]);
  });

  it("ignores source moves because they do not change comparator order", () => {
    const listWithData = Reactive.create<List<Cell<number>>>(
      graph,
      new ListOperations(numberOps),
      changes,
      List([c(3), c(1), c(2)]),
    );

    const sorted = sortList(graph, listWithData, byValue);
    graph.step();
    expect(values(sorted.snapshot)).toEqual([1, 2, 3]);

    changes.push([{ type: "move", from: 0, to: 2 }]);
    graph.step();

    expect(values(sorted.snapshot)).toEqual([1, 2, 3]);
  });

  it("recomputes when an item is removed", () => {
    const listWithData = Reactive.create<List<Cell<number>>>(
      graph,
      new ListOperations(numberOps),
      changes,
      List([c(3), c(1), c(2)]),
    );

    const sorted = sortList(graph, listWithData, byValue);
    graph.step();
    expect(values(sorted.snapshot)).toEqual([1, 2, 3]);

    changes.push([{ type: "remove", index: 1 }]);
    graph.step();

    expect(values(sorted.snapshot)).toEqual([2, 3]);
  });

  it("recomputes to an empty list on clear", () => {
    const listWithData = Reactive.create<List<Cell<number>>>(
      graph,
      new ListOperations(numberOps),
      changes,
      List([c(3), c(1), c(2)]),
    );

    const sorted = sortList(graph, listWithData, byValue);
    graph.step();
    expect(values(sorted.snapshot)).toEqual([1, 2, 3]);

    changes.push([{ type: "clear" }]);
    graph.step();

    expect(values(sorted.snapshot)).toEqual([]);
  });
});
