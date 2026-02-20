import { describe, it, expect, beforeEach } from "vitest";
import { Graph, inputValue, Input } from "derivation";
import { Reactive } from "../reactive.js";
import { Cell } from "../cell.js";
import { CellOperations } from "../cell-operations.js";
import { zipCell } from "../zip-cell.js";

const numberCellOps = new CellOperations<number>();

describe("zipCell", () => {
  let graph: Graph;
  let changesA: Input<number | null>;
  let sourceA: Reactive<Cell<number>>;
  let changesB: Input<number | null>;
  let sourceB: Reactive<Cell<number>>;

  beforeEach(() => {
    graph = new Graph();
    changesA = inputValue<number | null>(graph, null);
    sourceA = Reactive.create<Cell<number>>(
      graph,
      numberCellOps,
      changesA,
      new Cell(1),
    );
    changesB = inputValue<number | null>(graph, null);
    sourceB = Reactive.create<Cell<number>>(
      graph,
      numberCellOps,
      changesB,
      new Cell(10),
    );
  });

  it("zips two Cell values", () => {
    const zipped = zipCell(graph, sourceA, sourceB, (a, b) => a + b);
    graph.step();

    expect(zipped.snapshot.value).toBe(11);

    changesA.push(5);
    graph.step();

    expect(zipped.snapshot.value).toBe(15);

    changesB.push(20);
    graph.step();

    expect(zipped.snapshot.value).toBe(25);
  });

  it("zips with different types", () => {
    const sourceString = Reactive.create<Cell<string>>(
      graph,
      new CellOperations<string>(),
      inputValue<string | null>(graph, null),
      new Cell("hello"),
    );
    
    const zipped = zipCell(graph, sourceA, sourceString, (a, b) => `${a}-${b}`);
    graph.step();

    expect(zipped.snapshot.value).toBe("1-hello");
  });
});
