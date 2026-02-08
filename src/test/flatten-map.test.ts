import { describe, it, expect, beforeEach } from "vitest";
import { Graph, inputValue, Input } from "derivation";
import { Map as IMap } from "immutable";
import { Reactive } from "../reactive.js";
import { MapOperations, MapCommand } from "../map-operations.js";
import { PrimitiveOperations } from "../primitive-operations.js";
import { mapMap } from "../map-reactive.js";
import { flattenMap } from "../flatten-map.js";
import { Tuple } from "../tuple.js";

const numberOps = new PrimitiveOperations<number>();
const innerMapOps = new MapOperations<string, number>(numberOps);

describe("flattenMap", () => {
  let graph: Graph;
  let changes: Input<MapCommand<string, IMap<string, number>>[]>;
  let source: Reactive<IMap<string, IMap<string, number>>>;

  beforeEach(() => {
    graph = new Graph();
    changes = inputValue(
      graph,
      [] as MapCommand<string, IMap<string, number>>[],
    );
    source = Reactive.create<IMap<string, IMap<string, number>>>(
      graph,
      new MapOperations<string, IMap<string, number>>(innerMapOps),
      changes,
      IMap<string, IMap<string, number>>(),
    );
  });

  it("converts empty nested map to empty flat map", () => {
    const flat = flattenMap(graph, source);
    expect(flat.snapshot.size).toBe(0);
  });

  it("flattens initial nested map", () => {
    const initial = IMap<string, IMap<string, number>>({
      a: IMap({ x: 1, y: 2 }),
      b: IMap({ z: 3 }),
    });
    const s = Reactive.create<IMap<string, IMap<string, number>>>(
      graph,
      new MapOperations<string, IMap<string, number>>(innerMapOps),
      changes,
      initial,
    );

    const flat = flattenMap(graph, s);

    expect(flat.snapshot.get(Tuple("a", "x"))).toBe(1);
    expect(flat.snapshot.get(Tuple("a", "y"))).toBe(2);
    expect(flat.snapshot.get(Tuple("b", "z"))).toBe(3);
    expect(flat.snapshot.size).toBe(3);
  });

  it("handles add of outer key", () => {
    const flat = flattenMap(graph, source);

    changes.push([{ type: "add", key: "a", value: IMap({ x: 10, y: 20 }) }]);
    graph.step();

    expect(flat.snapshot.get(Tuple("a", "x"))).toBe(10);
    expect(flat.snapshot.get(Tuple("a", "y"))).toBe(20);
    expect(flat.snapshot.size).toBe(2);
  });

  it("handles delete of outer key", () => {
    const initial = IMap<string, IMap<string, number>>({
      a: IMap({ x: 1, y: 2 }),
      b: IMap({ z: 3 }),
    });
    const s = Reactive.create<IMap<string, IMap<string, number>>>(
      graph,
      new MapOperations<string, IMap<string, number>>(innerMapOps),
      changes,
      initial,
    );

    const flat = flattenMap(graph, s);

    changes.push([{ type: "delete", key: "a" }]);
    graph.step();

    expect(flat.snapshot.has(Tuple("a", "x"))).toBe(false);
    expect(flat.snapshot.has(Tuple("a", "y"))).toBe(false);
    expect(flat.snapshot.get(Tuple("b", "z"))).toBe(3);
    expect(flat.snapshot.size).toBe(1);
  });

  it("handles update adding inner key", () => {
    const initial = IMap<string, IMap<string, number>>({
      a: IMap({ x: 1 }),
    });
    const s = Reactive.create<IMap<string, IMap<string, number>>>(
      graph,
      new MapOperations<string, IMap<string, number>>(innerMapOps),
      changes,
      initial,
    );

    const flat = flattenMap(graph, s);

    changes.push([
      {
        type: "update",
        key: "a",
        command: [{ type: "add", key: "y", value: 99 }],
      },
    ]);
    graph.step();

    expect(flat.snapshot.get(Tuple("a", "x"))).toBe(1);
    expect(flat.snapshot.get(Tuple("a", "y"))).toBe(99);
    expect(flat.snapshot.size).toBe(2);
  });

  it("handles update deleting inner key", () => {
    const initial = IMap<string, IMap<string, number>>({
      a: IMap({ x: 1, y: 2 }),
    });
    const s = Reactive.create<IMap<string, IMap<string, number>>>(
      graph,
      new MapOperations<string, IMap<string, number>>(innerMapOps),
      changes,
      initial,
    );

    const flat = flattenMap(graph, s);

    changes.push([
      { type: "update", key: "a", command: [{ type: "delete", key: "x" }] },
    ]);
    graph.step();

    expect(flat.snapshot.has(Tuple("a", "x"))).toBe(false);
    expect(flat.snapshot.get(Tuple("a", "y"))).toBe(2);
    expect(flat.snapshot.size).toBe(1);
  });

  it("handles update clearing inner map", () => {
    const initial = IMap<string, IMap<string, number>>({
      a: IMap({ x: 1, y: 2 }),
      b: IMap({ z: 3 }),
    });
    const s = Reactive.create<IMap<string, IMap<string, number>>>(
      graph,
      new MapOperations<string, IMap<string, number>>(innerMapOps),
      changes,
      initial,
    );

    const flat = flattenMap(graph, s);

    changes.push([{ type: "update", key: "a", command: [{ type: "clear" }] }]);
    graph.step();

    expect(flat.snapshot.has(Tuple("a", "x"))).toBe(false);
    expect(flat.snapshot.has(Tuple("a", "y"))).toBe(false);
    expect(flat.snapshot.get(Tuple("b", "z"))).toBe(3);
    expect(flat.snapshot.size).toBe(1);
  });

  it("handles clear of entire map", () => {
    const initial = IMap<string, IMap<string, number>>({
      a: IMap({ x: 1 }),
      b: IMap({ y: 2 }),
    });
    const s = Reactive.create<IMap<string, IMap<string, number>>>(
      graph,
      new MapOperations<string, IMap<string, number>>(innerMapOps),
      changes,
      initial,
    );

    const flat = flattenMap(graph, s);

    changes.push([{ type: "clear" }]);
    graph.step();

    expect(flat.snapshot.size).toBe(0);
  });

  it("handles multiple steps", () => {
    const flat = flattenMap(graph, source);

    changes.push([{ type: "add", key: "a", value: IMap({ x: 1, y: 2 }) }]);
    graph.step();

    expect(flat.snapshot.size).toBe(2);

    changes.push([{ type: "add", key: "b", value: IMap({ z: 3 }) }]);
    graph.step();

    expect(flat.snapshot.size).toBe(3);
    expect(flat.snapshot.get(Tuple("b", "z"))).toBe(3);

    changes.push([{ type: "delete", key: "a" }]);
    graph.step();

    expect(flat.snapshot.size).toBe(1);
    expect(flat.snapshot.get(Tuple("b", "z"))).toBe(3);
  });

  it.skip("propagates updates when flattening a mapMap that starts empty", () => {
    const outerChanges = inputValue(graph, [] as MapCommand<string, number>[]);
    const outerMap = Reactive.create<IMap<string, number>>(
      graph,
      new MapOperations<string, number>(new PrimitiveOperations<number>()),
      outerChanges,
      IMap<string, number>(),
    );

    const innerMapOps = new MapOperations<string, number>(
      new PrimitiveOperations<number>(),
    );
    const mapped = mapMap<string, number, IMap<string, number>>(
      graph,
      outerMap,
      (rx) => {
        const innerChanges = rx.changes.map(
          (cmd): MapCommand<string, number>[] =>
            cmd === null ? [] : [{ type: "update", key: "val", command: cmd }],
        );
        const initial = IMap<string, number>({ val: rx.snapshot });
        return Reactive.create<IMap<string, number>>(
          graph,
          innerMapOps,
          innerChanges,
          initial,
        );
      },
    );

    const flat = flattenMap(graph, mapped);

    outerChanges.push([{ type: "add", key: "outer", value: 1 }]);
    graph.step();

    outerChanges.push([{ type: "update", key: "outer", command: 2 }]);
    graph.step();

    expect(flat.snapshot.get(Tuple("outer", "val"))).toBe(2);
  });
});
