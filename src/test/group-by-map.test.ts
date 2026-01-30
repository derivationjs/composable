import { describe, it, expect, beforeEach } from "vitest";
import { Graph, inputValue, Input } from "derivation";
import { Map as IMap } from "immutable";
import { Reactive } from "../reactive.js";
import { MapOperations, MapCommand } from "../map-operations.js";
import { groupByMap } from "../group-by-map.js";
import { PrimitiveOperations } from "../primitive-operations.js";

const numberOps = new PrimitiveOperations<number>();
const stringOps = new PrimitiveOperations<string>();

function makeKeyFn(graph: Graph) {
  return (rx: Reactive<number>): Reactive<string> => {
    const key = rx.materialized.map((n) => (n % 2 === 0 ? "even" : "odd"));
    const keyChanges = rx.changes.map((cmd) =>
      cmd !== null ? ((cmd as number) % 2 === 0 ? "even" : "odd") : null,
    );
    return Reactive.create<string>(graph, stringOps, keyChanges, key.value);
  };
}

describe("groupByMap", () => {
  let graph: Graph;
  let changes: Input<MapCommand<string, number>[]>;
  let source: Reactive<IMap<string, number>>;

  beforeEach(() => {
    graph = new Graph();
    changes = inputValue(graph, [] as MapCommand<string, number>[]);
    source = Reactive.create<IMap<string, number>>(
      graph,
      new MapOperations<string, number>(numberOps),
      changes,
      IMap<string, number>(),
    );
  });

  it("should group empty map into empty result", () => {
    const grouped = groupByMap(graph, source, makeKeyFn(graph));
    graph.step();

    expect(grouped.snapshot.size).toBe(0);
  });

  it("should group initial values correctly", () => {
    const initial = IMap({ a: 1, b: 2, c: 3, d: 4 });
    const src = Reactive.create<IMap<string, number>>(
      graph,
      new MapOperations<string, number>(numberOps),
      changes,
      initial,
    );

    const grouped = groupByMap(graph, src, makeKeyFn(graph));
    graph.step();

    const oddGroup = grouped.snapshot.get("odd")!;
    const evenGroup = grouped.snapshot.get("even")!;

    expect(oddGroup.get("a")).toBe(1);
    expect(oddGroup.get("c")).toBe(3);
    expect(evenGroup.get("b")).toBe(2);
    expect(evenGroup.get("d")).toBe(4);
  });

  it("should handle adding a new entry", () => {
    const grouped = groupByMap(graph, source, makeKeyFn(graph));
    graph.step();

    changes.push([{ type: "add", key: "a", value: 1 }]);
    graph.step();

    expect(grouped.snapshot.get("odd")!.get("a")).toBe(1);

    changes.push([{ type: "add", key: "b", value: 2 }]);
    graph.step();

    expect(grouped.snapshot.get("odd")!.get("a")).toBe(1);
    expect(grouped.snapshot.get("even")!.get("b")).toBe(2);
  });

  it("should handle adding to an existing group", () => {
    const initial = IMap({ a: 1 });
    const src = Reactive.create<IMap<string, number>>(
      graph,
      new MapOperations<string, number>(numberOps),
      changes,
      initial,
    );

    const grouped = groupByMap(graph, src, makeKeyFn(graph));
    graph.step();

    expect(grouped.snapshot.get("odd")!.size).toBe(1);

    changes.push([{ type: "add", key: "b", value: 3 }]);
    graph.step();

    expect(grouped.snapshot.get("odd")!.size).toBe(2);
    expect(grouped.snapshot.get("odd")!.get("b")).toBe(3);
  });

  it("should propagate updates within the same group", () => {
    const initial = IMap({ a: 2, b: 4 });
    const src = Reactive.create<IMap<string, number>>(
      graph,
      new MapOperations<string, number>(numberOps),
      changes,
      initial,
    );

    const grouped = groupByMap(graph, src, makeKeyFn(graph));
    graph.step();

    expect(grouped.snapshot.get("even")!.get("a")).toBe(2);

    // Update to a different even number
    changes.push([{ type: "update", key: "a", command: 6 }]);
    graph.step();

    expect(grouped.snapshot.get("even")!.get("a")).toBe(6);
    expect(grouped.snapshot.get("even")!.get("b")).toBe(4);
  });

  it("should move entry between groups when key changes", () => {
    const initial = IMap({ a: 2, b: 4 });
    const src = Reactive.create<IMap<string, number>>(
      graph,
      new MapOperations<string, number>(numberOps),
      changes,
      initial,
    );

    const grouped = groupByMap(graph, src, makeKeyFn(graph));
    graph.step();

    expect(grouped.snapshot.get("even")!.size).toBe(2);
    expect(grouped.snapshot.has("odd")).toBe(false);

    // Update a to odd
    changes.push([{ type: "update", key: "a", command: 3 }]);
    graph.step();

    expect(grouped.snapshot.get("even")!.size).toBe(1);
    expect(grouped.snapshot.get("even")!.get("b")).toBe(4);
    expect(grouped.snapshot.get("odd")!.size).toBe(1);
    expect(grouped.snapshot.get("odd")!.get("a")).toBe(3);
  });

  it("should delete group when last entry is removed", () => {
    const initial = IMap({ a: 1, b: 2 });
    const src = Reactive.create<IMap<string, number>>(
      graph,
      new MapOperations<string, number>(numberOps),
      changes,
      initial,
    );

    const grouped = groupByMap(graph, src, makeKeyFn(graph));
    graph.step();

    expect(grouped.snapshot.get("odd")!.get("a")).toBe(1);

    changes.push([{ type: "delete", key: "a" }]);
    graph.step();

    expect(grouped.snapshot.has("odd")).toBe(false);
    expect(grouped.snapshot.get("even")!.get("b")).toBe(2);
  });

  it("should remove entry from group but keep group when others remain", () => {
    const initial = IMap({ a: 1, b: 3, c: 2 });
    const src = Reactive.create<IMap<string, number>>(
      graph,
      new MapOperations<string, number>(numberOps),
      changes,
      initial,
    );

    const grouped = groupByMap(graph, src, makeKeyFn(graph));
    graph.step();

    expect(grouped.snapshot.get("odd")!.size).toBe(2);

    changes.push([{ type: "delete", key: "a" }]);
    graph.step();

    expect(grouped.snapshot.get("odd")!.size).toBe(1);
    expect(grouped.snapshot.get("odd")!.get("b")).toBe(3);
    expect(grouped.snapshot.get("odd")!.has("a")).toBe(false);
  });

  it("should handle clear", () => {
    const initial = IMap({ a: 1, b: 2, c: 3 });
    const src = Reactive.create<IMap<string, number>>(
      graph,
      new MapOperations<string, number>(numberOps),
      changes,
      initial,
    );

    const grouped = groupByMap(graph, src, makeKeyFn(graph));
    graph.step();

    expect(grouped.snapshot.size).toBe(2);

    changes.push([{ type: "clear" }]);
    graph.step();

    expect(grouped.snapshot.size).toBe(0);
  });

  it("should call f once per ID (not on updates)", () => {
    const initial = IMap({ a: 1, b: 2 });
    const src = Reactive.create<IMap<string, number>>(
      graph,
      new MapOperations<string, number>(numberOps),
      changes,
      initial,
    );

    let fCallCount = 0;
    const grouped = groupByMap<string, number, string>(graph, src, (rx) => {
      fCallCount++;
      const key = rx.materialized.map((n) => (n % 2 === 0 ? "even" : "odd"));
      const keyChanges = rx.changes.map((cmd) =>
        cmd !== null ? ((cmd as number) % 2 === 0 ? "even" : "odd") : null,
      );
      return Reactive.create<string>(graph, stringOps, keyChanges, key.value);
    });
    graph.step();

    expect(fCallCount).toBe(2);

    // Update shouldn't call f
    changes.push([{ type: "update", key: "a", command: 3 }]);
    graph.step();
    expect(fCallCount).toBe(2);

    // Delete shouldn't call f
    changes.push([{ type: "delete", key: "a" }]);
    graph.step();
    expect(fCallCount).toBe(2);

    // Add new entry should call f once
    changes.push([{ type: "add", key: "c", value: 5 }]);
    graph.step();
    expect(fCallCount).toBe(3);
  });

  it("should delete old group when key change empties it", () => {
    const initial = IMap({ a: 2 });
    const src = Reactive.create<IMap<string, number>>(
      graph,
      new MapOperations<string, number>(numberOps),
      changes,
      initial,
    );

    const grouped = groupByMap(graph, src, makeKeyFn(graph));
    graph.step();

    expect(grouped.snapshot.has("even")).toBe(true);

    // Move the only even to odd
    changes.push([{ type: "update", key: "a", command: 3 }]);
    graph.step();

    expect(grouped.snapshot.has("even")).toBe(false);
    expect(grouped.snapshot.get("odd")!.get("a")).toBe(3);
  });
});
