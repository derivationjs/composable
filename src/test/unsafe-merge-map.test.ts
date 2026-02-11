import { describe, it, expect, beforeEach } from "vitest";
import { Graph, inputValue, Input } from "derivation";
import { Map as IMap } from "immutable";
import { Reactive } from "../reactive.js";
import { MapOperations, MapCommand } from "../map-operations.js";
import { PrimitiveOperations } from "../primitive-operations.js";
import { unsafeMergeMap, emptyReactiveMap } from "../unsafe-merge-map.js";

const numberOps = new PrimitiveOperations<number>();
const mapOps = new MapOperations<string, number>(numberOps);

describe("unsafeMergeMap", () => {
  let graph: Graph;
  let changesA: Input<MapCommand<string, number>[] | null>;
  let changesB: Input<MapCommand<string, number>[] | null>;
  let mapA: Reactive<IMap<string, number>>;
  let mapB: Reactive<IMap<string, number>>;

  beforeEach(() => {
    graph = new Graph();
    changesA = inputValue(graph, null as MapCommand<string, number>[] | null);
    changesB = inputValue(graph, null as MapCommand<string, number>[] | null);
  });

  function createMap(
    changes: Input<MapCommand<string, number>[] | null>,
    initial: IMap<string, number>,
  ) {
    return Reactive.create<IMap<string, number>>(graph, mapOps, changes, initial);
  }

  it("should merge two empty maps", () => {
    mapA = createMap(changesA, IMap());
    mapB = createMap(changesB, IMap());
    const merged = unsafeMergeMap(graph, mapA, mapB, mapOps);
    graph.step();

    expect(merged.snapshot.size).toBe(0);
  });

  it("should merge initial values from both maps", () => {
    mapA = createMap(changesA, IMap({ a: 1, b: 2 }));
    mapB = createMap(changesB, IMap({ c: 3, d: 4 }));
    const merged = unsafeMergeMap(graph, mapA, mapB, mapOps);
    graph.step();

    expect(merged.snapshot.toObject()).toEqual({ a: 1, b: 2, c: 3, d: 4 });
  });

  it("should propagate adds from left side", () => {
    mapA = createMap(changesA, IMap());
    mapB = createMap(changesB, IMap({ x: 10 }));
    const merged = unsafeMergeMap(graph, mapA, mapB, mapOps);
    graph.step();

    changesA.push([{ type: "add", key: "a", value: 1 }]);
    graph.step();

    expect(merged.snapshot.toObject()).toEqual({ a: 1, x: 10 });
  });

  it("should propagate adds from right side", () => {
    mapA = createMap(changesA, IMap({ a: 1 }));
    mapB = createMap(changesB, IMap());
    const merged = unsafeMergeMap(graph, mapA, mapB, mapOps);
    graph.step();

    changesB.push([{ type: "add", key: "x", value: 10 }]);
    graph.step();

    expect(merged.snapshot.toObject()).toEqual({ a: 1, x: 10 });
  });

  it("should propagate updates from both sides", () => {
    mapA = createMap(changesA, IMap({ a: 1 }));
    mapB = createMap(changesB, IMap({ x: 10 }));
    const merged = unsafeMergeMap(graph, mapA, mapB, mapOps);
    graph.step();

    changesA.push([{ type: "update", key: "a", command: 2 }]);
    changesB.push([{ type: "update", key: "x", command: 20 }]);
    graph.step();

    expect(merged.snapshot.toObject()).toEqual({ a: 2, x: 20 });
  });

  it("should propagate deletes", () => {
    mapA = createMap(changesA, IMap({ a: 1, b: 2 }));
    mapB = createMap(changesB, IMap({ x: 10 }));
    const merged = unsafeMergeMap(graph, mapA, mapB, mapOps);
    graph.step();

    changesA.push([{ type: "delete", key: "a" }]);
    graph.step();

    expect(merged.snapshot.toObject()).toEqual({ b: 2, x: 10 });
  });

  it("should concatenate changes from both sides", () => {
    mapA = createMap(changesA, IMap({ a: 1 }));
    mapB = createMap(changesB, IMap({ x: 10 }));
    const merged = unsafeMergeMap(graph, mapA, mapB, mapOps);
    graph.step();

    changesA.push([{ type: "add", key: "b", value: 2 }]);
    changesB.push([{ type: "add", key: "y", value: 20 }]);
    graph.step();

    expect(merged.changes.value).toEqual([
      { type: "add", key: "b", value: 2 },
      { type: "add", key: "y", value: 20 },
    ]);
  });

  it("should return null changes when neither side changes", () => {
    mapA = createMap(changesA, IMap({ a: 1 }));
    mapB = createMap(changesB, IMap({ x: 10 }));
    const merged = unsafeMergeMap(graph, mapA, mapB, mapOps);
    graph.step();

    changesA.push(null);
    changesB.push(null);
    graph.step();

    expect(merged.changes.value).toBeNull();
  });

  it("should track previousMaterialized correctly", () => {
    mapA = createMap(changesA, IMap({ a: 1 }));
    mapB = createMap(changesB, IMap({ x: 10 }));
    const merged = unsafeMergeMap(graph, mapA, mapB, mapOps);
    graph.step();

    changesA.push([{ type: "update", key: "a", command: 2 }]);
    graph.step();

    expect(merged.previousSnapshot.toObject()).toEqual({ a: 1, x: 10 });
    expect(merged.snapshot.toObject()).toEqual({ a: 2, x: 10 });
  });
});

describe("emptyReactiveMap", () => {
  it("should create an empty reactive map with null changes", () => {
    const graph = new Graph();
    const empty = emptyReactiveMap<string, number>(graph, mapOps);
    graph.step();

    expect(empty.snapshot.size).toBe(0);
    expect(empty.changes.value).toBeNull();
  });
});
