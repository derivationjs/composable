import { describe, it, expect, beforeEach } from "vitest";
import { Graph, inputValue, Input } from "derivation";
import { List } from "immutable";
import { Reactive } from "../reactive.js";
import { Cell } from "../cell.js";
import { CellOperations } from "../cell-operations.js";
import { ListOperations, ListCommand } from "../list-operations.js";
import { decomposeList } from "../decompose-list.js";
import { composeList } from "../compose-list.js";

const numberOps = new CellOperations<number>();

const c = (n: number) => new Cell(n);
const vals = (list: List<Cell<number>>) => list.map((x) => x.value).toArray();

describe("composeList", () => {
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

  it("should round-trip an empty list", () => {
    const [ids, map] = decomposeList(graph, list);
    const composed = composeList(graph, ids, map);
    graph.step();

    expect(vals(composed.snapshot)).toEqual([]);
  });

  it("should round-trip a non-empty initial list", () => {
    const initial = List([c(10), c(20), c(30)]);
    const listWithData = Reactive.create<List<Cell<number>>>(
      graph,
      new ListOperations(numberOps),
      changes,
      initial,
    );

    const [ids, map] = decomposeList(graph, listWithData);
    const composed = composeList(graph, ids, map);
    graph.step();

    expect(vals(composed.snapshot)).toEqual([10, 20, 30]);
  });

  it("should round-trip inserts", () => {
    const [ids, map] = decomposeList(graph, list);
    const composed = composeList(graph, ids, map);
    graph.step();

    changes.push([
      { type: "insert", index: 0, value: c(1) },
      { type: "insert", index: 1, value: c(2) },
    ]);
    graph.step();

    expect(vals(composed.snapshot)).toEqual([1, 2]);
  });

  it("should round-trip updates", () => {
    const [ids, map] = decomposeList(graph, list);
    const composed = composeList(graph, ids, map);
    graph.step();

    changes.push([{ type: "insert", index: 0, value: c(42) }]);
    graph.step();

    changes.push([{ type: "update", index: 0, command: 100 }]);
    graph.step();

    expect(vals(composed.snapshot)).toEqual([100]);
  });

  it("should round-trip insert at beginning", () => {
    const [ids, map] = decomposeList(graph, list);
    const composed = composeList(graph, ids, map);
    graph.step();

    changes.push([
      { type: "insert", index: 0, value: c(1) },
      { type: "insert", index: 1, value: c(2) },
    ]);
    graph.step();

    changes.push([{ type: "insert", index: 0, value: c(0) }]);
    graph.step();

    expect(vals(composed.snapshot)).toEqual([0, 1, 2]);
  });

  it("should round-trip moves", () => {
    const [ids, map] = decomposeList(graph, list);
    const composed = composeList(graph, ids, map);
    graph.step();

    changes.push([
      { type: "insert", index: 0, value: c(1) },
      { type: "insert", index: 1, value: c(2) },
      { type: "insert", index: 2, value: c(3) },
    ]);
    graph.step();

    changes.push([{ type: "move", from: 0, to: 2 }]);
    graph.step();

    expect(vals(composed.snapshot)).toEqual([2, 3, 1]);
  });

  it("should round-trip removes", () => {
    const [ids, map] = decomposeList(graph, list);
    const composed = composeList(graph, ids, map);
    graph.step();

    changes.push([
      { type: "insert", index: 0, value: c(1) },
      { type: "insert", index: 1, value: c(2) },
      { type: "insert", index: 2, value: c(3) },
    ]);
    graph.step();

    changes.push([{ type: "remove", index: 1 }]);
    graph.step();

    expect(vals(composed.snapshot)).toEqual([1, 3]);
  });

  it("should round-trip clear", () => {
    const [ids, map] = decomposeList(graph, list);
    const composed = composeList(graph, ids, map);
    graph.step();

    changes.push([
      { type: "insert", index: 0, value: c(1) },
      { type: "insert", index: 1, value: c(2) },
    ]);
    graph.step();

    changes.push([{ type: "clear" }]);
    graph.step();

    expect(vals(composed.snapshot)).toEqual([]);
  });

  it("should round-trip multiple commands in one step", () => {
    const [ids, map] = decomposeList(graph, list);
    const composed = composeList(graph, ids, map);
    graph.step();

    changes.push([
      { type: "insert", index: 0, value: c(1) },
      { type: "insert", index: 1, value: c(2) },
      { type: "update", index: 0, command: 10 },
    ]);
    graph.step();

    expect(vals(composed.snapshot)).toEqual([10, 2]);
  });

  it("should round-trip multiple steps of mutations", () => {
    const [ids, map] = decomposeList(graph, list);
    const composed = composeList(graph, ids, map);
    graph.step();

    changes.push([
      { type: "insert", index: 0, value: c(1) },
      { type: "insert", index: 1, value: c(2) },
      { type: "insert", index: 2, value: c(3) },
    ]);
    graph.step();
    expect(vals(composed.snapshot)).toEqual([1, 2, 3]);

    changes.push([{ type: "update", index: 1, command: 20 }]);
    graph.step();
    expect(vals(composed.snapshot)).toEqual([1, 20, 3]);

    changes.push([{ type: "move", from: 2, to: 0 }]);
    graph.step();
    expect(vals(composed.snapshot)).toEqual([3, 1, 20]);

    changes.push([{ type: "remove", index: 1 }]);
    graph.step();
    expect(vals(composed.snapshot)).toEqual([3, 20]);

    changes.push([{ type: "insert", index: 1, value: c(99) }]);
    graph.step();
    expect(vals(composed.snapshot)).toEqual([3, 99, 20]);
  });
});
