import { describe, it, expect } from "vitest";
import { Graph } from "derivation";
import { Reactive } from "../reactive.js";
import { Log } from "../log.js";
import { ZSet } from "../z-set.js";
import { LogOperations } from "../log-operations.js";
import { LogChangeInput } from "../log-change-input.js";
import { foldLog, lengthLog, unionLogOfZSets } from "../log-reactive.js";

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
