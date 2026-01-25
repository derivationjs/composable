import { describe, it, expect, beforeEach } from "vitest";
import { Graph, inputValue, Input } from "derivation";
import { groupBy } from "../group-by.js";

describe("groupBy", () => {
  let graph: Graph;
  let source: Input<{ key: string; value: number }[]>;

  beforeEach(() => {
    graph = new Graph();
    source = inputValue(graph, []);
  });

  it("should return empty map for empty source", () => {
    const grouped = groupBy(
      source,
      (e) => e.key,
      (e) => e.value,
    );
    expect(grouped.value.toJS()).toEqual({});

    graph.step();

    expect(grouped.value.toJS()).toEqual({});
  });

  it("should group events by key", () => {
    const grouped = groupBy(
      source,
      (e) => e.key,
      (e) => e.value,
    );

    source.push([
      { key: "a", value: 1 },
      { key: "b", value: 2 },
      { key: "a", value: 3 },
    ]);
    graph.step();

    expect(grouped.value.toJS()).toEqual({
      a: [1, 3],
      b: [2],
    });
  });

  it("should update grouping when source changes", () => {
    const grouped = groupBy(
      source,
      (e) => e.key,
      (e) => e.value,
    );

    source.push([{ key: "a", value: 1 }]);
    graph.step();
    expect(grouped.value.get("a")).toEqual([1]);

    source.push([
      { key: "a", value: 2 },
      { key: "a", value: 3 },
    ]);
    graph.step();
    expect(grouped.value.get("a")).toEqual([2, 3]);
  });

  it("should remove keys that no longer exist", () => {
    const grouped = groupBy(
      source,
      (e) => e.key,
      (e) => e.value,
    );

    source.push([
      { key: "a", value: 1 },
      { key: "b", value: 2 },
    ]);
    graph.step();
    expect(grouped.value.has("a")).toBe(true);
    expect(grouped.value.has("b")).toBe(true);

    source.push([{ key: "b", value: 3 }]);
    graph.step();
    expect(grouped.value.has("a")).toBe(false);
    expect(grouped.value.get("b")).toEqual([3]);
  });

  describe("select", () => {
    it("should return reactive value for a specific key", () => {
      const grouped = groupBy(
        source,
        (e) => e.key,
        (e) => e.value,
      );

      source.push([
        { key: "a", value: 1 },
        { key: "a", value: 2 },
      ]);
      graph.step();

      const selectA = grouped.select("a");
      expect(selectA.value).toEqual([1, 2]);
    });

    it("should return empty array for non-existent key", () => {
      const grouped = groupBy(
        source,
        (e) => e.key,
        (e) => e.value,
      );
      graph.step();

      const selectA = grouped.select("a");
      expect(selectA.value).toEqual([]);
    });

    it("should update when source changes", () => {
      const grouped = groupBy(
        source,
        (e) => e.key,
        (e) => e.value,
      );
      graph.step();

      const selectA = grouped.select("a");
      expect(selectA.value).toEqual([]);

      source.push([{ key: "a", value: 1 }]);
      graph.step();
      expect(selectA.value).toEqual([1]);

      source.push([
        { key: "a", value: 2 },
        { key: "a", value: 3 },
      ]);
      graph.step();
      expect(selectA.value).toEqual([2, 3]);
    });

    it("should clear when key disappears from source", () => {
      const grouped = groupBy(
        source,
        (e) => e.key,
        (e) => e.value,
      );

      source.push([{ key: "a", value: 1 }]);
      graph.step();

      const selectA = grouped.select("a");
      expect(selectA.value).toEqual([1]);

      source.push([{ key: "b", value: 2 }]);
      graph.step();
      expect(selectA.value).toEqual([]);
    });

    it("should return same instance for same key", () => {
      const grouped = groupBy(
        source,
        (e) => e.key,
        (e) => e.value,
      );
      graph.step();

      const selectA1 = grouped.select("a");
      const selectA2 = grouped.select("a");
      expect(selectA1).toBe(selectA2);
    });

    it("should handle key reappearing after disappearing", () => {
      const grouped = groupBy(
        source,
        (e) => e.key,
        (e) => e.value,
      );

      source.push([{ key: "a", value: 1 }]);
      graph.step();
      const selectA = grouped.select("a");
      expect(selectA.value).toEqual([1]);

      source.push([{ key: "b", value: 2 }]);
      graph.step();
      expect(selectA.value).toEqual([]);

      source.push([{ key: "a", value: 3 }]);
      graph.step();
      expect(selectA.value).toEqual([3]);
    });

    it("should work when select is called before key exists", () => {
      const grouped = groupBy(
        source,
        (e) => e.key,
        (e) => e.value,
      );
      graph.step();

      const selectA = grouped.select("a");
      expect(selectA.value).toEqual([]);

      source.push([{ key: "a", value: 1 }]);
      graph.step();
      expect(selectA.value).toEqual([1]);
    });
  });

  describe("dependency propagation", () => {
    it("should notify dependents of select stream", () => {
      const grouped = groupBy(
        source,
        (e) => e.key,
        (e) => e.value,
      );
      graph.step();

      const selectA = grouped.select("a");
      const mapped = selectA.map((values) => values.reduce((a, b) => a + b, 0));

      source.push([
        { key: "a", value: 1 },
        { key: "a", value: 2 },
      ]);
      graph.step();

      expect(mapped.value).toBe(3);
    });

    it("should invoke sink callbacks on updates", () => {
      const grouped = groupBy(
        source,
        (e) => e.key,
        (e) => e.value,
      );
      graph.step();

      const selectA = grouped.select("a");

      const results: number[][] = [];
      const sink = selectA.sink((values) => results.push([...values]));

      source.push([{ key: "a", value: 1 }]);
      graph.step();

      source.push([
        { key: "a", value: 2 },
        { key: "a", value: 3 },
      ]);
      graph.step();

      // First entry is from sink creation (initial value), then two updates
      expect(results).toEqual([[], [1], [2, 3]]);

      // Keep sink referenced
      expect(sink).toBeDefined();
    });

    it("should propagate updates through mapped streams", () => {
      const grouped = groupBy(
        source,
        (e) => e.key,
        (e) => e.value,
      );
      graph.step();

      const selectA = grouped.select("a");
      const mapped = selectA.map((values) => values.length);

      expect(mapped.value).toBe(0);

      source.push([{ key: "a", value: 1 }]);
      graph.step();
      expect(mapped.value).toBe(1);

      source.push([
        { key: "a", value: 2 },
        { key: "a", value: 3 },
      ]);
      graph.step();
      expect(mapped.value).toBe(2);
    });
  });

  describe("edge cases", () => {
    it("should handle numeric keys", () => {
      const numSource = inputValue<{ key: number; value: string }[]>(graph, []);
      const grouped = groupBy(
        numSource,
        (e) => e.key,
        (e) => e.value,
      );

      numSource.push([
        { key: 1, value: "a" },
        { key: 2, value: "b" },
        { key: 1, value: "c" },
      ]);
      graph.step();

      expect(grouped.value.get(1)).toEqual(["a", "c"]);
      expect(grouped.value.get(2)).toEqual(["b"]);
    });

    it("should handle object values", () => {
      const grouped = groupBy(
        source,
        (e) => e.key,
        (e) => ({ num: e.value }),
      );

      source.push([
        { key: "a", value: 1 },
        { key: "a", value: 2 },
      ]);
      graph.step();

      expect(grouped.value.get("a")).toEqual([{ num: 1 }, { num: 2 }]);
    });

    it("should preserve order within groups", () => {
      const grouped = groupBy(
        source,
        (e) => e.key,
        (e) => e.value,
      );

      source.push([
        { key: "a", value: 3 },
        { key: "a", value: 1 },
        { key: "a", value: 2 },
      ]);
      graph.step();

      expect(grouped.value.get("a")).toEqual([3, 1, 2]);
    });

    it("should handle empty source after having data", () => {
      const grouped = groupBy(
        source,
        (e) => e.key,
        (e) => e.value,
      );

      source.push([{ key: "a", value: 1 }]);
      graph.step();
      const selectA = grouped.select("a");
      expect(selectA.value).toEqual([1]);

      source.push([]);
      graph.step();
      expect(grouped.value.size).toBe(0);
      expect(selectA.value).toEqual([]);
    });

    it("should handle many keys", () => {
      const grouped = groupBy(
        source,
        (e) => e.key,
        (e) => e.value,
      );

      const events = Array.from({ length: 100 }, (_, i) => ({
        key: `key${i % 10}`,
        value: i,
      }));
      source.push(events);
      graph.step();

      expect(grouped.value.size).toBe(10);
      for (let i = 0; i < 10; i++) {
        expect(grouped.value.get(`key${i}`)?.length).toBe(10);
      }
    });
  });
});
