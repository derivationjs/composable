import { describe, it, expect, beforeEach } from "vitest";
import { Graph, inputValue, Input } from "derivation";
import { List } from "immutable";
import { Reactive } from "../reactive.js";
import { Cell } from "../cell.js";
import { CellOperations } from "../cell-operations.js";
import { ListOperations, ListCommand } from "../list-operations.js";
import { mapList } from "../list-reactive.js";
import { mapCell } from "../map-cell.js";

const numberOps = new CellOperations<number>();
const c = (n: number) => new Cell(n);
const vals = (list: List<Cell<number>>) => list.map((x) => x.value).toArray();

describe("mapList", () => {
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

  it("should map empty list to empty list", () => {
    const mapped = mapList(graph, list, (rx) => mapCell(graph, rx, (x) => x * 2));
    graph.step();
    expect(mapped.snapshot.size).toBe(0);
  });

  it("should map initial values", () => {
    const initialList = List([c(1), c(2), c(3)]);
    const listWithData = Reactive.create<List<Cell<number>>>(
      graph,
      new ListOperations(numberOps),
      changes,
      initialList,
    );

    const mapped = mapList(graph, listWithData, (rx) => mapCell(graph, rx, (x) => x * 2));
    graph.step();
    expect(vals(mapped.snapshot)).toEqual([2, 4, 6]);
  });

  it("should handle insert", () => {
    const mapped = mapList(graph, list, (rx) => mapCell(graph, rx, (x) => x * 2));
    graph.step();

    changes.push([{ type: "insert", index: 0, value: c(5) }]);
    graph.step();

    expect(vals(mapped.snapshot)).toEqual([10]);
  });

  it("should handle multiple inserts", () => {
    const mapped = mapList(graph, list, (rx) => mapCell(graph, rx, (x) => x * 2));
    graph.step();

    changes.push([
      { type: "insert", index: 0, value: c(1) },
      { type: "insert", index: 1, value: c(2) },
      { type: "insert", index: 2, value: c(3) },
    ]);
    graph.step();

    expect(vals(mapped.snapshot)).toEqual([2, 4, 6]);
  });

  it("should handle update", () => {
    const initialList = List([c(1), c(2), c(3)]);
    const listWithData = Reactive.create<List<Cell<number>>>(
      graph,
      new ListOperations(numberOps),
      changes,
      initialList,
    );

    const mapped = mapList(graph, listWithData, (rx) => mapCell(graph, rx, (x) => x * 2));
    graph.step();

    expect(vals(mapped.snapshot)).toEqual([2, 4, 6]);

    changes.push([{ type: "update", index: 1, command: 10 }]);
    graph.step();

    expect(vals(mapped.snapshot)).toEqual([2, 20, 6]);
  });

  it("should handle remove", () => {
    const initialList = List([c(1), c(2), c(3)]);
    const listWithData = Reactive.create<List<Cell<number>>>(
      graph,
      new ListOperations(numberOps),
      changes,
      initialList,
    );

    const mapped = mapList(graph, listWithData, (rx) => mapCell(graph, rx, (x) => x * 2));
    graph.step();

    changes.push([{ type: "remove", index: 1 }]);
    graph.step();

    expect(vals(mapped.snapshot)).toEqual([2, 6]);
  });

  it("should handle move", () => {
    const initialList = List([c(1), c(2), c(3)]);
    const listWithData = Reactive.create<List<Cell<number>>>(
      graph,
      new ListOperations(numberOps),
      changes,
      initialList,
    );

    const mapped = mapList(graph, listWithData, (rx) => mapCell(graph, rx, (x) => x * 2));
    graph.step();

    changes.push([{ type: "move", from: 0, to: 2 }]);
    graph.step();

    expect(vals(mapped.snapshot)).toEqual([4, 6, 2]);
  });

  it("should handle clear", () => {
    const initialList = List([c(1), c(2), c(3)]);
    const listWithData = Reactive.create<List<Cell<number>>>(
      graph,
      new ListOperations(numberOps),
      changes,
      initialList,
    );

    const mapped = mapList(graph, listWithData, (rx) => mapCell(graph, rx, (x) => x * 2));
    graph.step();

    changes.push([{ type: "clear" }]);
    graph.step();

    expect(vals(mapped.snapshot)).toEqual([]);
  });

  it("should preserve item identity across structural changes", () => {
    const initialList = List([c(1), c(2), c(3)]);
    const listWithData = Reactive.create<List<Cell<number>>>(
      graph,
      new ListOperations(numberOps),
      changes,
      initialList,
    );

    const mapped = mapList(graph, listWithData, (rx) => mapCell(graph, rx, (x) => x * 2));
    graph.step();

    changes.push([{ type: "insert", index: 0, value: c(0) }]);
    graph.step();

    expect(vals(mapped.snapshot)).toEqual([0, 2, 4, 6]);

    changes.push([{ type: "update", index: 1, command: 10 }]);
    graph.step();

    expect(vals(mapped.snapshot)).toEqual([0, 20, 4, 6]);
  });

  it("should handle remove and update in the same batch correctly", () => {
    const initialList = List([c(1), c(2), c(3)]);
    const listWithData = Reactive.create<List<Cell<number>>>(
      graph,
      new ListOperations(numberOps),
      changes,
      initialList,
    );

    const mapped = mapList(graph, listWithData, (rx) => mapCell(graph, rx, (x) => x * 2));
    graph.step();

    expect(vals(mapped.snapshot)).toEqual([2, 4, 6]);

    changes.push([
      { type: "remove", index: 1 },
      { type: "update", index: 1, command: 10 },
    ]);
    graph.step();

    expect(vals(mapped.snapshot)).toEqual([2, 20]);
  });

  it("should propagate updates through the reactive chain correctly", () => {
    const initialList = List([c(1), c(2), c(3)]);
    const listWithData = Reactive.create<List<Cell<number>>>(
      graph,
      new ListOperations(numberOps),
      changes,
      initialList,
    );

    const mapped = mapList(graph, listWithData, (rx) => mapCell(graph, rx, (x) => x * 2));
    graph.step();

    expect(vals(mapped.snapshot)).toEqual([2, 4, 6]);

    changes.push([
      { type: "update", index: 0, command: 100 },
      { type: "update", index: 1, command: 200 },
      { type: "update", index: 2, command: 300 },
    ]);
    graph.step();

    expect(vals(mapped.snapshot)).toEqual([200, 400, 600]);
  });

  it("should handle async-style mapping where f returns a derived reactive", () => {
    const initialList = List([c(10), c(20), c(30)]);
    const listWithData = Reactive.create<List<Cell<number>>>(
      graph,
      new ListOperations(numberOps),
      changes,
      initialList,
    );

    const mapped = mapList(graph, listWithData, (rx) => mapCell(graph, rx, (x) => x + 1000));
    graph.step();

    expect(vals(mapped.snapshot)).toEqual([1010, 1020, 1030]);

    changes.push([{ type: "update", index: 1, command: 50 }]);
    graph.step();

    expect(vals(mapped.snapshot)).toEqual([1010, 1050, 1030]);
  });

  it("should only call f on insert, not on update or other changes", () => {
    const initialList = List([c(1), c(2), c(3)]);
    const listWithData = Reactive.create<List<Cell<number>>>(
      graph,
      new ListOperations(numberOps),
      changes,
      initialList,
    );

    let fCallCount = 0;

    mapList(graph, listWithData, (rx) => {
      fCallCount++;
      return mapCell(graph, rx, (x) => x * 2);
    });
    graph.step();

    expect(fCallCount).toBe(3);

    changes.push([{ type: "update", index: 0, command: 10 }]);
    graph.step();
    expect(fCallCount).toBe(3);

    changes.push([{ type: "move", from: 0, to: 2 }]);
    graph.step();
    expect(fCallCount).toBe(3);

    changes.push([{ type: "remove", index: 0 }]);
    graph.step();
    expect(fCallCount).toBe(3);

    changes.push([{ type: "insert", index: 0, value: c(99) }]);
    graph.step();
    expect(fCallCount).toBe(4);

    changes.push([
      { type: "insert", index: 0, value: c(100) },
      { type: "insert", index: 1, value: c(101) },
    ]);
    graph.step();
    expect(fCallCount).toBe(6);
  });
});
