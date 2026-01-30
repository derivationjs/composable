import { describe, it, expect, beforeEach } from "vitest";
import { Graph, inputValue, Input } from "derivation";
import { Map as IMap } from "immutable";
import { Reactive } from "../reactive.js";
import { MapOperations, MapCommand } from "../map-operations.js";
import { PrimitiveOperations } from "../primitive-operations.js";
import { getSingleMapValue } from "../get-single-map-value.js";
import { List } from "immutable";
import { ListOperations, ListCommand } from "../list-operations.js";

const numberOps = new PrimitiveOperations<number>();

describe("getSingleMapValue", () => {
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
      IMap({ a: 1 }),
    );
  });

  it("should extract the only value when map size is 1", () => {
    const value = getSingleMapValue(graph, map, 0);
    graph.step();

    expect(value.snapshot).toBe(1);
  });

  it("should use default value when map is empty", () => {
    const emptyChanges = inputValue(graph, [] as MapCommand<string, number>[]);
    const emptyMap = Reactive.create<IMap<string, number>>(
      graph,
      new MapOperations<string, number>(numberOps),
      emptyChanges,
      IMap<string, number>(),
    );

    const value = getSingleMapValue(graph, emptyMap, 7);
    graph.step();

    expect(value.snapshot).toBe(7);
  });

  it("should use default value when map has more than one entry", () => {
    const multiChanges = inputValue(graph, [] as MapCommand<string, number>[]);
    const multiMap = Reactive.create<IMap<string, number>>(
      graph,
      new MapOperations<string, number>(numberOps),
      multiChanges,
      IMap({ a: 1, b: 2 }),
    );

    const value = getSingleMapValue(graph, multiMap, 9);
    graph.step();

    expect(value.snapshot).toBe(9);
  });

  it("should update when size transitions to 1", () => {
    const value = getSingleMapValue(graph, map, 0);
    graph.step();

    expect(value.snapshot).toBe(1);

    changes.push([{ type: "add", key: "b", value: 2 }]);
    graph.step();
    expect(value.snapshot).toBe(0);

    changes.push([{ type: "delete", key: "b" }]);
    graph.step();
    expect(value.snapshot).toBe(1);
  });

  it("should update when the single value changes", () => {
    const value = getSingleMapValue(graph, map, 0);
    graph.step();

    changes.push([{ type: "update", key: "a", command: 5 }]);
    graph.step();

    expect(value.snapshot).toBe(5);
  });

  it("should fall back to default on clear and recover on add", () => {
    const value = getSingleMapValue(graph, map, 3);
    graph.step();

    changes.push([{ type: "clear" }]);
    graph.step();
    expect(value.snapshot).toBe(3);

    changes.push([{ type: "add", key: "z", value: 8 }]);
    graph.step();
    expect(value.snapshot).toBe(8);
  });

  it("should pass through list updates without replacing the list", () => {
    const listOps = new ListOperations<number>(numberOps);
    const outerOps = new MapOperations<string, List<number>>(listOps);
    const listMapChanges = inputValue(
      graph,
      [] as MapCommand<string, List<number>>[],
    );
    const listMap = Reactive.create<IMap<string, List<number>>>(
      graph,
      outerOps,
      listMapChanges,
      IMap({ only: List([1, 2]) }),
    );

    const single = getSingleMapValue(graph, listMap, List<number>());
    graph.step();

    const listInsert: ListCommand<number> = {
      type: "insert",
      index: 2,
      value: 3,
    };
    listMapChanges.push([
      { type: "update", key: "only", command: [listInsert] },
    ]);
    graph.step();

    expect(single.changes.value).toEqual([listInsert]);
  });
});
