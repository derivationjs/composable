import { describe, it, expect } from "vitest";
import { TwoThreeTree, Monoid } from "../two-three-tree.js";

// Standard summary type for tests - just tracks size
type Summary = { size: number };

const summaryMonoid: Monoid<Summary> = {
  empty: { size: 0 },
  combine: (a, b) => ({ size: a.size + b.size }),
};

const measure = (): Summary => ({ size: 1 });

// Helper to create a tree with the standard summary type
function createTree<K, V>() {
  return new TwoThreeTree<K, V, Summary>(summaryMonoid, measure);
}

// Helper to insert at a specific index
function insertAt<K, V>(
  tree: TwoThreeTree<K, V, Summary>,
  index: number,
  id: K,
  value: V,
) {
  tree.insert(id, value, (prefix) => prefix.size > index);
}

// Helper to find by index
function getByIndex<K, V>(
  tree: TwoThreeTree<K, V, Summary>,
  index: number,
): { id: K; value: V } | undefined {
  return tree.findByThreshold((acc) => acc.size > index);
}

// Helper to get index by id
function getIndexById<K, V>(
  tree: TwoThreeTree<K, V, Summary>,
  id: K,
): number | undefined {
  const prefix = tree.getPrefixSummaryById(id);
  return prefix?.size;
}

describe("TwoThreeTree", () => {
  describe("empty tree operations", () => {
    it("should start empty", () => {
      const tree = createTree<string, number>();
      expect(tree.summary.size).toBe(0);
    });

    it("should return undefined for findByThreshold on empty tree", () => {
      const tree = createTree<string, number>();
      expect(getByIndex(tree, 0)).toBeUndefined();
      expect(getByIndex(tree, -1)).toBeUndefined();
    });

    it("should return undefined for getPrefixSummaryById on empty tree", () => {
      const tree = createTree<string, number>();
      expect(tree.getPrefixSummaryById("nonexistent")).toBeUndefined();
    });

    it("should iterate over empty tree without yielding", () => {
      const tree = createTree<string, number>();
      const items = [...tree];
      expect(items).toEqual([]);
    });
  });

  describe("insert operations", () => {
    it("should insert single item", () => {
      const tree = createTree<string, number>();
      insertAt(tree, 0, "a", 1);
      expect(tree.summary.size).toBe(1);
      expect(getByIndex(tree, 0)).toEqual({ id: "a", value: 1 });
    });

    it("should insert at beginning", () => {
      const tree = createTree<string, number>();
      insertAt(tree, 0, "b", 2);
      insertAt(tree, 0, "a", 1);
      expect(tree.summary.size).toBe(2);
      expect(getByIndex(tree, 0)).toEqual({ id: "a", value: 1 });
      expect(getByIndex(tree, 1)).toEqual({ id: "b", value: 2 });
    });

    it("should insert at end", () => {
      const tree = createTree<string, number>();
      insertAt(tree, 0, "a", 1);
      insertAt(tree, 1, "b", 2);
      expect(tree.summary.size).toBe(2);
      expect(getByIndex(tree, 0)).toEqual({ id: "a", value: 1 });
      expect(getByIndex(tree, 1)).toEqual({ id: "b", value: 2 });
    });

    it("should insert in middle", () => {
      const tree = createTree<string, number>();
      insertAt(tree, 0, "a", 1);
      insertAt(tree, 1, "c", 3);
      insertAt(tree, 1, "b", 2);
      expect(tree.summary.size).toBe(3);
      expect(getByIndex(tree, 0)).toEqual({ id: "a", value: 1 });
      expect(getByIndex(tree, 1)).toEqual({ id: "b", value: 2 });
      expect(getByIndex(tree, 2)).toEqual({ id: "c", value: 3 });
    });

    it("should handle many insertions", () => {
      const tree = createTree<string, number>();
      for (let i = 0; i < 100; i++) {
        insertAt(tree, i, `item${i}`, i);
      }
      expect(tree.summary.size).toBe(100);
      for (let i = 0; i < 100; i++) {
        expect(getByIndex(tree, i)).toEqual({ id: `item${i}`, value: i });
      }
    });

    it("should handle insertions at random positions", () => {
      const tree = createTree<string, number>();
      const expected: { id: string; value: number }[] = [];

      // Insert in pattern that exercises various tree restructuring
      const insertions = [
        { idx: 0, id: "a", val: 1 },
        { idx: 1, id: "b", val: 2 },
        { idx: 0, id: "c", val: 3 },
        { idx: 2, id: "d", val: 4 },
        { idx: 1, id: "e", val: 5 },
        { idx: 3, id: "f", val: 6 },
        { idx: 0, id: "g", val: 7 },
      ];

      for (const { idx, id, val } of insertions) {
        insertAt(tree, idx, id, val);
        expected.splice(idx, 0, { id, value: val });
      }

      expect(tree.summary.size).toBe(expected.length);
      for (let i = 0; i < expected.length; i++) {
        expect(getByIndex(tree, i)).toEqual(expected[i]);
      }
    });
  });

  describe("remove operations", () => {
    it("should remove single item", () => {
      const tree = createTree<string, number>();
      insertAt(tree, 0, "a", 1);
      tree.remove("a");
      expect(tree.summary.size).toBe(0);
    });

    it("should remove from beginning", () => {
      const tree = createTree<string, number>();
      insertAt(tree, 0, "a", 1);
      insertAt(tree, 1, "b", 2);
      tree.remove("a");
      expect(tree.summary.size).toBe(1);
      expect(getByIndex(tree, 0)).toEqual({ id: "b", value: 2 });
    });

    it("should remove from end", () => {
      const tree = createTree<string, number>();
      insertAt(tree, 0, "a", 1);
      insertAt(tree, 1, "b", 2);
      tree.remove("b");
      expect(tree.summary.size).toBe(1);
      expect(getByIndex(tree, 0)).toEqual({ id: "a", value: 1 });
    });

    it("should remove from middle", () => {
      const tree = createTree<string, number>();
      insertAt(tree, 0, "a", 1);
      insertAt(tree, 1, "b", 2);
      insertAt(tree, 2, "c", 3);
      tree.remove("b");
      expect(tree.summary.size).toBe(2);
      expect(getByIndex(tree, 0)).toEqual({ id: "a", value: 1 });
      expect(getByIndex(tree, 1)).toEqual({ id: "c", value: 3 });
    });

    it("should handle removing nonexistent item", () => {
      const tree = createTree<string, number>();
      insertAt(tree, 0, "a", 1);
      tree.remove("nonexistent");
      expect(tree.summary.size).toBe(1);
    });

    it("should handle many removals", () => {
      const tree = createTree<string, number>();
      for (let i = 0; i < 50; i++) {
        insertAt(tree, i, `item${i}`, i);
      }

      // Remove every other item
      for (let i = 0; i < 50; i += 2) {
        tree.remove(`item${i}`);
      }

      expect(tree.summary.size).toBe(25);

      // Verify remaining items
      const items = [...tree];
      for (let i = 0; i < 25; i++) {
        expect(items[i].id).toBe(`item${i * 2 + 1}`);
      }
    });

    it("should handle removal causing merges", () => {
      const tree = createTree<string, number>();
      // Build tree with enough items to have depth
      for (let i = 0; i < 20; i++) {
        insertAt(tree, i, `item${i}`, i);
      }

      // Remove items to trigger merge operations
      for (let i = 0; i < 15; i++) {
        tree.remove(`item${i}`);
      }

      expect(tree.summary.size).toBe(5);

      // Verify remaining items
      for (let i = 0; i < 5; i++) {
        expect(getByIndex(tree, i)).toEqual({
          id: `item${i + 15}`,
          value: i + 15,
        });
      }
    });
  });

  describe("index queries", () => {
    it("should get index by id", () => {
      const tree = createTree<string, number>();
      insertAt(tree, 0, "a", 1);
      insertAt(tree, 1, "b", 2);
      insertAt(tree, 2, "c", 3);

      expect(getIndexById(tree, "a")).toBe(0);
      expect(getIndexById(tree, "b")).toBe(1);
      expect(getIndexById(tree, "c")).toBe(2);
    });

    it("should return undefined for nonexistent id", () => {
      const tree = createTree<string, number>();
      insertAt(tree, 0, "a", 1);
      expect(getIndexById(tree, "nonexistent")).toBeUndefined();
    });

    it("should update indices after insert", () => {
      const tree = createTree<string, number>();
      insertAt(tree, 0, "a", 1);
      insertAt(tree, 1, "b", 2);

      expect(getIndexById(tree, "a")).toBe(0);
      expect(getIndexById(tree, "b")).toBe(1);

      insertAt(tree, 0, "z", 0);

      expect(getIndexById(tree, "z")).toBe(0);
      expect(getIndexById(tree, "a")).toBe(1);
      expect(getIndexById(tree, "b")).toBe(2);
    });

    it("should update indices after remove", () => {
      const tree = createTree<string, number>();
      insertAt(tree, 0, "a", 1);
      insertAt(tree, 1, "b", 2);
      insertAt(tree, 2, "c", 3);

      tree.remove("a");

      expect(getIndexById(tree, "b")).toBe(0);
      expect(getIndexById(tree, "c")).toBe(1);
    });
  });

  describe("iteration", () => {
    it("should iterate in order", () => {
      const tree = createTree<string, number>();
      insertAt(tree, 0, "a", 1);
      insertAt(tree, 1, "b", 2);
      insertAt(tree, 2, "c", 3);

      const items = [...tree];
      expect(items).toEqual([
        { id: "a", value: 1 },
        { id: "b", value: 2 },
        { id: "c", value: 3 },
      ]);
    });

    it("should iterate many items in order", () => {
      const tree = createTree<string, number>();
      for (let i = 0; i < 100; i++) {
        insertAt(tree, i, `item${i}`, i);
      }

      const items = [...tree];
      expect(items.length).toBe(100);
      for (let i = 0; i < 100; i++) {
        expect(items[i]).toEqual({
          id: `item${i}`,
          value: i,
        });
      }
    });
  });

  describe("tree balance invariants", () => {
    it("should pass checkInvariants on empty tree", () => {
      const tree = createTree<string, number>();
      expect(() => tree.checkInvariants()).not.toThrow();
    });

    it("should pass checkInvariants on single item tree", () => {
      const tree = createTree<string, number>();
      insertAt(tree, 0, "a", 1);
      expect(() => tree.checkInvariants()).not.toThrow();
    });

    it("should pass checkInvariants after many operations", () => {
      const tree = createTree<string, number>();

      for (let i = 0; i < 50; i++) {
        const pos = Math.floor(Math.random() * (tree.summary.size + 1));
        insertAt(tree, pos, `item${i}`, i);
        expect(() => tree.checkInvariants()).not.toThrow();
      }

      for (let i = 0; i < 25; i++) {
        tree.remove(`item${i * 2}`);
        expect(() => tree.checkInvariants()).not.toThrow();
      }
    });

    it("should maintain balance after many insertions", () => {
      const tree = createTree<string, number>();

      for (let i = 0; i < 100; i++) {
        const pos = i % 2 === 0 ? 0 : tree.summary.size;
        insertAt(tree, pos, `item${i}`, i);
      }

      expect(tree.summary.size).toBe(100);

      for (let i = 0; i < 100; i++) {
        const item = getByIndex(tree, i);
        expect(item).toBeDefined();
      }
    });

    it("should maintain balance after many removals", () => {
      const tree = createTree<string, number>();

      for (let i = 0; i < 100; i++) {
        insertAt(tree, i, `item${i}`, i);
      }

      for (let i = 0; i < 80; i++) {
        tree.remove(`item${i}`);
      }

      expect(tree.summary.size).toBe(20);

      for (let i = 0; i < 20; i++) {
        const item = getByIndex(tree, i);
        expect(item).toBeDefined();
        expect(item!.id).toBe(`item${i + 80}`);
      }
    });

    it("should maintain correct size through mixed operations", () => {
      const tree = createTree<string, number>();
      let expectedSize = 0;

      for (let i = 0; i < 50; i++) {
        insertAt(tree, Math.min(i, tree.summary.size), `item${i}`, i);
        expectedSize++;
        expect(tree.summary.size).toBe(expectedSize);
      }

      for (let i = 0; i < 20; i++) {
        tree.remove(`item${i * 2}`);
        expectedSize--;
        expect(tree.summary.size).toBe(expectedSize);
      }
    });
  });

  describe("edge cases", () => {
    it("should handle numeric keys", () => {
      const tree = createTree<number, string>();
      insertAt(tree, 0, 1, "one");
      insertAt(tree, 1, 2, "two");

      expect(getByIndex(tree, 0)).toEqual({ id: 1, value: "one" });
      expect(getIndexById(tree, 2)).toBe(1);
    });

    it("should handle object values", () => {
      const tree = createTree<string, { name: string }>();
      insertAt(tree, 0, "a", { name: "Alice" });

      const item = getByIndex(tree, 0);
      expect(item).toEqual({ id: "a", value: { name: "Alice" } });
    });

    it("should handle rapid insert/remove cycles", () => {
      const tree = createTree<string, number>();

      for (let cycle = 0; cycle < 10; cycle++) {
        for (let i = 0; i < 20; i++) {
          insertAt(tree, tree.summary.size, `${cycle}-${i}`, i);
        }

        for (let i = 0; i < 10; i++) {
          tree.remove(`${cycle}-${i}`);
        }
      }

      expect(tree.summary.size).toBe(100);
    });
  });

  describe("threshold-based operations", () => {
    it("maintains sorted order with maxKey-only prefix threshold insertion", () => {
      type MaxKeySummary = { maxKey: number };
      const maxKeyMonoid: Monoid<MaxKeySummary> = {
        empty: { maxKey: Number.NEGATIVE_INFINITY },
        combine: (a, b) => ({ maxKey: Math.max(a.maxKey, b.maxKey) }),
      };

      const tree = new TwoThreeTree<string, number, MaxKeySummary>(
        maxKeyMonoid,
        (v) => ({ maxKey: v }),
      );

      const insertByMaxKey = (id: string, keyHash: number) => {
        tree.insert(id, keyHash, (prefix) => prefix.maxKey > keyHash);
      };

      insertByMaxKey("k10", 10);
      insertByMaxKey("k20", 20);
      insertByMaxKey("k15", 15);

      expect([...tree].map((x) => x.value)).toEqual([10, 15, 20]);
    });

    it("should find by custom threshold", () => {
      // Use a summary that tracks cumulative value
      type ValueSum = { size: number; valueSum: number };
      const valueMonoid: Monoid<ValueSum> = {
        empty: { size: 0, valueSum: 0 },
        combine: (a, b) => ({
          size: a.size + b.size,
          valueSum: a.valueSum + b.valueSum,
        }),
      };
      const valueMeasure = (v: number): ValueSum => ({ size: 1, valueSum: v });

      const tree = new TwoThreeTree<string, number, ValueSum>(
        valueMonoid,
        valueMeasure,
      );
      tree.insert("a", 10, (p) => p.size > 0);
      tree.insert("b", 20, (p) => p.size > 1);
      tree.insert("c", 30, (p) => p.size > 2);

      // Find first item where cumulative value > 25
      const result = tree.findByThreshold((acc) => acc.valueSum > 25);
      expect(result).toEqual({ id: "b", value: 20 });
    });

    it("should return undefined when threshold never met", () => {
      const tree = createTree<string, number>();
      insertAt(tree, 0, "a", 1);
      insertAt(tree, 1, "b", 2);

      const result = tree.findByThreshold((acc) => acc.size > 10);
      expect(result).toBeUndefined();
    });
  });
});
