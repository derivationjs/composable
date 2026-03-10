import { describe, it, expect, beforeEach } from "vitest";
import { Graph, inputValue, Input } from "derivation";
import { Map as IMap } from "immutable";
import { Reactive } from "../reactive.js";
import { Cell } from "../cell.js";
import { CellOperations } from "../cell-operations.js";
import { MapOperations, MapCommand } from "../map-operations.js";
import { mergeMap } from "../merge-map.js";

const numberOps = new CellOperations<number>();
const mapOps = new MapOperations<string, Cell<number>>(numberOps);

function cell(value: number): Cell<number> {
  return new Cell(value);
}

function unwrapMap(map: IMap<string, Cell<number>>): Record<string, number> {
  return map.map((v) => v.value).toObject() as Record<string, number>;
}

describe("mergeMap", () => {
  let graph: Graph;
  let changesA: Input<MapCommand<string, Cell<number>>[] | null>;
  let changesB: Input<MapCommand<string, Cell<number>>[] | null>;
  let mapA: Reactive<IMap<string, Cell<number>>>;
  let mapB: Reactive<IMap<string, Cell<number>>>;

  beforeEach(() => {
    graph = new Graph();
    changesA = inputValue(graph, null as MapCommand<string, Cell<number>>[] | null);
    changesB = inputValue(graph, null as MapCommand<string, Cell<number>>[] | null);
  });

  function createMap(
    changes: Input<MapCommand<string, Cell<number>>[] | null>,
    initial: IMap<string, Cell<number>>,
  ) {
    return Reactive.create<IMap<string, Cell<number>>>(graph, mapOps, changes, initial);
  }

  it("should merge initial values from both maps", () => {
    mapA = createMap(changesA, IMap({ a: cell(1) }));
    mapB = createMap(changesB, IMap({ b: cell(2) }));
    const merged = mergeMap(graph, mapA, mapB);
    graph.step();

    expect(unwrapMap(merged.snapshot)).toEqual({ a: 1, b: 2 });
  });

  it("should prefer right-hand values on key conflicts", () => {
    mapA = createMap(changesA, IMap({ a: cell(1), shared: cell(2) }));
    mapB = createMap(changesB, IMap({ shared: cell(20), b: cell(3) }));
    const merged = mergeMap(graph, mapA, mapB);
    graph.step();

    expect(unwrapMap(merged.snapshot)).toEqual({ a: 1, shared: 20, b: 3 });
  });

  it("should update when the left side changes", () => {
    mapA = createMap(changesA, IMap({ a: cell(1) }));
    mapB = createMap(changesB, IMap({ b: cell(2) }));
    const merged = mergeMap(graph, mapA, mapB);
    graph.step();

    changesA.push([{ type: "update", key: "a", command: 10 }]);
    graph.step();

    expect(unwrapMap(merged.snapshot)).toEqual({ a: 10, b: 2 });
  });

  it("should update when the right side changes", () => {
    mapA = createMap(changesA, IMap({ a: cell(1) }));
    mapB = createMap(changesB, IMap({ b: cell(2) }));
    const merged = mergeMap(graph, mapA, mapB);
    graph.step();

    changesB.push([{ type: "update", key: "b", command: 20 }]);
    graph.step();

    expect(unwrapMap(merged.snapshot)).toEqual({ a: 1, b: 20 });
  });

  it("should update conflicts when the right side adds an overlapping key", () => {
    mapA = createMap(changesA, IMap({ shared: cell(1) }));
    mapB = createMap(changesB, IMap());
    const merged = mergeMap(graph, mapA, mapB);
    graph.step();

    changesB.push([{ type: "add", key: "shared", value: cell(2) }]);
    graph.step();

    expect(unwrapMap(merged.snapshot)).toEqual({ shared: 2 });
  });

  it("should fall back to the left side when the right side deletes a conflicting key", () => {
    mapA = createMap(changesA, IMap({ shared: cell(1) }));
    mapB = createMap(changesB, IMap({ shared: cell(2) }));
    const merged = mergeMap(graph, mapA, mapB);
    graph.step();

    changesB.push([{ type: "delete", key: "shared" }]);
    graph.step();

    expect(unwrapMap(merged.snapshot)).toEqual({ shared: 1 });
  });

  it("should return null changes when the merged result is unchanged", () => {
    mapA = createMap(changesA, IMap({ shared: cell(1) }));
    mapB = createMap(changesB, IMap({ shared: cell(2) }));
    const merged = mergeMap(graph, mapA, mapB);
    graph.step();

    changesA.push([{ type: "update", key: "shared", command: 10 }]);
    graph.step();

    expect(unwrapMap(merged.snapshot)).toEqual({ shared: 2 });
    expect(merged.changes.value).toBeNull();
  });

  describe("incrementality", () => {
    it("should emit a targeted add for non-conflicting inserts", () => {
      mapA = createMap(changesA, IMap({ a: cell(1) }));
      mapB = createMap(changesB, IMap({ b: cell(2) }));
      const merged = mergeMap(graph, mapA, mapB);
      graph.step();

      changesA.push([{ type: "add", key: "c", value: cell(3) }]);
      graph.step();

      expect(unwrapMap(merged.snapshot)).toEqual({ a: 1, b: 2, c: 3 });
      expect(merged.changes.value).toEqual([
        { type: "add", key: "c", value: cell(3) },
      ]);
    });

    it("should emit a targeted update for visible left-side updates", () => {
      mapA = createMap(changesA, IMap({ a: cell(1) }));
      mapB = createMap(changesB, IMap({ b: cell(2) }));
      const merged = mergeMap(graph, mapA, mapB);
      graph.step();

      changesA.push([{ type: "update", key: "a", command: 10 }]);
      graph.step();

      expect(unwrapMap(merged.snapshot)).toEqual({ a: 10, b: 2 });
      expect(merged.changes.value).toEqual([
        { type: "update", key: "a", command: 10 },
      ]);
    });

    it("should emit a targeted replacement when the right side takes ownership of a key", () => {
      mapA = createMap(changesA, IMap({ shared: cell(1) }));
      mapB = createMap(changesB, IMap());
      const merged = mergeMap(graph, mapA, mapB);
      graph.step();

      changesB.push([{ type: "add", key: "shared", value: cell(2) }]);
      graph.step();

      expect(unwrapMap(merged.snapshot)).toEqual({ shared: 2 });
      expect(merged.changes.value).toEqual([
        { type: "update", key: "shared", command: 2 },
      ]);
    });

    it("should emit a targeted replacement when the right side deletes and reveals the left value", () => {
      mapA = createMap(changesA, IMap({ shared: cell(1) }));
      mapB = createMap(changesB, IMap({ shared: cell(2) }));
      const merged = mergeMap(graph, mapA, mapB);
      graph.step();

      changesB.push([{ type: "delete", key: "shared" }]);
      graph.step();

      expect(unwrapMap(merged.snapshot)).toEqual({ shared: 1 });
      expect(merged.changes.value).toEqual([
        { type: "update", key: "shared", command: 1 },
      ]);
    });

    it("should avoid emitting a replacement when a hidden left value changes under a right conflict", () => {
      mapA = createMap(changesA, IMap({ shared: cell(1) }));
      mapB = createMap(changesB, IMap({ shared: cell(2) }));
      const merged = mergeMap(graph, mapA, mapB);
      graph.step();

      changesA.push([{ type: "update", key: "shared", command: 10 }]);
      graph.step();

      expect(unwrapMap(merged.snapshot)).toEqual({ shared: 2 });
      expect(merged.changes.value).toBeNull();
    });
  });
});
