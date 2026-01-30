import { describe, it, expect, beforeEach } from "vitest";
import { Graph, inputValue, Input } from "derivation";
import { Map as IMap } from "immutable";
import { Reactive } from "../reactive.js";
import { MapOperations, MapCommand } from "../map-operations.js";
import { mapMap } from "../map-reactive.js";
import { flattenMap } from "../flatten-map.js";
import { PrimitiveOperations } from "../primitive-operations.js";
import { Tuple } from "../tuple.js";

// Simple operations for number values
const numberOps = new PrimitiveOperations<number>();

describe("mapMap", () => {
  let graph: Graph;
  let changes: Input<MapCommand<string, number>[]>;
  let map: Reactive<IMap<string, number>>;

  beforeEach(() => {
    graph = new Graph();
    changes = inputValue(graph, [] as MapCommand<string, number>[]);
    map = Reactive.create<IMap<string, number>>(
      graph,
      new MapOperations<string, number>(numberOps),
      changes,
      IMap<string, number>(),
    );
  });

  it("should map empty map to empty map", () => {
    const mapped = mapMap<string, number, number>(graph, map, (rx) => {
      const doubled = rx.materialized.map((x) => x * 2);
      const doubledChanges = rx.changes.map((cmd) =>
        cmd !== null ? (cmd as number) * 2 : null,
      );
      return Reactive.create(graph, numberOps, doubledChanges, doubled.value);
    });
    graph.step();

    expect(mapped.snapshot.size).toBe(0);
  });

  it("should map initial values", () => {
    const initialMap = IMap({ a: 1, b: 2, c: 3 });
    const mapWithData = Reactive.create<IMap<string, number>>(
      graph,
      new MapOperations<string, number>(numberOps),
      changes,
      initialMap,
    );

    const mapped = mapMap<string, number, number>(graph, mapWithData, (rx) => {
      const doubled = rx.materialized.map((x) => x * 2);
      const doubledChanges = rx.changes.map((cmd) =>
        cmd !== null ? (cmd as number) * 2 : null,
      );
      return Reactive.create(graph, numberOps, doubledChanges, doubled.value);
    });
    graph.step();

    expect(mapped.snapshot.get("a")).toBe(2);
    expect(mapped.snapshot.get("b")).toBe(4);
    expect(mapped.snapshot.get("c")).toBe(6);
  });

  it("should handle set", () => {
    const mapped = mapMap<string, number, number>(graph, map, (rx) => {
      const doubled = rx.materialized.map((x) => x * 2);
      const doubledChanges = rx.changes.map((cmd) =>
        cmd !== null ? (cmd as number) * 2 : null,
      );
      return Reactive.create(graph, numberOps, doubledChanges, doubled.value);
    });
    graph.step();

    changes.push([{ type: "add", key: "x", value: 5 }]);
    graph.step();

    expect(mapped.snapshot.get("x")).toBe(10);
  });

  it("should handle multiple sets", () => {
    const mapped = mapMap<string, number, number>(graph, map, (rx) => {
      const doubled = rx.materialized.map((x) => x * 2);
      const doubledChanges = rx.changes.map((cmd) =>
        cmd !== null ? (cmd as number) * 2 : null,
      );
      return Reactive.create(graph, numberOps, doubledChanges, doubled.value);
    });
    graph.step();

    changes.push([
      { type: "add", key: "a", value: 1 },
      { type: "add", key: "b", value: 2 },
      { type: "add", key: "c", value: 3 },
    ]);
    graph.step();

    expect(mapped.snapshot.get("a")).toBe(2);
    expect(mapped.snapshot.get("b")).toBe(4);
    expect(mapped.snapshot.get("c")).toBe(6);
  });

  it("should handle update", () => {
    const initialMap = IMap({ a: 1, b: 2, c: 3 });
    const mapWithData = Reactive.create<IMap<string, number>>(
      graph,
      new MapOperations<string, number>(numberOps),
      changes,
      initialMap,
    );

    const mapped = mapMap<string, number, number>(graph, mapWithData, (rx) => {
      const doubled = rx.materialized.map((x) => x * 2);
      const doubledChanges = rx.changes.map((cmd) =>
        cmd !== null ? (cmd as number) * 2 : null,
      );
      return Reactive.create(graph, numberOps, doubledChanges, doubled.value);
    });
    graph.step();

    expect(mapped.snapshot.get("b")).toBe(4);

    // Update key "b" to value 10
    changes.push([{ type: "update", key: "b", command: 10 }]);
    graph.step();

    expect(mapped.snapshot.get("a")).toBe(2);
    expect(mapped.snapshot.get("b")).toBe(20);
    expect(mapped.snapshot.get("c")).toBe(6);
  });

  it("should handle delete", () => {
    const initialMap = IMap({ a: 1, b: 2, c: 3 });
    const mapWithData = Reactive.create<IMap<string, number>>(
      graph,
      new MapOperations<string, number>(numberOps),
      changes,
      initialMap,
    );

    const mapped = mapMap<string, number, number>(graph, mapWithData, (rx) => {
      const doubled = rx.materialized.map((x) => x * 2);
      const doubledChanges = rx.changes.map((cmd) =>
        cmd !== null ? (cmd as number) * 2 : null,
      );
      return Reactive.create(graph, numberOps, doubledChanges, doubled.value);
    });
    graph.step();

    changes.push([{ type: "delete", key: "b" }]);
    graph.step();

    expect(mapped.snapshot.has("b")).toBe(false);
    expect(mapped.snapshot.get("a")).toBe(2);
    expect(mapped.snapshot.get("c")).toBe(6);
  });

  it("should handle clear", () => {
    const initialMap = IMap({ a: 1, b: 2, c: 3 });
    const mapWithData = Reactive.create<IMap<string, number>>(
      graph,
      new MapOperations<string, number>(numberOps),
      changes,
      initialMap,
    );

    const mapped = mapMap<string, number, number>(graph, mapWithData, (rx) => {
      const doubled = rx.materialized.map((x) => x * 2);
      const doubledChanges = rx.changes.map((cmd) =>
        cmd !== null ? (cmd as number) * 2 : null,
      );
      return Reactive.create(graph, numberOps, doubledChanges, doubled.value);
    });
    graph.step();

    changes.push([{ type: "clear" }]);
    graph.step();

    expect(mapped.snapshot.size).toBe(0);
  });

  it("should propagate updates through the reactive chain correctly", () => {
    const initialMap = IMap({ a: 1, b: 2, c: 3 });
    const mapWithData = Reactive.create<IMap<string, number>>(
      graph,
      new MapOperations<string, number>(numberOps),
      changes,
      initialMap,
    );

    const mapped = mapMap<string, number, number>(graph, mapWithData, (rx) => {
      const doubled = rx.materialized.map((x) => x * 2);
      const doubledChanges = rx.changes.map((cmd) =>
        cmd !== null ? (cmd as number) * 2 : null,
      );
      return Reactive.create(graph, numberOps, doubledChanges, doubled.value);
    });
    graph.step();

    expect(mapped.snapshot.get("a")).toBe(2);
    expect(mapped.snapshot.get("b")).toBe(4);
    expect(mapped.snapshot.get("c")).toBe(6);

    // Multiple updates in the same batch
    changes.push([
      { type: "update", key: "a", command: 100 },
      { type: "update", key: "b", command: 200 },
      { type: "update", key: "c", command: 300 },
    ]);
    graph.step();

    expect(mapped.snapshot.get("a")).toBe(200);
    expect(mapped.snapshot.get("b")).toBe(400);
    expect(mapped.snapshot.get("c")).toBe(600);
  });

  it("should only call f on set (new key), not on update or delete", () => {
    const initialMap = IMap({ a: 1, b: 2, c: 3 });
    const mapWithData = Reactive.create<IMap<string, number>>(
      graph,
      new MapOperations<string, number>(numberOps),
      changes,
      initialMap,
    );

    let fCallCount = 0;

    const mapped = mapMap<string, number, number>(graph, mapWithData, (rx) => {
      fCallCount++;
      const doubled = rx.materialized.map((x) => x * 2);
      const doubledChanges = rx.changes.map((cmd) =>
        cmd !== null ? (cmd as number) * 2 : null,
      );
      return Reactive.create(graph, numberOps, doubledChanges, doubled.value);
    });
    graph.step();

    // f called 3 times for initial items
    expect(fCallCount).toBe(3);

    // Update shouldn't call f
    changes.push([{ type: "update", key: "a", command: 10 }]);
    graph.step();
    expect(fCallCount).toBe(3);

    // Delete shouldn't call f
    changes.push([{ type: "delete", key: "a" }]);
    graph.step();
    expect(fCallCount).toBe(3);

    // Set with new key should call f exactly once
    changes.push([{ type: "add", key: "x", value: 99 }]);
    graph.step();
    expect(fCallCount).toBe(4);

    // Multiple sets with new keys should call f for each
    changes.push([
      { type: "add", key: "y", value: 100 },
      { type: "add", key: "z", value: 101 },
    ]);
    graph.step();
    expect(fCallCount).toBe(6);
  });

  it("should handle delete and set in the same batch correctly", () => {
    const initialMap = IMap({ a: 1, b: 2, c: 3 });
    const mapWithData = Reactive.create<IMap<string, number>>(
      graph,
      new MapOperations<string, number>(numberOps),
      changes,
      initialMap,
    );

    const mapped = mapMap<string, number, number>(graph, mapWithData, (rx) => {
      const doubled = rx.materialized.map((x) => x * 2);
      const doubledChanges = rx.changes.map((cmd) =>
        cmd !== null ? (cmd as number) * 2 : null,
      );
      return Reactive.create(graph, numberOps, doubledChanges, doubled.value);
    });
    graph.step();

    changes.push([
      { type: "delete", key: "b" },
      { type: "add", key: "d", value: 10 },
    ]);
    graph.step();

    expect(mapped.snapshot.has("b")).toBe(false);
    expect(mapped.snapshot.get("d")).toBe(20);
    expect(mapped.snapshot.get("a")).toBe(2);
    expect(mapped.snapshot.get("c")).toBe(6);
  });

  it("should handle delete then re-add of same key in the same batch", () => {
    const initialMap = IMap({ a: 1 });
    const mapWithData = Reactive.create<IMap<string, number>>(
      graph,
      new MapOperations<string, number>(numberOps),
      changes,
      initialMap,
    );

    const mapped = mapMap<string, number, number>(graph, mapWithData, (rx) => {
      const doubled = rx.materialized.map((x) => x * 2);
      const doubledChanges = rx.changes.map((cmd) =>
        cmd !== null ? (cmd as number) * 2 : null,
      );
      return Reactive.create(graph, numberOps, doubledChanges, doubled.value);
    });
    graph.step();

    // Delete and re-add key "a" within the same batch
    changes.push([
      { type: "delete", key: "a" },
      { type: "add", key: "a", value: 100 },
    ]);
    graph.step();

    expect(mapped.snapshot.get("a")).toBe(200);
  });

  it("should not apply updates from a deleted key to a new value added later in the batch", () => {
    const mapped = mapMap<string, number, number>(graph, map, (rx) => {
      const doubled = rx.materialized.map((x) => x * 2);
      const doubledChanges = rx.changes.map((cmd) =>
        cmd !== null ? (cmd as number) * 2 : null,
      );
      return Reactive.create(graph, numberOps, doubledChanges, doubled.value);
    });
    graph.step();

    changes.push([
      { type: "add", key: "x", value: 5 },
      { type: "update", key: "x", command: 10 },
      { type: "delete", key: "x" },
      { type: "add", key: "x", value: 7 },
    ]);
    graph.step();

    expect(mapped.snapshot.get("x")).toBe(14);
  });

  it("should handle delete then re-add of same key", () => {
    const initialMap = IMap({ a: 1 });
    const mapWithData = Reactive.create<IMap<string, number>>(
      graph,
      new MapOperations<string, number>(numberOps),
      changes,
      initialMap,
    );

    const mapped = mapMap<string, number, number>(graph, mapWithData, (rx) => {
      const doubled = rx.materialized.map((x) => x * 2);
      const doubledChanges = rx.changes.map((cmd) =>
        cmd !== null ? (cmd as number) * 2 : null,
      );
      return Reactive.create(graph, numberOps, doubledChanges, doubled.value);
    });
    graph.step();

    expect(mapped.snapshot.get("a")).toBe(2);

    // Delete key "a"
    changes.push([{ type: "delete", key: "a" }]);
    graph.step();

    expect(mapped.snapshot.has("a")).toBe(false);

    // Re-add key "a" with a different value
    changes.push([{ type: "add", key: "a", value: 100 }]);
    graph.step();

    // Should be 200 (100 * 2), not 2 (stale value from before deletion)
    expect(mapped.snapshot.get("a")).toBe(200);
  });

  it("should pass key to mapping function", () => {
    const initialMap = IMap({ a: 1, b: 2 });
    const mapWithData = Reactive.create<IMap<string, number>>(
      graph,
      new MapOperations<string, number>(numberOps),
      changes,
      initialMap,
    );

    const keysReceived: string[] = [];

    const mapped = mapMap<string, number, number>(
      graph,
      mapWithData,
      (rx, key) => {
        keysReceived.push(key);
        const doubled = rx.materialized.map((x) => x * 2);
        const doubledChanges = rx.changes.map((cmd) =>
          cmd !== null ? (cmd as number) * 2 : null,
        );
        return Reactive.create(graph, numberOps, doubledChanges, doubled.value);
      },
    );
    graph.step();

    expect(keysReceived.sort()).toEqual(["a", "b"]);
  });

  it("should handle update to a dynamically added key", () => {
    const mapped = mapMap<string, number, number>(graph, map, (rx) => {
      const doubled = rx.materialized.map((x) => x * 2);
      const doubledChanges = rx.changes.map((cmd) =>
        cmd !== null ? (cmd as number) * 2 : null,
      );
      return Reactive.create<number>(
        graph,
        numberOps,
        doubledChanges,
        doubled.value,
      );
    });
    graph.step();

    // Add a new key dynamically
    changes.push([{ type: "add", key: "x", value: 5 }]);
    graph.step();

    expect(mapped.snapshot.get("x")).toBe(10); // 5 * 2

    // Update the dynamically added key
    changes.push([{ type: "update", key: "x", command: 20 }]);
    graph.step();

    // Should be 40 (20 * 2) — but the bug causes ry.changes.value to be
    // stale (null) because yChanges evaluates before the dynamically
    // created rx/ry chain, so the update is silently dropped.
    expect(mapped.snapshot.get("x")).toBe(40);
  });

  it("should produce valid operations for flattenMap when starting empty", () => {
    // mapMap starting from an empty map, where f returns a Reactive<Map>,
    // then piped into flattenMap — reproduces the bug where mapMap leaves
    // valueOperations as undefined because getOrCreateY is never called.
    const innerNumberOps = new PrimitiveOperations<number>();
    const innerOps = new MapOperations<string, number>(innerNumberOps);

    const mapped = mapMap<string, number, IMap<string, number>>(
      graph,
      map,
      (rx) => {
        // Transform each number into a single-entry inner map
        const innerMap = rx.materialized.map((x) =>
          IMap<string, number>({ val: x }),
        );
        const innerChanges = rx.changes.map(
          () => [] as MapCommand<string, number>[],
        );
        return Reactive.create<IMap<string, number>>(
          graph,
          innerOps,
          innerChanges,
          innerMap.value,
        );
      },
    );

    // This is where the crash happens: flattenMap accesses
    // mapped.operations.valueOperations.valueOperations
    const flat = flattenMap(graph, mapped);
    expect(flat.snapshot.size).toBe(0);
  });
});
