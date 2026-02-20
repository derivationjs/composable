import { describe, it, expect, beforeEach } from "vitest";
import { Graph, inputValue, Input } from "derivation";
import { Map as IMap } from "immutable";
import { Reactive } from "../reactive.js";
import { Cell } from "../cell.js";
import { CellOperations } from "../cell-operations.js";
import { MapOperations, MapCommand } from "../map-operations.js";
import { unsafeMergeMap, emptyReactiveMap } from "../unsafe-merge-map.js";

const numberOps = new CellOperations<number>();
const mapOps = new MapOperations<string, Cell<number>>(numberOps);

function cell(value: number): Cell<number> {
  return new Cell(value);
}

function unwrapMap(map: IMap<string, Cell<number>>): Record<string, number> {
  return map.map((v) => v.value).toObject() as Record<string, number>;
}

describe("unsafeMergeMap", () => {
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

  it("should merge two empty maps", () => {
    mapA = createMap(changesA, IMap());
    mapB = createMap(changesB, IMap());
    const merged = unsafeMergeMap(graph, mapA, mapB, mapOps);
    graph.step();

    expect(merged.snapshot.size).toBe(0);
  });

  it("should merge initial values from both maps", () => {
    mapA = createMap(changesA, IMap({ a: cell(1), b: cell(2) }));
    mapB = createMap(changesB, IMap({ c: cell(3), d: cell(4) }));
    const merged = unsafeMergeMap(graph, mapA, mapB, mapOps);
    graph.step();

    expect(unwrapMap(merged.snapshot)).toEqual({ a: 1, b: 2, c: 3, d: 4 });
  });

  it("should propagate adds from left side", () => {
    mapA = createMap(changesA, IMap());
    mapB = createMap(changesB, IMap({ x: cell(10) }));
    const merged = unsafeMergeMap(graph, mapA, mapB, mapOps);
    graph.step();

    changesA.push([{ type: "add", key: "a", value: cell(1) }]);
    graph.step();

    expect(unwrapMap(merged.snapshot)).toEqual({ a: 1, x: 10 });
  });

  it("should propagate adds from right side", () => {
    mapA = createMap(changesA, IMap({ a: cell(1) }));
    mapB = createMap(changesB, IMap());
    const merged = unsafeMergeMap(graph, mapA, mapB, mapOps);
    graph.step();

    changesB.push([{ type: "add", key: "x", value: cell(10) }]);
    graph.step();

    expect(unwrapMap(merged.snapshot)).toEqual({ a: 1, x: 10 });
  });

  it("should propagate updates from both sides", () => {
    mapA = createMap(changesA, IMap({ a: cell(1) }));
    mapB = createMap(changesB, IMap({ x: cell(10) }));
    const merged = unsafeMergeMap(graph, mapA, mapB, mapOps);
    graph.step();

    changesA.push([{ type: "update", key: "a", command: 2 }]);
    changesB.push([{ type: "update", key: "x", command: 20 }]);
    graph.step();

    expect(unwrapMap(merged.snapshot)).toEqual({ a: 2, x: 20 });
  });

  it("should propagate deletes", () => {
    mapA = createMap(changesA, IMap({ a: cell(1), b: cell(2) }));
    mapB = createMap(changesB, IMap({ x: cell(10) }));
    const merged = unsafeMergeMap(graph, mapA, mapB, mapOps);
    graph.step();

    changesA.push([{ type: "delete", key: "a" }]);
    graph.step();

    expect(unwrapMap(merged.snapshot)).toEqual({ b: 2, x: 10 });
  });

  it("should concatenate changes from both sides", () => {
    mapA = createMap(changesA, IMap({ a: cell(1) }));
    mapB = createMap(changesB, IMap({ x: cell(10) }));
    const merged = unsafeMergeMap(graph, mapA, mapB, mapOps);
    graph.step();

    changesA.push([{ type: "add", key: "b", value: cell(2) }]);
    changesB.push([{ type: "add", key: "y", value: cell(20) }]);
    graph.step();

    expect(merged.changes.value).toEqual([
      { type: "add", key: "b", value: cell(2) },
      { type: "add", key: "y", value: cell(20) },
    ]);
  });

  it("should return null changes when neither side changes", () => {
    mapA = createMap(changesA, IMap({ a: cell(1) }));
    mapB = createMap(changesB, IMap({ x: cell(10) }));
    const merged = unsafeMergeMap(graph, mapA, mapB, mapOps);
    graph.step();

    changesA.push(null);
    changesB.push(null);
    graph.step();

    expect(merged.changes.value).toBeNull();
  });

  it("should track previousMaterialized correctly", () => {
    mapA = createMap(changesA, IMap({ a: cell(1) }));
    mapB = createMap(changesB, IMap({ x: cell(10) }));
    const merged = unsafeMergeMap(graph, mapA, mapB, mapOps);
    graph.step();

    changesA.push([{ type: "update", key: "a", command: 2 }]);
    graph.step();

    expect(unwrapMap(merged.previousSnapshot)).toEqual({ a: 1, x: 10 });
    expect(unwrapMap(merged.snapshot)).toEqual({ a: 2, x: 10 });
  });
});

describe("emptyReactiveMap", () => {
  it("should create an empty reactive map with null changes", () => {
    const graph = new Graph();
    const empty = emptyReactiveMap<string, Cell<number>>(graph, mapOps);
    graph.step();

    expect(empty.snapshot.size).toBe(0);
    expect(empty.changes.value).toBeNull();
  });
});
