import { describe, it, expect, beforeEach } from "vitest";
import { Graph, inputValue, Input } from "derivation";
import { List } from "immutable";
import { Reactive } from "../reactive.js";
import { ListOperations, ListCommand } from "../list-operations.js";
import { PrimitiveOperations } from "../primitive-operations.js";
import { decomposeList } from "../decompose-list.js";

const numberOps = new PrimitiveOperations<number>();

describe("decomposeList", () => {
  let graph: Graph;
  let changes: Input<ListCommand<number>[]>;
  let list: Reactive<List<number>>;

  beforeEach(() => {
    graph = new Graph();
    changes = inputValue(graph, [] as ListCommand<number>[]);
    list = Reactive.create<List<number>>(
      graph,
      new ListOperations(numberOps),
      changes,
      List<number>(),
    );
  });

  it("should return empty id list and empty map for empty list", () => {
    const [ids, map] = decomposeList(graph, list);
    graph.step();

    expect(ids.snapshot.size).toBe(0);
    expect(map.snapshot.size).toBe(0);
  });

  it("should assign an id and map entry on insert", () => {
    const [ids, map] = decomposeList(graph, list);
    graph.step();

    changes.push([{ type: "insert", index: 0, value: 42 }]);
    graph.step();

    expect(ids.snapshot.size).toBe(1);
    expect(map.snapshot.size).toBe(1);
    const id = ids.snapshot.get(0)!;
    expect(map.snapshot.get(id)).toBe(42);
  });

  it("should update the map value on update", () => {
    const [ids, map] = decomposeList(graph, list);
    graph.step();

    changes.push([{ type: "insert", index: 0, value: 42 }]);
    graph.step();

    const id = ids.snapshot.get(0)!;

    changes.push([{ type: "update", index: 0, command: 100 }]);
    graph.step();

    // id list unchanged
    expect(ids.snapshot.size).toBe(1);
    expect(ids.snapshot.get(0)).toBe(id);
    // map value updated
    expect(map.snapshot.get(id)).toBe(100);
  });

  it("should preserve ids when inserting at beginning", () => {
    const [ids, map] = decomposeList(graph, list);
    graph.step();

    changes.push([
      { type: "insert", index: 0, value: 1 },
      { type: "insert", index: 1, value: 2 },
    ]);
    graph.step();

    const id0 = ids.snapshot.get(0)!;
    const id1 = ids.snapshot.get(1)!;

    changes.push([{ type: "insert", index: 0, value: 0 }]);
    graph.step();

    expect(ids.snapshot.get(1)).toBe(id0);
    expect(ids.snapshot.get(2)).toBe(id1);
    const newId = ids.snapshot.get(0)!;
    expect(newId).not.toBe(id0);
    expect(newId).not.toBe(id1);
    expect(map.snapshot.get(newId)).toBe(0);
    expect(map.snapshot.get(id0)).toBe(1);
    expect(map.snapshot.get(id1)).toBe(2);
  });

  it("should track id through move without changing map", () => {
    const [ids, map] = decomposeList(graph, list);
    graph.step();

    changes.push([
      { type: "insert", index: 0, value: 1 },
      { type: "insert", index: 1, value: 2 },
      { type: "insert", index: 2, value: 3 },
    ]);
    graph.step();

    const id0 = ids.snapshot.get(0)!;
    const id1 = ids.snapshot.get(1)!;
    const id2 = ids.snapshot.get(2)!;

    changes.push([{ type: "move", from: 0, to: 2 }]);
    graph.step();

    expect(ids.snapshot.get(0)).toBe(id1);
    expect(ids.snapshot.get(1)).toBe(id2);
    expect(ids.snapshot.get(2)).toBe(id0);
    // map values unchanged
    expect(map.snapshot.get(id0)).toBe(1);
    expect(map.snapshot.get(id1)).toBe(2);
    expect(map.snapshot.get(id2)).toBe(3);
  });

  it("should remove from both id list and map", () => {
    const [ids, map] = decomposeList(graph, list);
    graph.step();

    changes.push([
      { type: "insert", index: 0, value: 1 },
      { type: "insert", index: 1, value: 2 },
    ]);
    graph.step();

    const id0 = ids.snapshot.get(0)!;
    const id1 = ids.snapshot.get(1)!;

    changes.push([{ type: "remove", index: 0 }]);
    graph.step();

    expect(ids.snapshot.size).toBe(1);
    expect(ids.snapshot.get(0)).toBe(id1);
    expect(map.snapshot.size).toBe(1);
    expect(map.snapshot.has(id0)).toBe(false);
    expect(map.snapshot.get(id1)).toBe(2);
  });

  it("should clear both id list and map", () => {
    const [ids, map] = decomposeList(graph, list);
    graph.step();

    changes.push([
      { type: "insert", index: 0, value: 1 },
      { type: "insert", index: 1, value: 2 },
    ]);
    graph.step();

    changes.push([{ type: "clear" }]);
    graph.step();

    expect(ids.snapshot.size).toBe(0);
    expect(map.snapshot.size).toBe(0);
  });

  it("should handle multiple commands in one step", () => {
    const [ids, map] = decomposeList(graph, list);
    graph.step();

    changes.push([
      { type: "insert", index: 0, value: 1 },
      { type: "insert", index: 1, value: 2 },
      { type: "update", index: 0, command: 10 },
    ]);
    graph.step();

    expect(ids.snapshot.size).toBe(2);
    expect(map.snapshot.size).toBe(2);
    const id0 = ids.snapshot.get(0)!;
    const id1 = ids.snapshot.get(1)!;
    expect(map.snapshot.get(id0)).toBe(10);
    expect(map.snapshot.get(id1)).toBe(2);
  });

  it("should initialize from a non-empty list", () => {
    const initialList = List([10, 20, 30]);
    const listWithData = Reactive.create<List<number>>(
      graph,
      new ListOperations(numberOps),
      changes,
      initialList,
    );

    const [ids, map] = decomposeList(graph, listWithData);
    graph.step();

    expect(ids.snapshot.size).toBe(3);
    expect(map.snapshot.size).toBe(3);

    const id0 = ids.snapshot.get(0)!;
    const id1 = ids.snapshot.get(1)!;
    const id2 = ids.snapshot.get(2)!;
    expect(id0).not.toBe(id1);
    expect(id1).not.toBe(id2);
    expect(id0).not.toBe(id2);
    expect(map.snapshot.get(id0)).toBe(10);
    expect(map.snapshot.get(id1)).toBe(20);
    expect(map.snapshot.get(id2)).toBe(30);
  });

  it("should support further mutations after initializing from non-empty list", () => {
    const initialList = List([10, 20]);
    const listWithData = Reactive.create<List<number>>(
      graph,
      new ListOperations(numberOps),
      changes,
      initialList,
    );

    const [ids, map] = decomposeList(graph, listWithData);
    graph.step();

    const id0 = ids.snapshot.get(0)!;
    const id1 = ids.snapshot.get(1)!;

    changes.push([
      { type: "update", index: 1, command: 99 },
      { type: "insert", index: 2, value: 30 },
    ]);
    graph.step();

    expect(ids.snapshot.size).toBe(3);
    expect(map.snapshot.size).toBe(3);
    expect(map.snapshot.get(id0)).toBe(10);
    expect(map.snapshot.get(id1)).toBe(99);
    const id2 = ids.snapshot.get(2)!;
    expect(map.snapshot.get(id2)).toBe(30);
  });
});
