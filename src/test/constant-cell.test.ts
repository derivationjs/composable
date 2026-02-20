import { describe, it, expect } from "vitest";
import { Graph } from "derivation";
import { constantCell } from "../constant-cell.js";

describe("constantCell", () => {
  it("creates a stable reactive cell with no changes", () => {
    const graph = new Graph();
    const value = constantCell(graph, 42);

    graph.step();
    expect(value.snapshot.value).toBe(42);
    expect(value.changes.value).toBeNull();

    graph.step();
    expect(value.snapshot.value).toBe(42);
    expect(value.changes.value).toBeNull();
  });
});
