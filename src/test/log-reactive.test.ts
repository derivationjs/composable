import { describe, it, expect } from "vitest";
import { Graph } from "derivation";
import { Reactive } from "../reactive.js";
import { Log } from "../log.js";
import { ZSet } from "../z-set.js";
import { LogOperations } from "../log-operations.js";
import { LogChangeInput } from "../log-change-input.js";
import { foldLog, lengthLog, mapLog, unionLogOfZSets } from "../log-reactive.js";

describe("Log Reactive Operations", () => {
  it("foldLog accumulates log entries", () => {
    const c = new Graph();
    const input = new LogChangeInput<number>(c);
    const rlog = Reactive.create(c, new LogOperations<number>(), input, new Log<number>());

    const sum = foldLog(c, rlog, 0, (acc, item) => acc + item);

    expect(sum.value).toBe(0);

    input.push(5);
    c.step();
    expect(sum.value).toBe(5);

    input.push(10);
    input.push(3);
    c.step();
    expect(sum.value).toBe(18);
  });

  it("lengthLog tracks log length", () => {
    const c = new Graph();
    const input = new LogChangeInput<string>(c);
    const rlog = Reactive.create(c, new LogOperations<string>(), input, new Log<string>());

    const length = lengthLog(c, rlog);

    expect(length.value).toBe(0);

    input.push("a");
    c.step();
    expect(length.value).toBe(1);

    input.pushAll(["b", "c", "d"]);
    c.step();
    expect(length.value).toBe(4);
  });

  it("mapLog transforms log entries", () => {
    const c = new Graph();
    const input = new LogChangeInput<number>(c);
    const rlog = Reactive.create(c, new LogOperations<number>(), input, new Log<number>());

    const doubled = mapLog(c, rlog, (x) => x * 2);

    expect(doubled.snapshot.length).toBe(0);

    input.push(5);
    c.step();
    expect(doubled.snapshot.length).toBe(1);
    expect(doubled.snapshot.get(0)).toBe(10);

    input.pushAll([3, 7]);
    c.step();
    expect(doubled.snapshot.length).toBe(3);
    expect(doubled.snapshot.get(0)).toBe(10);
    expect(doubled.snapshot.get(1)).toBe(6);
    expect(doubled.snapshot.get(2)).toBe(14);
  });

  it("mapLog handles initial log entries", () => {
    const c = new Graph();

    // Create initial log with some entries
    const initialLog = new Log<string>()
      .append("hello")
      .append("world");

    const input = new LogChangeInput<string>(c);
    const rlog = Reactive.create(c, new LogOperations<string>(), input, initialLog);

    const uppercased = mapLog(c, rlog, (s) => s.toUpperCase());

    // Initial snapshot should have mapped entries
    expect(uppercased.snapshot.length).toBe(2);
    expect(uppercased.snapshot.get(0)).toBe("HELLO");
    expect(uppercased.snapshot.get(1)).toBe("WORLD");

    // Add more entries
    input.push("foo");
    c.step();

    expect(uppercased.snapshot.length).toBe(3);
    expect(uppercased.snapshot.get(2)).toBe("FOO");
  });

  it("mapLog with complex transformations", () => {
    const c = new Graph();
    const input = new LogChangeInput<{ id: number; value: string }>(c);
    const rlog = Reactive.create(
      c,
      new LogOperations<{ id: number; value: string }>(),
      input,
      new Log<{ id: number; value: string }>()
    );

    const extracted = mapLog(c, rlog, (obj) => obj.value);

    input.push({ id: 1, value: "apple" });
    input.push({ id: 2, value: "banana" });
    c.step();

    expect(extracted.snapshot.length).toBe(2);
    expect(extracted.snapshot.get(0)).toBe("apple");
    expect(extracted.snapshot.get(1)).toBe("banana");
  });

  it("unionLogOfZSets flattens empty log", () => {
    const c = new Graph();
    const input = new LogChangeInput<ZSet<string>>(c);
    const rlog = Reactive.create(c, new LogOperations<ZSet<string>>(), input, new Log<ZSet<string>>());

    const unionedZSet = unionLogOfZSets(c, rlog);

    expect(unionedZSet.snapshot.isEmpty()).toBe(true);
  });

  it("unionLogOfZSets unions initial log entries", () => {
    const c = new Graph();

    // Create initial log with some ZSets
    const initialLog = new Log<ZSet<string>>()
      .append(new ZSet<string>().add("apple", 1).add("banana", 2))
      .append(new ZSet<string>().add("apple", 3).add("cherry", 1));

    const input = new LogChangeInput<ZSet<string>>(c);
    const rlog = Reactive.create(c, new LogOperations<ZSet<string>>(), input, initialLog);

    const unionedZSet = unionLogOfZSets(c, rlog);

    // Initial snapshot should union all entries
    expect(unionedZSet.snapshot.get("apple")).toBe(4); // 1 + 3
    expect(unionedZSet.snapshot.get("banana")).toBe(2);
    expect(unionedZSet.snapshot.get("cherry")).toBe(1);
  });

  it("unionLogOfZSets unions incrementally", () => {
    const c = new Graph();
    const input = new LogChangeInput<ZSet<string>>(c);
    const rlog = Reactive.create(c, new LogOperations<ZSet<string>>(), input, new Log<ZSet<string>>());

    const unionedZSet = unionLogOfZSets(c, rlog);

    expect(unionedZSet.snapshot.isEmpty()).toBe(true);

    // Add first ZSet
    input.push(new ZSet<string>().add("apple", 2).add("banana", 1));
    c.step();

    expect(unionedZSet.snapshot.get("apple")).toBe(2);
    expect(unionedZSet.snapshot.get("banana")).toBe(1);
    expect(unionedZSet.snapshot.get("cherry")).toBe(0);

    // Add second ZSet
    input.push(new ZSet<string>().add("apple", 3).add("cherry", 2));
    c.step();

    expect(unionedZSet.snapshot.get("apple")).toBe(5); // 2 + 3
    expect(unionedZSet.snapshot.get("banana")).toBe(1);
    expect(unionedZSet.snapshot.get("cherry")).toBe(2);
  });

  it("unionLogOfZSets handles multiple ZSets at once", () => {
    const c = new Graph();
    const input = new LogChangeInput<ZSet<string>>(c);
    const rlog = Reactive.create(c, new LogOperations<ZSet<string>>(), input, new Log<ZSet<string>>());

    const unionedZSet = unionLogOfZSets(c, rlog);

    // Add multiple ZSets in one step
    input.pushAll([
      new ZSet<string>().add("x", 1),
      new ZSet<string>().add("x", 2).add("y", 3),
      new ZSet<string>().add("z", 4),
    ]);
    c.step();

    expect(unionedZSet.snapshot.get("x")).toBe(3); // 1 + 2
    expect(unionedZSet.snapshot.get("y")).toBe(3);
    expect(unionedZSet.snapshot.get("z")).toBe(4);
  });

  it("unionLogOfZSets handles negative weights", () => {
    const c = new Graph();
    const input = new LogChangeInput<ZSet<number>>(c);
    const rlog = Reactive.create(c, new LogOperations<ZSet<number>>(), input, new Log<ZSet<number>>());

    const unionedZSet = unionLogOfZSets(c, rlog);

    // Add items with positive weight
    input.push(new ZSet<number>().add(1, 5).add(2, 3));
    c.step();

    expect(unionedZSet.snapshot.get(1)).toBe(5);
    expect(unionedZSet.snapshot.get(2)).toBe(3);

    // Add items with negative weight (removals)
    input.push(new ZSet<number>().add(1, -2).add(2, -3));
    c.step();

    expect(unionedZSet.snapshot.get(1)).toBe(3); // 5 - 2
    expect(unionedZSet.snapshot.get(2)).toBe(0); // 3 - 3, should be removed or 0
  });

  it("unionLogOfZSets works with complex types", () => {
    const c = new Graph();
    const input = new LogChangeInput<ZSet<{ id: number; name: string }>>(c);
    const rlog = Reactive.create(
      c,
      new LogOperations<ZSet<{ id: number; name: string }>>(),
      input,
      new Log<ZSet<{ id: number; name: string }>>(),
    );

    const unionedZSet = unionLogOfZSets(c, rlog);

    const obj1 = { id: 1, name: "Alice" };
    const obj2 = { id: 2, name: "Bob" };

    input.push(new ZSet<{ id: number; name: string }>().add(obj1, 1));
    c.step();

    expect(unionedZSet.snapshot.get(obj1)).toBe(1);
    expect(unionedZSet.snapshot.get(obj2)).toBe(0);

    input.push(new ZSet<{ id: number; name: string }>().add(obj2, 2).add(obj1, 1));
    c.step();

    expect(unionedZSet.snapshot.get(obj1)).toBe(2); // 1 + 1
    expect(unionedZSet.snapshot.get(obj2)).toBe(2);
  });
});
