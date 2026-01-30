import { describe, it, expect, beforeEach } from "vitest";
import { Graph, inputValue, Input } from "derivation";
import { Reactive } from "../reactive.js";
import { PrimitiveOperations } from "../primitive-operations.js";
import { mapPrimitive } from "../map-primitive.js";

const numberOps = new PrimitiveOperations<number>();

describe("mapPrimitive", () => {
  let graph: Graph;
  let changes: Input<number | null>;
  let source: Reactive<number>;

  beforeEach(() => {
    graph = new Graph();
    changes = inputValue<number | null>(graph, null);
    source = Reactive.create<number>(graph, numberOps, changes, 1);
  });

  it("should map the initial value", () => {
    const mapped = mapPrimitive(graph, source, (x) => x * 2);
    graph.step();

    expect(mapped.snapshot).toBe(2);
  });

  it("should map updates", () => {
    const mapped = mapPrimitive(graph, source, (x) => x * 2);
    graph.step();

    changes.push(5);
    graph.step();

    expect(mapped.snapshot).toBe(10);
  });

  it("should handle multiple updates", () => {
    const mapped = mapPrimitive(graph, source, (x) => x + 10);
    graph.step();

    changes.push(3);
    graph.step();
    expect(mapped.snapshot).toBe(13);

    changes.push(7);
    graph.step();
    expect(mapped.snapshot).toBe(17);
  });

  it("should handle null commands (no-op)", () => {
    const mapped = mapPrimitive(graph, source, (x) => x * 3);
    graph.step();

    expect(mapped.snapshot).toBe(3);

    changes.push(null);
    graph.step();

    expect(mapped.snapshot).toBe(3);
  });

  it("should change the type", () => {
    const mapped = mapPrimitive(graph, source, (x) => String(x));
    graph.step();

    expect(mapped.snapshot).toBe("1");

    changes.push(42);
    graph.step();

    expect(mapped.snapshot).toBe("42");
  });
});
