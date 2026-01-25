import { describe, it, expect, beforeEach } from "vitest";
import { Graph, inputValue, Input } from "derivation";
import { List } from "immutable";
import { Reactive } from "../reactive.js";
import { ListOperations, ListCommand } from "../list-operations.js";
import { tagWithIds, ID } from "../tag-with-ids.js";

// Simple operations for number items
const numberOps = {
  emptyCommand: () => null,
  isEmpty: (cmd: unknown) => cmd === null,
  mergeCommands: (a: unknown, b: unknown) => b ?? a,
  apply: (state: number, cmd: unknown) => (cmd !== null ? (cmd as number) : state),
};

describe("tagWithIds", () => {
  let graph: Graph;
  let changes: Input<ListCommand<number>[]>;
  let list: Reactive<List<number>>;

  beforeEach(() => {
    graph = new Graph();
    changes = inputValue(graph, [] as ListCommand<number>[]);
    list = Reactive.create(graph, new ListOperations(numberOps), changes, List<number>());
  });

  it("should start with empty ids for empty list", () => {
    const tagged = tagWithIds(list);
    graph.step();

    expect(tagged.structure.snapshot.size).toBe(0);
    expect(tagged.updates.value).toEqual([]);
  });

  it("should assign unique id on insert", () => {
    const tagged = tagWithIds(list);
    graph.step();

    changes.push([{ type: "insert", index: 0, value: 42 }]);
    graph.step();

    expect(tagged.structure.snapshot.size).toBe(1);
    expect(tagged.initialValues.get(tagged.structure.snapshot.get(0)!)).toBe(42);
  });

  it("should preserve id across updates", () => {
    const tagged = tagWithIds(list);
    graph.step();

    changes.push([{ type: "insert", index: 0, value: 42 }]);
    graph.step();

    const id = tagged.structure.snapshot.get(0);

    changes.push([{ type: "update", index: 0, command: 100 }]);
    graph.step();

    expect(tagged.structure.snapshot.get(0)).toBe(id);
    expect(tagged.updates.value.length).toBe(1);
    expect(tagged.updates.value[0].id).toBe(id);
    expect(tagged.updates.value[0].command).toBe(100);
  });

  it("should preserve ids when inserting at beginning", () => {
    const tagged = tagWithIds(list);
    graph.step();

    // Insert two items
    changes.push([
      { type: "insert", index: 0, value: 1 },
      { type: "insert", index: 1, value: 2 },
    ]);
    graph.step();

    const id0 = tagged.structure.snapshot.get(0);
    const id1 = tagged.structure.snapshot.get(1);

    // Insert at beginning
    changes.push([{ type: "insert", index: 0, value: 0 }]);
    graph.step();

    // Original items should keep their ids, just shifted
    expect(tagged.structure.snapshot.get(1)).toBe(id0);
    expect(tagged.structure.snapshot.get(2)).toBe(id1);
    // New item has new id
    expect(tagged.structure.snapshot.get(0)).not.toBe(id0);
    expect(tagged.structure.snapshot.get(0)).not.toBe(id1);
  });

  it("should track id through move", () => {
    const tagged = tagWithIds(list);
    graph.step();

    changes.push([
      { type: "insert", index: 0, value: 1 },
      { type: "insert", index: 1, value: 2 },
      { type: "insert", index: 2, value: 3 },
    ]);
    graph.step();

    const id0 = tagged.structure.snapshot.get(0);
    const id1 = tagged.structure.snapshot.get(1);
    const id2 = tagged.structure.snapshot.get(2);

    // Move first item to end
    changes.push([{ type: "move", from: 0, to: 2 }]);
    graph.step();

    expect(tagged.structure.snapshot.get(0)).toBe(id1);
    expect(tagged.structure.snapshot.get(1)).toBe(id2);
    expect(tagged.structure.snapshot.get(2)).toBe(id0);
  });

  it("should emit remove", () => {
    const tagged = tagWithIds(list);
    graph.step();

    changes.push([
      { type: "insert", index: 0, value: 1 },
      { type: "insert", index: 1, value: 2 },
    ]);
    graph.step();

    const id1 = tagged.structure.snapshot.get(1);

    changes.push([{ type: "remove", index: 0 }]);
    graph.step();

    expect(tagged.structure.snapshot.size).toBe(1);
    expect(tagged.structure.snapshot.get(0)).toBe(id1);
  });

  it("should handle clear", () => {
    const tagged = tagWithIds(list);
    graph.step();

    changes.push([
      { type: "insert", index: 0, value: 1 },
      { type: "insert", index: 1, value: 2 },
    ]);
    graph.step();

    changes.push([{ type: "clear" }]);
    graph.step();

    expect(tagged.structure.snapshot.size).toBe(0);
  });

  it("should handle multiple commands in one step", () => {
    const tagged = tagWithIds(list);
    graph.step();

    changes.push([
      { type: "insert", index: 0, value: 1 },
      { type: "insert", index: 1, value: 2 },
      { type: "update", index: 0, command: 10 },
    ]);
    graph.step();

    expect(tagged.structure.snapshot.size).toBe(2);
    expect(tagged.updates.value.length).toBe(1);
    expect(tagged.updates.value[0].id).toBe(tagged.structure.snapshot.get(0));
    expect(tagged.updates.value[0].command).toBe(10);
  });

  it("should initialize ids for non-empty list", () => {
    // Create list with initial values
    const initialList = List([10, 20, 30]);
    const listWithData = Reactive.create(
      graph,
      new ListOperations(numberOps),
      changes,
      initialList,
    );

    const tagged = tagWithIds(listWithData);
    graph.step();

    expect(tagged.structure.snapshot.size).toBe(3);
    // Each id should be unique
    const id0 = tagged.structure.snapshot.get(0);
    const id1 = tagged.structure.snapshot.get(1);
    const id2 = tagged.structure.snapshot.get(2);
    expect(id0).not.toBe(id1);
    expect(id1).not.toBe(id2);
    expect(id0).not.toBe(id2);
    // Initial values should be captured
    expect(tagged.initialValues.get(id0!)).toBe(10);
    expect(tagged.initialValues.get(id1!)).toBe(20);
    expect(tagged.initialValues.get(id2!)).toBe(30);
  });
});
