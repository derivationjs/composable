import { describe, it, expect, beforeEach } from "vitest";
import { Graph, inputValue, Input } from "derivation";
import { Reactive } from "../reactive.js";
import { Cell } from "../cell.js";
import { CellOperations } from "../cell-operations.js";
import { mapCell } from "../map-cell.js";

const numberCellOps = new CellOperations<number>();

describe("Cell integration", () => {
  let graph: Graph;
  let changes: Input<number | null>;
  let source: Reactive<Cell<number>>;

  beforeEach(() => {
    graph = new Graph();
    changes = inputValue<number | null>(graph, null);
    source = Reactive.create<Cell<number>>(
      graph,
      numberCellOps,
      changes,
      new Cell(1),
    );
  });

  it("applies primitive commands to Cell state", () => {
    graph.step();
    expect(source.snapshot.value).toBe(1);

    changes.push(5);
    graph.step();

    expect(source.snapshot.value).toBe(5);
  });

  it("maps Cell values and updates", () => {
    const mapped = mapCell(graph, source, (x) => x * 2);
    graph.step();

    expect(mapped.snapshot.value).toBe(2);

    changes.push(7);
    graph.step();

    expect(mapped.snapshot.value).toBe(14);
  });
});
