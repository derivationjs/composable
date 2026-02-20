import { describe, it, expect } from "vitest";
import { Graph, inputValue } from "derivation";
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

describe("filterList regressions", () => {
  it("handles dynamically inserted item crossing false->true", () => {
    const graph = new Graph();
    const changes = inputValue(graph, [] as ListCommand<Cell<number>>[]);
    const list = Reactive.create<List<Cell<number>>>(
      graph,
      new ListOperations(numberCellOps),
      changes,
      List<Cell<number>>(),
    );
    const filtered = filterList(graph, list, (rx) => greaterThan(graph, rx, 5));

    graph.step();

    changes.push([{ type: "insert", index: 0, value: numberCell(3) }]);
    graph.step();
    expect(filtered.snapshot.toArray()).toEqual([]);

    changes.push([{ type: "update", index: 0, command: 10 }]);
    graph.step();
    expect(listNumbers(filtered.snapshot)).toEqual([10]);
  });

  it("handles dynamically inserted item crossing true->false", () => {
    const graph = new Graph();
    const changes = inputValue(graph, [] as ListCommand<Cell<number>>[]);
    const list = Reactive.create<List<Cell<number>>>(
      graph,
      new ListOperations(numberCellOps),
      changes,
      List<Cell<number>>(),
    );
    const filtered = filterList(graph, list, (rx) => greaterThan(graph, rx, 5));

    graph.step();

    changes.push([{ type: "insert", index: 0, value: numberCell(10) }]);
    graph.step();
    expect(listNumbers(filtered.snapshot)).toEqual([10]);

    changes.push([{ type: "update", index: 0, command: 2 }]);
    graph.step();
    expect(filtered.snapshot.toArray()).toEqual([]);
  });

  it("reacts when predicate depends on external reactive state", () => {
    const graph = new Graph();
    const listChanges = inputValue(graph, [] as ListCommand<Cell<number>>[]);
    const thresholdInput = inputValue<number | null>(graph, null);

    const list = Reactive.create<List<Cell<number>>>(
      graph,
      new ListOperations(numberCellOps),
      listChanges,
      numberCells(3, 7),
    );
    const thresholdRx = Reactive.create<Cell<number>>(
      graph,
      numberCellOps,
      thresholdInput,
      new Cell(5),
    );

    const filtered = filterList(graph, list, (rx) =>
      Reactive.create<Cell<boolean>>(
        graph,
        new CellOperations<boolean>(),
        thresholdRx.changes.map((cmd) =>
          cmd === null ? null : rx.snapshot.value > cmd,
        ),
        new Cell(
          rx.previousSnapshot.value > thresholdRx.previousSnapshot.value,
        ),
      ),
    );

    graph.step();
    expect(listNumbers(filtered.snapshot)).toEqual([7]);

    thresholdInput.push(2);
    graph.step();
    expect(listNumbers(filtered.snapshot)).toEqual([3, 7]);
  });
});
