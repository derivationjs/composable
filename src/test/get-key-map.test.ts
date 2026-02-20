import { describe, it, expect, beforeEach } from "vitest";
import { Graph, inputValue, Input } from "derivation";
import { Map as IMap } from "immutable";
import { Reactive } from "../reactive.js";
import { Cell } from "../cell.js";
import { CellOperations } from "../cell-operations.js";
import { MapOperations, MapCommand } from "../map-operations.js";
import { getKeyMap } from "../get-key-map.js";

const numberOps = new CellOperations<number>();

describe("getKeyMap", () => {
  let graph: Graph;
  let changes: Input<MapCommand<string, Cell<number>>[]>;
  let map: Reactive<IMap<string, Cell<number>>>;

  beforeEach(() => {
    graph = new Graph();
    changes = inputValue(graph, [] as MapCommand<string, Cell<number>>[]);
    map = Reactive.create<IMap<string, Cell<number>>>(
      graph,
      new MapOperations<string, Cell<number>>(numberOps),
      changes,
      IMap({ a: new Cell(1), b: new Cell(2), c: new Cell(3) }),
    );
  });

  it("should extract a key's initial value", () => {
    const b = getKeyMap(graph, map, "b", new Cell(0));
    graph.step();

    expect(b.snapshot.value).toBe(2);
  });

  it("should propagate updates to the key", () => {
    const b = getKeyMap(graph, map, "b", new Cell(0));
    graph.step();

    changes.push([{ type: "update", key: "b", command: 20 }]);
    graph.step();

    expect(b.snapshot.value).toBe(20);
  });

  it("should ignore updates to other keys", () => {
    const b = getKeyMap(graph, map, "b", new Cell(0));
    graph.step();

    changes.push([{ type: "update", key: "a", command: 99 }]);
    graph.step();

    expect(b.snapshot.value).toBe(2);
  });

  it("should handle multiple updates in one batch", () => {
    const b = getKeyMap(graph, map, "b", new Cell(0));
    graph.step();

    changes.push([
      { type: "update", key: "b", command: 10 },
      { type: "update", key: "a", command: 99 },
    ]);
    graph.step();

    expect(b.snapshot.value).toBe(10);
  });

  it("should handle sequential updates across steps", () => {
    const a = getKeyMap(graph, map, "a", new Cell(0));
    graph.step();

    changes.push([{ type: "update", key: "a", command: 10 }]);
    graph.step();
    expect(a.snapshot.value).toBe(10);

    changes.push([{ type: "update", key: "a", command: 42 }]);
    graph.step();
    expect(a.snapshot.value).toBe(42);
  });

  it("should handle a key being added after creation", () => {
    const emptyChanges = inputValue(graph, [] as MapCommand<string, Cell<number>>[]);
    const emptyMap = Reactive.create<IMap<string, Cell<number>>>(
      graph,
      new MapOperations<string, Cell<number>>(numberOps),
      emptyChanges,
      IMap<string, Cell<number>>(),
    );

    const a = getKeyMap(graph, emptyMap, "a", new Cell(0));
    graph.step();

    emptyChanges.push([{ type: "add", key: "a", value: new Cell(42) }]);
    graph.step();

    expect(a.snapshot.value).toBe(42);
  });

  it("should revert to default value when key is deleted", () => {
    const b = getKeyMap(graph, map, "b", new Cell(0));
    graph.step();

    expect(b.snapshot.value).toBe(2);

    changes.push([{ type: "delete", key: "b" }]);
    graph.step();

    expect(b.snapshot.value).toBe(0);
  });

  it("should handle a key being deleted and re-added", () => {
    const b = getKeyMap(graph, map, "b", new Cell(0));
    graph.step();

    expect(b.snapshot.value).toBe(2);

    changes.push([{ type: "delete", key: "b" }]);
    graph.step();

    changes.push([{ type: "add", key: "b", value: new Cell(99) }]);
    graph.step();

    expect(b.snapshot.value).toBe(99);
  });

  it("should work with nested map values", () => {
    const innerOps = new CellOperations<number>();
    const outerOps = new MapOperations<string, Cell<number>>(innerOps);
    const nestedOps = new MapOperations<string, IMap<string, Cell<number>>>(outerOps);

    const nestedChanges = inputValue(
      graph,
      [] as MapCommand<string, IMap<string, Cell<number>>>[],
    );
    const nestedMap = Reactive.create<IMap<string, IMap<string, Cell<number>>>>(
      graph,
      nestedOps,
      nestedChanges,
      IMap({ x: IMap({ p: new Cell(1), q: new Cell(2) }) }),
    );

    const x = getKeyMap(graph, nestedMap, "x", IMap<string, Cell<number>>());
    graph.step();

    expect(x.snapshot.get("p")?.value).toBe(1);
    expect(x.snapshot.get("q")?.value).toBe(2);

    // Update via inner map command
    nestedChanges.push([
      { type: "update", key: "x", command: [{ type: "update", key: "p", command: 10 }] },
    ]);
    graph.step();

    expect(x.snapshot.get("p")?.value).toBe(10);
    expect(x.snapshot.get("q")?.value).toBe(2);
  });
});
