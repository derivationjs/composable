import { describe, it, expect, beforeEach } from "vitest";
import { Graph, inputValue, Input } from "derivation";
import { List } from "immutable";
import { Reactive } from "../reactive.js";
import { Cell } from "../cell.js";
import { CellOperations } from "../cell-operations.js";
import { ListOperations, ListCommand } from "../list-operations.js";
import { filterList } from "../filter-list.js";

const numberCellOps = new CellOperations<number>();
const numberCell = (value: number) => new Cell(value);
const numberCells = (...values: number[]) => List(values.map(numberCell));
const listNumbers = (list: List<Cell<number>>) => list.map((x) => x.value).toArray();

// Helper to create a reactive predicate
function greaterThan(
  graph: Graph,
  rx: Reactive<Cell<number>>,
  threshold: number,
): Reactive<Cell<boolean>> {
  return Reactive.create<Cell<boolean>>(
    graph,
    new CellOperations<boolean>(),
    rx.changes.map((cmd) => (cmd === null ? null : cmd > threshold)),
    new Cell(rx.previousSnapshot.value > threshold),
  );
}

describe("filterList", () => {
  let graph: Graph;
  let changes: Input<ListCommand<Cell<number>>[]>;
  let list: Reactive<List<Cell<number>>>;

  beforeEach(() => {
    graph = new Graph();
    changes = inputValue(graph, [] as ListCommand<Cell<number>>[]);
    list = Reactive.create<List<Cell<number>>>(
      graph,
      new ListOperations(numberCellOps),
      changes,
      List<Cell<number>>(),
    );
  });

  it("should filter empty list to empty list", () => {
    const filtered = filterList(graph, list, (rx) => greaterThan(graph, rx, 5));
    graph.step();

    expect(filtered.snapshot.size).toBe(0);
  });

  it("should filter initial values", () => {
    const initialList = numberCells(1, 3, 5, 7, 9);
    const listWithData = Reactive.create<List<Cell<number>>>(
      graph,
      new ListOperations(numberCellOps),
      changes,
      initialList,
    );

    const filtered = filterList(graph, listWithData, (rx) =>
      greaterThan(graph, rx, 5),
    );
    graph.step();

    expect(listNumbers(filtered.snapshot)).toEqual([7, 9]);
  });

  it("should handle insert of selected item", () => {
    const filtered = filterList(graph, list, (rx) => greaterThan(graph, rx, 5));
    graph.step();

    changes.push([{ type: "insert", index: 0, value: numberCell(10) }]);
    graph.step();

    expect(listNumbers(filtered.snapshot)).toEqual([10]);
  });

  it("should handle insert of non-selected item", () => {
    const filtered = filterList(graph, list, (rx) => greaterThan(graph, rx, 5));
    graph.step();

    changes.push([{ type: "insert", index: 0, value: numberCell(3) }]);
    graph.step();

    expect(filtered.snapshot.toArray()).toEqual([]);
  });

  it("should handle mixed inserts", () => {
    const filtered = filterList(graph, list, (rx) => greaterThan(graph, rx, 5));
    graph.step();

    changes.push([
      { type: "insert", index: 0, value: numberCell(3) }, // not selected
      { type: "insert", index: 1, value: numberCell(7) }, // selected
      { type: "insert", index: 2, value: numberCell(4) }, // not selected
      { type: "insert", index: 3, value: numberCell(9) }, // selected
    ]);
    graph.step();

    expect(listNumbers(filtered.snapshot)).toEqual([7, 9]);
  });

  it("should handle remove of selected item", () => {
    const initialList = numberCells(3, 7, 4, 9);
    const listWithData = Reactive.create<List<Cell<number>>>(
      graph,
      new ListOperations(numberCellOps),
      changes,
      initialList,
    );

    const filtered = filterList(graph, listWithData, (rx) =>
      greaterThan(graph, rx, 5),
    );
    graph.step();

    expect(listNumbers(filtered.snapshot)).toEqual([7, 9]);

    changes.push([{ type: "remove", index: 1 }]); // Remove 7
    graph.step();

    expect(listNumbers(filtered.snapshot)).toEqual([9]);
  });

  it("should handle remove of non-selected item", () => {
    const initialList = numberCells(3, 7, 4, 9);
    const listWithData = Reactive.create<List<Cell<number>>>(
      graph,
      new ListOperations(numberCellOps),
      changes,
      initialList,
    );

    const filtered = filterList(graph, listWithData, (rx) =>
      greaterThan(graph, rx, 5),
    );
    graph.step();

    expect(listNumbers(filtered.snapshot)).toEqual([7, 9]);

    changes.push([{ type: "remove", index: 0 }]); // Remove 3
    graph.step();

    expect(listNumbers(filtered.snapshot)).toEqual([7, 9]);
  });

  it("should handle clear", () => {
    const initialList = numberCells(3, 7, 4, 9);
    const listWithData = Reactive.create<List<Cell<number>>>(
      graph,
      new ListOperations(numberCellOps),
      changes,
      initialList,
    );

    const filtered = filterList(graph, listWithData, (rx) =>
      greaterThan(graph, rx, 5),
    );
    graph.step();

    expect(listNumbers(filtered.snapshot)).toEqual([7, 9]);

    changes.push([{ type: "clear" }]);
    graph.step();

    expect(filtered.snapshot.toArray()).toEqual([]);
  });

  it("should only call predicate function for initial items", () => {
    const initialList = numberCells(3, 7, 4, 9);
    const listWithData = Reactive.create<List<Cell<number>>>(
      graph,
      new ListOperations(numberCellOps),
      changes,
      initialList,
    );

    let predicateCallCount = 0;
    const filtered = filterList(graph, listWithData, (rx) => {
      predicateCallCount++;
      return greaterThan(graph, rx, 5);
    });
    graph.step();

    expect(predicateCallCount).toBe(4); // Called once for each initial item
    expect(listNumbers(filtered.snapshot)).toEqual([7, 9]);
  });

  it("should only call predicate function once per inserted item", () => {
    let predicateCallCount = 0;
    const filtered = filterList(graph, list, (rx) => {
      predicateCallCount++;
      return greaterThan(graph, rx, 5);
    });
    graph.step();

    expect(predicateCallCount).toBe(0); // No initial items

    changes.push([
      { type: "insert", index: 0, value: numberCell(3) },
      { type: "insert", index: 1, value: numberCell(7) },
      { type: "insert", index: 2, value: numberCell(4) },
    ]);
    graph.step();

    expect(predicateCallCount).toBe(3); // Called once per insert
    expect(listNumbers(filtered.snapshot)).toEqual([7]);
  });

  it("should not call predicate function when removing items", () => {
    const initialList = numberCells(3, 7, 4, 9);
    const listWithData = Reactive.create<List<Cell<number>>>(
      graph,
      new ListOperations(numberCellOps),
      changes,
      initialList,
    );

    let predicateCallCount = 0;
    const filtered = filterList(graph, listWithData, (rx) => {
      predicateCallCount++;
      return greaterThan(graph, rx, 5);
    });
    graph.step();

    expect(predicateCallCount).toBe(4); // Initial calls

    changes.push([{ type: "remove", index: 0 }]); // Remove 3
    graph.step();

    expect(predicateCallCount).toBe(4); // No new calls
    expect(listNumbers(filtered.snapshot)).toEqual([7, 9]);
  });

  it("should not call predicate function when moving items", () => {
    const initialList = numberCells(3, 7, 4, 9);
    const listWithData = Reactive.create<List<Cell<number>>>(
      graph,
      new ListOperations(numberCellOps),
      changes,
      initialList,
    );

    let predicateCallCount = 0;
    const filtered = filterList(graph, listWithData, (rx) => {
      predicateCallCount++;
      return greaterThan(graph, rx, 5);
    });
    graph.step();

    expect(predicateCallCount).toBe(4); // Initial calls

    changes.push([{ type: "move", from: 1, to: 3 }]); // Move 7 to end
    graph.step();

    expect(predicateCallCount).toBe(4); // No new calls
    expect(listNumbers(filtered.snapshot)).toEqual([9, 7]);
  });

  it("should not call predicate function when clearing", () => {
    const initialList = numberCells(3, 7, 4, 9);
    const listWithData = Reactive.create<List<Cell<number>>>(
      graph,
      new ListOperations(numberCellOps),
      changes,
      initialList,
    );

    let predicateCallCount = 0;
    const filtered = filterList(graph, listWithData, (rx) => {
      predicateCallCount++;
      return greaterThan(graph, rx, 5);
    });
    graph.step();

    expect(predicateCallCount).toBe(4); // Initial calls

    changes.push([{ type: "clear" }]);
    graph.step();

    expect(predicateCallCount).toBe(4); // No new calls
    expect(filtered.snapshot.toArray()).toEqual([]);
  });
});
