import { describe, it, expect } from "vitest";
import { Graph } from "derivation";
import { Reactive } from "../reactive.js";
import { ZSet } from "../z-set.js";
import { ZMap } from "../z-map.js";
import { ZSetOperations } from "../z-set-operations.js";
import { ZMapOperations } from "../z-map-operations.js";
import { ZSetChangeInput } from "../z-set-change-input.js";
import { ZMapChangeInput } from "../z-map-change-input.js";
import {
  filterZSet,
  mapZSet,
  groupByZSet,
  unionZSet,
  intersectionZSet,
  differenceZSet,
} from "../z-set-reactive.js";
import {
  joinZMap,
  mapValuesZMap,
  flattenZMap,
  filterZMap,
  unionZMap,
  intersectionZMap,
  differenceZMap,
} from "../z-map-reactive.js";

describe("ReactiveSet", () => {
  it("accumulates and materializes over steps", () => {
    const c = new Graph();
    const input = new ZSetChangeInput<string>(c);
    const rset = Reactive.create(c, new ZSetOperations<string>(), input, new ZSet<string>());

    expect(rset.snapshot.isEmpty()).toBe(true);

    input.add("apple");
    c.step();
    expect(rset.snapshot.get("apple")).toBe(1);

    input.add("apple");
    c.step();
    expect(rset.snapshot.get("apple")).toBe(2);
  });

  it("performs groupby", () => {
    const c = new Graph();
    const input = new ZSetChangeInput<string>(c);
    const rset = Reactive.create(c, new ZSetOperations<string>(), input, new ZSet<string>());

    input.add("apple");
    c.step();
    const grouped = groupByZSet(c, rset, (key) => key[0]);
    expect(grouped.snapshot.getValue("a", "apple")).toBe(1);
  });

  it("ReactiveSet groupBy creates ReactiveMap and joins correctly", () => {
    const c = new Graph();

    const inputA = new ZSetChangeInput<number>(c);
    const inputB = new ZSetChangeInput<number>(c);

    inputA.add(1);
    inputA.add(2);
    inputB.add(2);
    inputB.add(3);

    c.step();

    const rsA = Reactive.create(c, new ZSetOperations<number>(), inputA, new ZSet<number>());
    const rsB = Reactive.create(c, new ZSetOperations<number>(), inputB, new ZSet<number>());

    const groupedA = groupByZSet(c, rsA, (x) => x);
    const groupedB = groupByZSet(c, rsB, (y) => y);
    const joined = joinZMap(c, groupedA, groupedB);

    const snapshot = joined.snapshot;
    const entries = [...snapshot.getEntries()].map(([k, v, w]) => [k, v, w]);

    // Key 2 should exist with multiplied weight
    expect(entries.some(([k]) => k === 2)).toBe(true);
    // Keys 1 and 3 should not exist (no matching keys)
    expect(entries.some(([k]) => k === 1)).toBe(false);
    expect(entries.some(([k]) => k === 3)).toBe(false);
  });

  it("ReactiveMap mapValues and flatten work", () => {
    const c = new Graph();
    const input = new ZMapChangeInput<string, number>(c);

    input.add("a", 1);
    input.add("b", 2);

    const rm = Reactive.create(c, new ZMapOperations<string, number>(), input, new ZMap<string, number>());

    c.step();

    const doubled = mapValuesZMap(c, rm, (v) => v * 2);
    const flat = flattenZMap(c, doubled);

    const entries = [...flat.snapshot.getEntries()];
    expect(entries).toContainEqual([2, 1]);
    expect(entries).toContainEqual([4, 1]);
  });

  it("ReactiveMap setup", () => {
    const c = new Graph();
    const change = new ZMapChangeInput<string, number>(c);
    const reactive = Reactive.create(c, new ZMapOperations<string, number>(), change, new ZMap<string, number>());

    change.add("foo", 1);

    expect([...reactive.previousMaterialized.value.getEntries()].length).toBe(0);
    expect([...reactive.materialized.value.getEntries()].length).toBe(0);
    expect([...(reactive.changes.value as ZMap<string, number>).getEntries()].length).toBe(0);

    c.step();

    expect([...reactive.previousMaterialized.value.getEntries()].length).toBe(0);
    expect([...reactive.materialized.value.getEntries()].length).toBe(1);
    expect([...(reactive.changes.value as ZMap<string, number>).getEntries()].length).toBe(1);
  });

  it("ReactiveMap join combines maps by key", () => {
    const c = new Graph();

    const left = new ZMapChangeInput<string, number>(c);
    const right = new ZMapChangeInput<string, string>(c);

    const rmLeft = Reactive.create(c, new ZMapOperations<string, number>(), left, new ZMap<string, number>());
    const rmRight = Reactive.create(c, new ZMapOperations<string, string>(), right, new ZMap<string, string>());

    const joined = joinZMap(c, rmLeft, rmRight);

    left.add("x", 10);
    right.add("x", "A");
    right.add("y", "B");
    c.step();

    let entries = [...joined.snapshot.getEntries()];
    expect(entries.length).toBe(1);
    expect(entries[0]![0]).toBe("x");
    expect(entries[0]![1].get(0)).toBe(10);
    expect(entries[0]![1].get(1)).toBe("A");
    expect(entries[0]![2]).toBe(1);
    expect(entries.some(([k]) => k === "y")).toBe(false);

    left.add("y", 20);

    c.step();

    entries = [...joined.snapshot.getEntries()];
    expect(entries.length).toBe(2);
    const xEntry = entries.find(([k]) => k === "x");
    const yEntry = entries.find(([k]) => k === "y");
    expect(xEntry).toBeDefined();
    expect(yEntry).toBeDefined();
    expect(xEntry![1].get(0)).toBe(10);
    expect(xEntry![1].get(1)).toBe("A");
    expect(xEntry![2]).toBe(1);
    expect(yEntry![1].get(0)).toBe(20);
    expect(yEntry![1].get(1)).toBe("B");
    expect(yEntry![2]).toBe(1);
  });

  it("ReactiveMap initializes correctly with snapshot", () => {
    const c = new Graph();
    const initial = new ZMap<string, number>().add("a", 1);
    const input = new ZMapChangeInput<string, number>(c);

    const rm = Reactive.create(c, new ZMapOperations<string, number>(), input, initial);
    expect([...rm.snapshot.getEntries()].length).toBe(1);
  });

  it("ReactiveSet union combines two sets", () => {
    const c = new Graph();
    const input1 = new ZSetChangeInput<string>(c);
    const input2 = new ZSetChangeInput<string>(c);

    const rs1 = Reactive.create(c, new ZSetOperations<string>(), input1, new ZSet<string>());
    const rs2 = Reactive.create(c, new ZSetOperations<string>(), input2, new ZSet<string>());
    const union = unionZSet(c, rs1, rs2);

    input1.add("a", 2);
    input2.add("a", 3);
    input2.add("b", 1);
    c.step();

    expect(union.snapshot.get("a")).toBe(5);
    expect(union.snapshot.get("b")).toBe(1);
  });

  it("ReactiveSet intersection incremental updates", () => {
    const c = new Graph();
    const input1 = new ZSetChangeInput<string>(c);
    const input2 = new ZSetChangeInput<string>(c);

    const rs1 = Reactive.create(c, new ZSetOperations<string>(), input1, new ZSet<string>());
    const rs2 = Reactive.create(c, new ZSetOperations<string>(), input2, new ZSet<string>());
    const intersection = intersectionZSet(c, rs1, rs2);

    input1.add("x", 2);
    input1.add("y", 3);
    input2.add("x", 4);
    input2.add("z", 5);
    c.step();

    expect(intersection.snapshot.get("x")).toBe(8);
    expect(intersection.snapshot.get("y")).toBe(0);
    expect(intersection.snapshot.get("z")).toBe(0);

    input1.add("z", 2);
    c.step();

    expect(intersection.snapshot.get("x")).toBe(8);
    expect(intersection.snapshot.get("z")).toBe(10);
  });

  it("ReactiveSet difference incremental updates", () => {
    const c = new Graph();
    const input1 = new ZSetChangeInput<string>(c);
    const input2 = new ZSetChangeInput<string>(c);

    const rs1 = Reactive.create(c, new ZSetOperations<string>(), input1, new ZSet<string>());
    const rs2 = Reactive.create(c, new ZSetOperations<string>(), input2, new ZSet<string>());
    const diff = differenceZSet(c, rs1, rs2);

    input1.add("x", 5);
    input1.add("y", 2);
    input2.add("x", 3);
    c.step();

    expect(diff.snapshot.get("x")).toBe(2);
    expect(diff.snapshot.get("y")).toBe(2);

    input2.add("y", 1);
    c.step();

    expect(diff.snapshot.get("x")).toBe(2);
    expect(diff.snapshot.get("y")).toBe(1);
  });

  it("ReactiveSet filter incremental updates", () => {
    const c = new Graph();
    const input = new ZSetChangeInput<number>(c);

    input.add(5, 1);
    input.add(15, 2);
    input.add(25, 1);
    c.step();

    const rs = Reactive.create(c, new ZSetOperations<number>(), input, new ZSet<number>());
    const filtered = filterZSet(c, rs, (x) => x > 10);

    expect(filtered.snapshot.get(5)).toBe(0);
    expect(filtered.snapshot.get(15)).toBe(2);
    expect(filtered.snapshot.get(25)).toBe(1);

    input.add(5, 3);
    input.add(20, 1);
    c.step();

    expect(filtered.snapshot.get(5)).toBe(0);
    expect(filtered.snapshot.get(15)).toBe(2);
    expect(filtered.snapshot.get(20)).toBe(1);
    expect(filtered.snapshot.get(25)).toBe(1);
  });

  it("ReactiveMap intersection incremental updates", () => {
    const c = new Graph();
    const input1 = new ZMapChangeInput<string, string>(c);
    const input2 = new ZMapChangeInput<string, string>(c);

    const rm1 = Reactive.create(c, new ZMapOperations<string, string>(), input1, new ZMap<string, string>());
    const rm2 = Reactive.create(c, new ZMapOperations<string, string>(), input2, new ZMap<string, string>());
    const intersection = intersectionZMap(c, rm1, rm2);

    input1.add("k1", "x", 2);
    input1.add("k2", "y", 3);
    input2.add("k1", "x", 4);
    c.step();

    expect(intersection.snapshot.getValue("k1", "x")).toBe(8);
    expect(intersection.snapshot.getValue("k2", "y")).toBe(0);

    input2.add("k2", "y", 2);
    c.step();

    expect(intersection.snapshot.getValue("k1", "x")).toBe(8);
    expect(intersection.snapshot.getValue("k2", "y")).toBe(6);
  });

  it("ReactiveMap difference incremental updates", () => {
    const c = new Graph();
    const input1 = new ZMapChangeInput<string, string>(c);
    const input2 = new ZMapChangeInput<string, string>(c);

    input1.add("k1", "x", 5);
    input2.add("k1", "x", 3);
    c.step();

    const rm1 = Reactive.create(c, new ZMapOperations<string, string>(), input1, new ZMap<string, string>());
    const rm2 = Reactive.create(c, new ZMapOperations<string, string>(), input2, new ZMap<string, string>());
    const diff = differenceZMap(c, rm1, rm2);

    expect(diff.snapshot.getValue("k1", "x")).toBe(2);

    input1.add("k1", "y", 2);
    input2.add("k1", "x", 1);
    c.step();

    expect(diff.snapshot.getValue("k1", "x")).toBe(1);
    expect(diff.snapshot.getValue("k1", "y")).toBe(2);
  });

  it("ReactiveMap filter incremental updates", () => {
    const c = new Graph();
    const input = new ZMapChangeInput<string, number>(c);

    input.add("k1", 5, 1);
    input.add("k1", 15, 2);
    input.add("k2", 25, 1);
    c.step();

    const rm = Reactive.create(c, new ZMapOperations<string, number>(), input, new ZMap<string, number>());
    const filtered = filterZMap(c, rm, (k, v) => v > 10);

    expect(filtered.snapshot.getValue("k1", 5)).toBe(0);
    expect(filtered.snapshot.getValue("k1", 15)).toBe(2);
    expect(filtered.snapshot.getValue("k2", 25)).toBe(1);

    input.add("k1", 20, 3);
    c.step();

    expect(filtered.snapshot.getValue("k1", 15)).toBe(2);
    expect(filtered.snapshot.getValue("k1", 20)).toBe(3);
    expect(filtered.snapshot.getValue("k2", 25)).toBe(1);
  });
});
