import { describe, it, expect, beforeEach } from "vitest";
import { Graph, inputValue, Input } from "derivation";
import { Reactive } from "../reactive.js";
import { Cell } from "../cell.js";
import { CellOperations } from "../cell-operations.js";
import { mapCell } from "../map-cell.js";

const numberOps = new CellOperations<number>();

describe("mapCell", () => {
  let graph: Graph;
  let changes: Input<number | null>;
  let source: Reactive<Cell<number>>;

  beforeEach(() => {
    graph = new Graph();
    changes = inputValue<number | null>(graph, null);
    source = Reactive.create<Cell<number>>(graph, numberOps, changes, new Cell(1));
  });

  it("should map the initial value", () => {
    const mapped = mapCell(graph, source, (x) => x * 2);
    graph.step();

    expect(mapped.snapshot.value).toBe(2);
  });

  it("should map updates", () => {
    const mapped = mapCell(graph, source, (x) => x * 2);
    graph.step();

    changes.push(5);
    graph.step();

    expect(mapped.snapshot.value).toBe(10);
  });

  it("should handle multiple updates", () => {
    const mapped = mapCell(graph, source, (x) => x + 10);
    graph.step();

    changes.push(3);
    graph.step();
    expect(mapped.snapshot.value).toBe(13);

    changes.push(7);
    graph.step();
    expect(mapped.snapshot.value).toBe(17);
  });

  it("should handle null commands (no-op)", () => {
    const mapped = mapCell(graph, source, (x) => x * 3);
    graph.step();

    expect(mapped.snapshot.value).toBe(3);

    changes.push(null);
    graph.step();

    expect(mapped.snapshot.value).toBe(3);
  });

  it("should change the type", () => {
    const mapped = mapCell(graph, source, (x) => String(x));
    graph.step();

    expect(mapped.snapshot.value).toBe("1");

    changes.push(42);
    graph.step();

    expect(mapped.snapshot.value).toBe("42");
  });
});
