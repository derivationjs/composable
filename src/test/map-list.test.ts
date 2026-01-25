import { describe, it, expect, beforeEach } from "vitest";
import { Graph, inputValue, Input } from "derivation";
import { List } from "immutable";
import { Reactive } from "../reactive.js";
import { ListOperations, ListCommand } from "../list-operations.js";
import { mapList } from "../list-reactive.js";
import { Operations } from "../operations.js";

// Simple operations for number items
const numberOps: Operations<number> = {
  emptyCommand: () => null,
  isEmpty: (cmd: unknown) => cmd === null,
  mergeCommands: (a: unknown, b: unknown) => b ?? a,
  apply: (state: number, cmd: unknown) =>
    cmd !== null ? (cmd as number) : state,
};

describe("mapList", () => {
  let graph: Graph;
  let changes: Input<ListCommand<number>[]>;
  let list: Reactive<List<number>>;

  beforeEach(() => {
    graph = new Graph();
    changes = inputValue(graph, [] as ListCommand<number>[]);
    list = Reactive.create(
      graph,
      new ListOperations(numberOps),
      changes,
      List<number>(),
    );
  });

  it("should map empty list to empty list", () => {
    const mapped = mapList(graph, numberOps, list, (rx) => {
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
    const initialList = List([1, 2, 3]);
    const listWithData = Reactive.create(
      graph,
      new ListOperations(numberOps),
      changes,
      initialList,
    );

    const mapped = mapList(graph, numberOps, listWithData, (rx) => {
      const doubled = rx.materialized.map((x) => x * 2);
      const doubledChanges = rx.changes.map((cmd) =>
        cmd !== null ? (cmd as number) * 2 : null,
      );
      return Reactive.create(graph, numberOps, doubledChanges, doubled.value);
    });
    graph.step();

    expect(mapped.snapshot.toArray()).toEqual([2, 4, 6]);
  });

  it("should handle insert", () => {
    const mapped = mapList(graph, numberOps, list, (rx) => {
      const doubled = rx.materialized.map((x) => x * 2);
      const doubledChanges = rx.changes.map((cmd) =>
        cmd !== null ? (cmd as number) * 2 : null,
      );
      return Reactive.create(graph, numberOps, doubledChanges, doubled.value);
    });
    graph.step();

    changes.push([{ type: "insert", index: 0, value: 5 }]);
    graph.step();

    expect(mapped.snapshot.toArray()).toEqual([10]);
  });

  it("should handle multiple inserts", () => {
    const mapped = mapList(graph, numberOps, list, (rx) => {
      const doubled = rx.materialized.map((x) => x * 2);
      const doubledChanges = rx.changes.map((cmd) =>
        cmd !== null ? (cmd as number) * 2 : null,
      );
      return Reactive.create(graph, numberOps, doubledChanges, doubled.value);
    });
    graph.step();

    changes.push([
      { type: "insert", index: 0, value: 1 },
      { type: "insert", index: 1, value: 2 },
      { type: "insert", index: 2, value: 3 },
    ]);
    graph.step();

    expect(mapped.snapshot.toArray()).toEqual([2, 4, 6]);
  });

  it("should handle update", () => {
    const initialList = List([1, 2, 3]);
    const listWithData = Reactive.create(
      graph,
      new ListOperations(numberOps),
      changes,
      initialList,
    );

    const mapped = mapList(graph, numberOps, listWithData, (rx) => {
      const doubled = rx.materialized.map((x) => x * 2);
      const doubledChanges = rx.changes.map((cmd) =>
        cmd !== null ? (cmd as number) * 2 : null,
      );
      return Reactive.create(graph, numberOps, doubledChanges, doubled.value);
    });
    graph.step();

    expect(mapped.snapshot.toArray()).toEqual([2, 4, 6]);

    // Update index 1 to value 10
    changes.push([{ type: "update", index: 1, command: 10 }]);
    graph.step();

    expect(mapped.snapshot.toArray()).toEqual([2, 20, 6]);
  });

  it("should handle remove", () => {
    const initialList = List([1, 2, 3]);
    const listWithData = Reactive.create(
      graph,
      new ListOperations(numberOps),
      changes,
      initialList,
    );

    const mapped = mapList(graph, numberOps, listWithData, (rx) => {
      const doubled = rx.materialized.map((x) => x * 2);
      const doubledChanges = rx.changes.map((cmd) =>
        cmd !== null ? (cmd as number) * 2 : null,
      );
      return Reactive.create(graph, numberOps, doubledChanges, doubled.value);
    });
    graph.step();

    changes.push([{ type: "remove", index: 1 }]);
    graph.step();

    expect(mapped.snapshot.toArray()).toEqual([2, 6]);
  });

  it("should handle move", () => {
    const initialList = List([1, 2, 3]);
    const listWithData = Reactive.create(
      graph,
      new ListOperations(numberOps),
      changes,
      initialList,
    );

    const mapped = mapList(graph, numberOps, listWithData, (rx) => {
      const doubled = rx.materialized.map((x) => x * 2);
      const doubledChanges = rx.changes.map((cmd) =>
        cmd !== null ? (cmd as number) * 2 : null,
      );
      return Reactive.create(graph, numberOps, doubledChanges, doubled.value);
    });
    graph.step();

    // Move first to last
    changes.push([{ type: "move", from: 0, to: 2 }]);
    graph.step();

    expect(mapped.snapshot.toArray()).toEqual([4, 6, 2]);
  });

  it("should handle clear", () => {
    const initialList = List([1, 2, 3]);
    const listWithData = Reactive.create(
      graph,
      new ListOperations(numberOps),
      changes,
      initialList,
    );

    const mapped = mapList(graph, numberOps, listWithData, (rx) => {
      const doubled = rx.materialized.map((x) => x * 2);
      const doubledChanges = rx.changes.map((cmd) =>
        cmd !== null ? (cmd as number) * 2 : null,
      );
      return Reactive.create(graph, numberOps, doubledChanges, doubled.value);
    });
    graph.step();

    changes.push([{ type: "clear" }]);
    graph.step();

    expect(mapped.snapshot.toArray()).toEqual([]);
  });

  it("should preserve item identity across structural changes", () => {
    const initialList = List([1, 2, 3]);
    const listWithData = Reactive.create(
      graph,
      new ListOperations(numberOps),
      changes,
      initialList,
    );

    const mapped = mapList(graph, numberOps, listWithData, (rx) => {
      const doubled = rx.materialized.map((x) => x * 2);
      const doubledChanges = rx.changes.map((cmd) =>
        cmd !== null ? (cmd as number) * 2 : null,
      );
      return Reactive.create(graph, numberOps, doubledChanges, doubled.value);
    });
    graph.step();

    // Insert at beginning, then update the original first item (now at index 1)
    changes.push([{ type: "insert", index: 0, value: 0 }]);
    graph.step();

    expect(mapped.snapshot.toArray()).toEqual([0, 2, 4, 6]);

    // Update what was originally the first item (now at index 1)
    changes.push([{ type: "update", index: 1, command: 10 }]);
    graph.step();

    expect(mapped.snapshot.toArray()).toEqual([0, 20, 4, 6]);
  });

  it("should handle remove and update in the same batch correctly", () => {
    const initialList = List([1, 2, 3]);
    const listWithData = Reactive.create(
      graph,
      new ListOperations(numberOps),
      changes,
      initialList,
    );

    const mapped = mapList(graph, numberOps, listWithData, (rx) => {
      const doubled = rx.materialized.map((x) => x * 2);
      const doubledChanges = rx.changes.map((cmd) =>
        cmd !== null ? (cmd as number) * 2 : null,
      );
      return Reactive.create(graph, numberOps, doubledChanges, doubled.value);
    });
    graph.step();

    expect(mapped.snapshot.toArray()).toEqual([2, 4, 6]);

    changes.push([
      { type: "remove", index: 1 },
      { type: "update", index: 1, command: 10 },
    ]);
    graph.step();

    expect(mapped.snapshot.toArray()).toEqual([2, 20]);
  });

  it("should propagate updates through the reactive chain correctly", () => {
    // This test checks that updates to source items propagate correctly
    // through the mapped reactives. The bug is that in apply(), ry.snapshot
    // might be stale if ry.materialized hasn't been evaluated yet.
    const initialList = List([1, 2, 3]);
    const listWithData = Reactive.create(
      graph,
      new ListOperations(numberOps),
      changes,
      initialList,
    );

    // Use a mapping that makes stale vs fresh values clearly distinguishable
    // If the source is X, mapped should be X * 2
    // If ry.snapshot is stale (initial value), we'd see old value * 2
    const mapped = mapList(graph, numberOps, listWithData, (rx) => {
      const doubled = rx.materialized.map((x) => x * 2);
      const doubledChanges = rx.changes.map((cmd) =>
        cmd !== null ? (cmd as number) * 2 : null,
      );
      return Reactive.create(graph, numberOps, doubledChanges, doubled.value);
    });
    graph.step();

    expect(mapped.snapshot.toArray()).toEqual([2, 4, 6]);

    // Multiple updates in the same batch
    // If evaluation order is wrong, some updates might use stale ry.snapshot
    changes.push([
      { type: "update", index: 0, command: 100 },
      { type: "update", index: 1, command: 200 },
      { type: "update", index: 2, command: 300 },
    ]);
    graph.step();

    // All three should be doubled: [200, 400, 600]
    // Bug: if ry.snapshot is stale, we might see [2, 4, 6] (unchanged)
    // or partial updates like [200, 4, 6]
    expect(mapped.snapshot.toArray()).toEqual([200, 400, 600]);
  });

  it("should handle async-style mapping where f returns a derived reactive", () => {
    // This tests a mapping function that computes Y from X in a more
    // complex way, where the bug would be more apparent.
    const initialList = List([10, 20, 30]);
    const listWithData = Reactive.create(
      graph,
      new ListOperations(numberOps),
      changes,
      initialList,
    );

    // Mapping: add 1000 to the value
    const mapped = mapList(graph, numberOps, listWithData, (rx) => {
      const offset = rx.materialized.map((x) => x + 1000);
      const offsetChanges = rx.changes.map((cmd) =>
        cmd !== null ? (cmd as number) + 1000 : null,
      );
      return Reactive.create(graph, numberOps, offsetChanges, offset.value);
    });
    graph.step();

    expect(mapped.snapshot.toArray()).toEqual([1010, 1020, 1030]);

    // Update middle element
    changes.push([{ type: "update", index: 1, command: 50 }]);
    graph.step();

    // Middle element should be 50 + 1000 = 1050
    expect(mapped.snapshot.toArray()).toEqual([1010, 1050, 1030]);
  });

  it("should only call f on insert, not on update or other changes", () => {
    const initialList = List([1, 2, 3]);
    const listWithData = Reactive.create(
      graph,
      new ListOperations(numberOps),
      changes,
      initialList,
    );

    let fCallCount = 0;

    const mapped = mapList(graph, numberOps, listWithData, (rx) => {
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
    changes.push([{ type: "update", index: 0, command: 10 }]);
    graph.step();
    expect(fCallCount).toBe(3);

    // Move shouldn't call f
    changes.push([{ type: "move", from: 0, to: 2 }]);
    graph.step();
    expect(fCallCount).toBe(3);

    // Remove shouldn't call f
    changes.push([{ type: "remove", index: 0 }]);
    graph.step();
    expect(fCallCount).toBe(3);

    // Insert should call f exactly once
    changes.push([{ type: "insert", index: 0, value: 99 }]);
    graph.step();
    expect(fCallCount).toBe(4);

    // Multiple inserts should call f for each
    changes.push([
      { type: "insert", index: 0, value: 100 },
      { type: "insert", index: 1, value: 101 },
    ]);
    graph.step();
    expect(fCallCount).toBe(6);
  });
});
