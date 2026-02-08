import { describe, it, expect, beforeEach } from "vitest";
import { Graph, inputValue, Input } from "derivation";
import { List, Map as IMap } from "immutable";
import { Reactive } from "../reactive.js";
import { ListOperations, ListCommand } from "../list-operations.js";
import { groupByList } from "../group-by-list.js";
import { Operations } from "../operations.js";
import { PrimitiveOperations } from "../primitive-operations.js";

// Simple operations for number items
const numberOps = new PrimitiveOperations<number>();

// Simple operations for string items
const stringOps = new PrimitiveOperations<string>();

describe("groupByList", () => {
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

  it("should group empty list into empty map", () => {
    const grouped = groupByList<number, string>(graph, list, (rx) => {
      const key = rx.materialized.map((n) => (n % 2 === 0 ? "even" : "odd"));
      const keyChanges = rx.changes.map((cmd) =>
        cmd !== null ? ((cmd as number) % 2 === 0 ? "even" : "odd") : null,
      );
      return Reactive.create<string>(graph, stringOps, keyChanges, key.value);
    });
    graph.step();

    expect(grouped.snapshot.size).toBe(0);
  });

  it("should group initial values by even/odd", () => {
    const initialList = List([1, 2, 3, 4, 5]);
    const listWithData = Reactive.create<List<number>>(
      graph,
      new ListOperations(numberOps),
      changes,
      initialList,
    );

    const grouped = groupByList<number, string>(graph, listWithData, (rx) => {
      const key = rx.materialized.map((n) => (n % 2 === 0 ? "even" : "odd"));
      const keyChanges = rx.changes.map((cmd) =>
        cmd !== null ? ((cmd as number) % 2 === 0 ? "even" : "odd") : null,
      );
      return Reactive.create<string>(graph, stringOps, keyChanges, key.value);
    });
    graph.step();

    expect(grouped.snapshot.get("odd")?.toArray()).toEqual([1, 3, 5]);
    expect(grouped.snapshot.get("even")?.toArray()).toEqual([2, 4]);
  });

  it.skip("should handle inserting items into groups", () => {
    const initialList = List([1, 2]);
    const listWithData = Reactive.create<List<number>>(
      graph,
      new ListOperations(numberOps),
      changes,
      initialList,
    );

    const grouped = groupByList<number, string>(graph, listWithData, (rx) => {
      const key = rx.materialized.map((n) => (n % 2 === 0 ? "even" : "odd"));
      const keyChanges = rx.changes.map((cmd) =>
        cmd !== null ? ((cmd as number) % 2 === 0 ? "even" : "odd") : null,
      );
      return Reactive.create<string>(graph, stringOps, keyChanges, key.value);
    });
    graph.step();

    expect(grouped.snapshot.get("odd")?.toArray()).toEqual([1]);
    expect(grouped.snapshot.get("even")?.toArray()).toEqual([2]);

    // Insert another odd number
    changes.push([{ type: "insert", index: 2, value: 3 }]);
    graph.step();

    expect(grouped.snapshot.get("odd")?.toArray()).toEqual([1, 3]);
    expect(grouped.snapshot.get("even")?.toArray()).toEqual([2]);

    // Insert another even number
    changes.push([{ type: "insert", index: 3, value: 4 }]);
    graph.step();

    expect(grouped.snapshot.get("odd")?.toArray()).toEqual([1, 3]);
    expect(grouped.snapshot.get("even")?.toArray()).toEqual([2, 4]);
  });

  it("should handle removing items from groups", () => {
    const initialList = List([1, 2, 3, 4]);
    const listWithData = Reactive.create<List<number>>(
      graph,
      new ListOperations(numberOps),
      changes,
      initialList,
    );

    const grouped = groupByList<number, string>(graph, listWithData, (rx) => {
      const key = rx.materialized.map((n) => (n % 2 === 0 ? "even" : "odd"));
      const keyChanges = rx.changes.map((cmd) =>
        cmd !== null ? ((cmd as number) % 2 === 0 ? "even" : "odd") : null,
      );
      return Reactive.create<string>(graph, stringOps, keyChanges, key.value);
    });
    graph.step();

    expect(grouped.snapshot.get("odd")?.toArray()).toEqual([1, 3]);
    expect(grouped.snapshot.get("even")?.toArray()).toEqual([2, 4]);

    // Remove an odd number (index 0, value 1)
    changes.push([{ type: "remove", index: 0 }]);
    graph.step();

    expect(grouped.snapshot.get("odd")?.toArray()).toEqual([3]);
    expect(grouped.snapshot.get("even")?.toArray()).toEqual([2, 4]);

    // Remove last odd number
    changes.push([{ type: "remove", index: 1 }]); // Now index 1 is the old index 2, which was 3
    graph.step();

    expect(grouped.snapshot.has("odd")).toBe(false); // Group should be deleted when empty
    expect(grouped.snapshot.get("even")?.toArray()).toEqual([2, 4]);
  });

  it("should handle updating items within same group", () => {
    const initialList = List([2, 4]);
    const listWithData = Reactive.create<List<number>>(
      graph,
      new ListOperations(numberOps),
      changes,
      initialList,
    );

    const grouped = groupByList<number, string>(graph, listWithData, (rx) => {
      const key = rx.materialized.map((n) => (n % 2 === 0 ? "even" : "odd"));
      const keyChanges = rx.changes.map((cmd) =>
        cmd !== null ? ((cmd as number) % 2 === 0 ? "even" : "odd") : null,
      );
      return Reactive.create<string>(graph, stringOps, keyChanges, key.value);
    });
    graph.step();

    expect(grouped.snapshot.get("even")?.toArray()).toEqual([2, 4]);

    // Update first even number to a different even number
    changes.push([{ type: "update", index: 0, command: 6 }]);
    graph.step();

    expect(grouped.snapshot.get("even")?.toArray()).toEqual([6, 4]);
  });

  it.skip("should handle items moving between groups", () => {
    const initialList = List([2, 4]);
    const listWithData = Reactive.create<List<number>>(
      graph,
      new ListOperations(numberOps),
      changes,
      initialList,
    );

    const grouped = groupByList<number, string>(graph, listWithData, (rx) => {
      const key = rx.materialized.map((n) => (n % 2 === 0 ? "even" : "odd"));
      const keyChanges = rx.changes.map((cmd) =>
        cmd !== null ? ((cmd as number) % 2 === 0 ? "even" : "odd") : null,
      );
      return Reactive.create<string>(graph, stringOps, keyChanges, key.value);
    });
    graph.step();

    expect(grouped.snapshot.get("even")?.toArray()).toEqual([2, 4]);
    expect(grouped.snapshot.has("odd")).toBe(false);

    // Update first even number to an odd number
    changes.push([{ type: "update", index: 0, command: 3 }]);
    graph.step();

    expect(grouped.snapshot.get("even")?.toArray()).toEqual([4]);
    expect(grouped.snapshot.get("odd")?.toArray()).toEqual([3]);
  });

  it("should handle clear command", () => {
    const initialList = List([1, 2, 3, 4]);
    const listWithData = Reactive.create<List<number>>(
      graph,
      new ListOperations(numberOps),
      changes,
      initialList,
    );

    const grouped = groupByList<number, string>(graph, listWithData, (rx) => {
      const key = rx.materialized.map((n) => (n % 2 === 0 ? "even" : "odd"));
      const keyChanges = rx.changes.map((cmd) =>
        cmd !== null ? ((cmd as number) % 2 === 0 ? "even" : "odd") : null,
      );
      return Reactive.create<string>(graph, stringOps, keyChanges, key.value);
    });
    graph.step();

    expect(grouped.snapshot.size).toBe(2);

    changes.push([{ type: "clear" }]);
    graph.step();

    expect(grouped.snapshot.size).toBe(0);
  });

  it.skip("should maintain source list order within groups after insert", () => {
    // Start with [1, 3]
    // Grouped: odd=[1, 3]
    const initialList = List([1, 3]);
    const listWithData = Reactive.create<List<number>>(
      graph,
      new ListOperations(numberOps),
      changes,
      initialList,
    );

    const grouped = groupByList<number, string>(graph, listWithData, (rx) => {
      const key = rx.materialized.map((n) => (n % 2 === 0 ? "even" : "odd"));
      const keyChanges = rx.changes.map((cmd) =>
        cmd !== null ? ((cmd as number) % 2 === 0 ? "even" : "odd") : null,
      );
      return Reactive.create<string>(graph, stringOps, keyChanges, key.value);
    });
    graph.step();

    expect(grouped.snapshot.get("odd")?.toArray()).toEqual([1, 3]);

    // Insert 5 in the middle (index 1)
    // Source list becomes: [1, 5, 3]
    // Odd group should be: [1, 5, 3] (not [1, 3, 5])
    changes.push([{ type: "insert", index: 1, value: 5 }]);
    graph.step();

    expect(grouped.snapshot.get("odd")?.toArray()).toEqual([1, 5, 3]);

    // Insert even number at index 0
    // Source list becomes: [2, 1, 5, 3]
    // Odd group should still be: [1, 5, 3]
    // Even group should be: [2]
    changes.push([{ type: "insert", index: 0, value: 2 }]);
    graph.step();

    expect(grouped.snapshot.get("odd")?.toArray()).toEqual([1, 5, 3]);
    expect(grouped.snapshot.get("even")?.toArray()).toEqual([2]);

    // Insert another even number at index 2 (between 2 and 1)
    // Source list becomes: [2, 4, 1, 5, 3]
    // Even group should be: [2, 4] (in source order)
    changes.push([{ type: "insert", index: 2, value: 4 }]);
    graph.step();

    expect(grouped.snapshot.get("even")?.toArray()).toEqual([2, 4]);
    expect(grouped.snapshot.get("odd")?.toArray()).toEqual([1, 5, 3]);
  });

  it.skip("should maintain source order when item moves to new group mid-list", () => {
    // Source list: [1, 3, 5, 2, 4]
    // Grouped: odd=[1, 3, 5], even=[2, 4]
    const initialList = List([1, 3, 5, 2, 4]);
    const listWithData = Reactive.create<List<number>>(
      graph,
      new ListOperations(numberOps),
      changes,
      initialList,
    );

    const grouped = groupByList<number, string>(graph, listWithData, (rx) => {
      const key = rx.materialized.map((n) => (n % 2 === 0 ? "even" : "odd"));
      const keyChanges = rx.changes.map((cmd) =>
        cmd !== null ? ((cmd as number) % 2 === 0 ? "even" : "odd") : null,
      );
      return Reactive.create<string>(graph, stringOps, keyChanges, key.value);
    });
    graph.step();

    expect(grouped.snapshot.get("odd")?.toArray()).toEqual([1, 3, 5]);
    expect(grouped.snapshot.get("even")?.toArray()).toEqual([2, 4]);

    // Update index 1 (value 3) to 6 (even)
    // Source list becomes: [1, 6, 5, 2, 4]
    // 6 should be inserted BEFORE 2 and 4 in the even group (not at the end)
    // Expected groups: odd=[1, 5], even=[6, 2, 4]
    changes.push([{ type: "update", index: 1, command: 6 }]);
    graph.step();

    expect(grouped.snapshot.get("odd")?.toArray()).toEqual([1, 5]);
    expect(grouped.snapshot.get("even")?.toArray()).toEqual([6, 2, 4]);

    // Update index 4 (value 4) to 7 (odd)
    // Source list becomes: [1, 6, 5, 2, 7]
    // 7 should be inserted AFTER 1 and 5 in the odd group (at the end)
    // Expected groups: odd=[1, 5, 7], even=[6, 2]
    changes.push([{ type: "update", index: 4, command: 7 }]);
    graph.step();

    expect(grouped.snapshot.get("odd")?.toArray()).toEqual([1, 5, 7]);
    expect(grouped.snapshot.get("even")?.toArray()).toEqual([6, 2]);
  });

  it("should maintain source list order within groups after move", () => {
    // Source list: [1, 3, 5, 2, 4]
    // Grouped: odd=[1, 3, 5], even=[2, 4]
    const initialList = List([1, 3, 5, 2, 4]);
    const listWithData = Reactive.create<List<number>>(
      graph,
      new ListOperations(numberOps),
      changes,
      initialList,
    );

    const grouped = groupByList<number, string>(graph, listWithData, (rx) => {
      const key = rx.materialized.map((n) => (n % 2 === 0 ? "even" : "odd"));
      const keyChanges = rx.changes.map((cmd) =>
        cmd !== null ? ((cmd as number) % 2 === 0 ? "even" : "odd") : null,
      );
      return Reactive.create<string>(graph, stringOps, keyChanges, key.value);
    });
    graph.step();

    expect(grouped.snapshot.get("odd")?.toArray()).toEqual([1, 3, 5]);
    expect(grouped.snapshot.get("even")?.toArray()).toEqual([2, 4]);

    // Move 5 (index 2) to the beginning (index 0)
    // Source list becomes: [5, 1, 3, 2, 4]
    // Odd group should reorder to: [5, 1, 3]
    changes.push([{ type: "move", from: 2, to: 0 }]);
    graph.step();

    expect(grouped.snapshot.get("odd")?.toArray()).toEqual([5, 1, 3]);
    expect(grouped.snapshot.get("even")?.toArray()).toEqual([2, 4]); // Even unchanged

    // Move 4 (index 4) to before 2 (index 3)
    // Source list becomes: [5, 1, 3, 4, 2]
    // Even group should reorder to: [4, 2]
    changes.push([{ type: "move", from: 4, to: 3 }]);
    graph.step();

    expect(grouped.snapshot.get("odd")?.toArray()).toEqual([5, 1, 3]);
    expect(grouped.snapshot.get("even")?.toArray()).toEqual([4, 2]);
  });
});
