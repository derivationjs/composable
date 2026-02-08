import { describe, it, expect } from "vitest";
import { Graph } from "derivation";
import { Reactive } from "../reactive.js";
import { Log } from "../log.js";
import { LogOperations } from "../log-operations.js";
import { LogChangeInput } from "../log-change-input.js";
import {
  foldLog,
  lengthLog,
  mapLog,
  applyLog,
  applyLogSequential,
} from "../log-reactive.js";
import { List } from "immutable";
import { ListOperations, ListCommand } from "../list-operations.js";
import { PrimitiveOperations } from "../primitive-operations.js";
import { mapList } from "../list-reactive.js";

describe("Log Reactive Operations", () => {
  it("foldLog accumulates log entries", () => {
    const c = new Graph();
    const input = new LogChangeInput<number>(c);
    const rlog = Reactive.create<Log<number>>(
      c,
      new LogOperations<number>(),
      input,
      new Log<number>(),
    );

    const sum = foldLog(c, rlog, 0, (acc, item) => acc + item);

    expect(sum.value).toBe(0);

    input.add(5);
    c.step();
    expect(sum.value).toBe(5);

    input.add(10);
    input.add(3);
    c.step();
    expect(sum.value).toBe(18);
  });

  it("lengthLog tracks log length", () => {
    const c = new Graph();
    const input = new LogChangeInput<string>(c);
    const rlog = Reactive.create<Log<string>>(
      c,
      new LogOperations<string>(),
      input,
      new Log<string>(),
    );

    const length = lengthLog(c, rlog);

    expect(length.value).toBe(0);

    input.add("a");
    c.step();
    expect(length.value).toBe(1);

    input.addAll(["b", "c", "d"]);
    c.step();
    expect(length.value).toBe(4);
  });

  it("mapLog transforms log entries", () => {
    const c = new Graph();
    const input = new LogChangeInput<number>(c);
    const rlog = Reactive.create<Log<number>>(
      c,
      new LogOperations<number>(),
      input,
      new Log<number>(),
    );

    const doubled = mapLog(c, rlog, (x) => x * 2);

    expect(doubled.snapshot.length).toBe(0);

    input.add(5);
    c.step();
    expect(doubled.snapshot.length).toBe(1);
    expect(doubled.snapshot.get(0)).toBe(10);

    input.addAll([3, 7]);
    c.step();
    expect(doubled.snapshot.length).toBe(3);
    expect(doubled.snapshot.get(0)).toBe(10);
    expect(doubled.snapshot.get(1)).toBe(6);
    expect(doubled.snapshot.get(2)).toBe(14);
  });

  it("mapLog handles initial log entries", () => {
    const c = new Graph();

    // Create initial log with some entries
    const initialLog = new Log<string>().append("hello").append("world");

    const input = new LogChangeInput<string>(c);
    const rlog = Reactive.create<Log<string>>(
      c,
      new LogOperations<string>(),
      input,
      initialLog,
    );

    const uppercased = mapLog(c, rlog, (s) => s.toUpperCase());

    // Initial snapshot should have mapped entries
    expect(uppercased.snapshot.length).toBe(2);
    expect(uppercased.snapshot.get(0)).toBe("HELLO");
    expect(uppercased.snapshot.get(1)).toBe("WORLD");

    // Add more entries
    input.add("foo");
    c.step();

    expect(uppercased.snapshot.length).toBe(3);
    expect(uppercased.snapshot.get(2)).toBe("FOO");
  });

  it("mapLog with complex transformations", () => {
    const c = new Graph();
    const input = new LogChangeInput<{ id: number; value: string }>(c);
    const rlog = Reactive.create<Log<{ id: number; value: string }>>(
      c,
      new LogOperations<{ id: number; value: string }>(),
      input,
      new Log<{ id: number; value: string }>(),
    );

    const extracted = mapLog(c, rlog, (obj) => obj.value);

    input.add({ id: 1, value: "apple" });
    input.add({ id: 2, value: "banana" });
    c.step();

    expect(extracted.snapshot.length).toBe(2);
    expect(extracted.snapshot.get(0)).toBe("apple");
    expect(extracted.snapshot.get(1)).toBe("banana");
  });

  it("applyLog builds reactive list from command log", () => {
    const c = new Graph();
    const input = new LogChangeInput<ListCommand<string>[]>(c);
    const rlog = Reactive.create<Log<ListCommand<string>[]>>(
      c,
      new LogOperations<ListCommand<string>[]>(),
      input,
      new Log<ListCommand<string>[]>(),
    );

    const list = applyLog<List<string>>(
      c,
      rlog,
      new ListOperations(new PrimitiveOperations<string>()),
      List<string>(),
    );

    expect(list.snapshot.size).toBe(0);

    // Insert some items
    input.add([
      { type: "insert", index: 0, value: "apple" },
      { type: "insert", index: 1, value: "banana" },
    ]);
    c.step();

    expect(list.snapshot.size).toBe(2);
    expect(list.snapshot.get(0)).toBe("apple");
    expect(list.snapshot.get(1)).toBe("banana");

    // Add more and remove one
    input.add([
      { type: "insert", index: 2, value: "cherry" },
      { type: "remove", index: 0 },
    ]);
    c.step();

    expect(list.snapshot.size).toBe(2);
    expect(list.snapshot.get(0)).toBe("banana");
    expect(list.snapshot.get(1)).toBe("cherry");
  });

  it("applyLog handles initial log entries", () => {
    const c = new Graph();

    // Create initial log with some commands
    const initialLog = new Log<ListCommand<number>[]>()
      .append([
        { type: "insert", index: 0, value: 10 },
        { type: "insert", index: 1, value: 20 },
      ])
      .append([{ type: "insert", index: 2, value: 30 }]);

    const input = new LogChangeInput<ListCommand<number>[]>(c);
    const rlog = Reactive.create<Log<ListCommand<number>[]>>(
      c,
      new LogOperations<ListCommand<number>[]>(),
      input,
      initialLog,
    );

    const list = applyLog<List<number>>(
      c,
      rlog,
      new ListOperations(new PrimitiveOperations<number>()),
      List<number>(),
    );

    // Initial snapshot should have all commands applied
    expect(list.snapshot.size).toBe(3);
    expect(list.snapshot.get(0)).toBe(10);
    expect(list.snapshot.get(1)).toBe(20);
    expect(list.snapshot.get(2)).toBe(30);

    // Add more commands
    input.add([{ type: "insert", index: 0, value: 5 }]);
    c.step();

    expect(list.snapshot.size).toBe(4);
    expect(list.snapshot.get(0)).toBe(5);
    expect(list.snapshot.get(1)).toBe(10);
  });

  it("applyLog handles move commands", () => {
    const c = new Graph();
    const input = new LogChangeInput<ListCommand<string>[]>(c);
    const rlog = Reactive.create<Log<ListCommand<string>[]>>(
      c,
      new LogOperations<ListCommand<string>[]>(),
      input,
      new Log<ListCommand<string>[]>(),
    );

    const list = applyLog<List<string>>(
      c,
      rlog,
      new ListOperations(new PrimitiveOperations<string>()),
      List<string>(),
    );

    // Insert initial items
    input.add([
      { type: "insert", index: 0, value: "a" },
      { type: "insert", index: 1, value: "b" },
      { type: "insert", index: 2, value: "c" },
    ]);
    c.step();

    expect(list.snapshot.toArray()).toEqual(["a", "b", "c"]);

    // Move item from index 0 to index 2
    input.add([{ type: "move", from: 0, to: 2 }]);
    c.step();

    expect(list.snapshot.toArray()).toEqual(["b", "c", "a"]);
  });

  it("applyLog with multiple command batches", () => {
    const c = new Graph();
    const input = new LogChangeInput<ListCommand<string>[]>(c);
    const rlog = Reactive.create<Log<ListCommand<string>[]>>(
      c,
      new LogOperations<ListCommand<string>[]>(),
      input,
      new Log<ListCommand<string>[]>(),
    );

    const list = applyLog<List<string>>(
      c,
      rlog,
      new ListOperations(new PrimitiveOperations<string>()),
      List<string>(),
    );

    // Push multiple command batches at once
    input.addAll([
      [{ type: "insert", index: 0, value: "x" }],
      [{ type: "insert", index: 1, value: "y" }],
      [{ type: "insert", index: 2, value: "z" }],
    ]);
    c.step();

    expect(list.snapshot.size).toBe(3);
    expect(list.snapshot.toArray()).toEqual(["x", "y", "z"]);
  });

  describe("applyLogSequential", () => {
    it("processes events sequentially with state-dependent commands", () => {
      const c = new Graph();
      const input = new LogChangeInput<string>(c);
      const rlog = Reactive.create<Log<string>>(
        c,
        new LogOperations<string>(),
        input,
        new Log<string>(),
      );

      // Function that appends each event to the list
      const list = applyLogSequential<List<string>, string>(
        c,
        rlog,
        new ListOperations(new PrimitiveOperations<string>()),
        List<string>(),
        (state, event) => {
          return [{ type: "insert", index: state.size, value: event }];
        },
      );

      expect(list.snapshot.size).toBe(0);

      input.add("apple");
      c.step();

      expect(list.snapshot.size).toBe(1);
      expect(list.snapshot.get(0)).toBe("apple");

      input.add("banana");
      c.step();

      expect(list.snapshot.size).toBe(2);
      expect(list.snapshot.get(0)).toBe("apple");
      expect(list.snapshot.get(1)).toBe("banana");
    });

    it("handles state-dependent command generation", () => {
      const c = new Graph();
      const input = new LogChangeInput<"add" | "clear">(c);
      const rlog = Reactive.create<Log<"add" | "clear">>(
        c,
        new LogOperations<"add" | "clear">(),
        input,
        new Log<"add" | "clear">(),
      );

      // Function that adds a number or clears based on the event
      const list = applyLogSequential<List<number>, string>(
        c,
        rlog,
        new ListOperations(new PrimitiveOperations<number>()),
        List<number>(),
        (state, event) => {
          if (event === "add") {
            return [{ type: "insert", index: state.size, value: state.size }];
          } else {
            // Clear all
            const commands: ListCommand<number>[] = [];
            for (let i = state.size - 1; i >= 0; i--) {
              commands.push({ type: "remove", index: i });
            }
            return commands;
          }
        },
      );

      expect(list.snapshot.size).toBe(0);

      input.add("add");
      c.step();
      expect(list.snapshot.toArray()).toEqual([0]);

      input.add("add");
      c.step();
      expect(list.snapshot.toArray()).toEqual([0, 1]);

      input.add("add");
      c.step();
      expect(list.snapshot.toArray()).toEqual([0, 1, 2]);

      input.add("clear");
      c.step();
      expect(list.snapshot.toArray()).toEqual([]);

      input.add("add");
      c.step();
      expect(list.snapshot.toArray()).toEqual([0]);
    });

    it("processes multiple events in one batch sequentially", () => {
      const c = new Graph();
      const input = new LogChangeInput<number>(c);
      const rlog = Reactive.create<Log<number>>(
        c,
        new LogOperations<number>(),
        input,
        new Log<number>(),
      );

      // Each event generates a command to insert at the beginning
      const list = applyLogSequential<List<number>, number>(
        c,
        rlog,
        new ListOperations(new PrimitiveOperations<number>()),
        List<number>(),
        (state, event) => {
          return [{ type: "insert", index: 0, value: event }];
        },
      );

      // Push multiple events at once
      input.addAll([1, 2, 3]);
      c.step();

      // Should be inserted in reverse order (3, 2, 1) since each goes at index 0
      expect(list.snapshot.toArray()).toEqual([3, 2, 1]);
    });

    it("handles initial log entries", () => {
      const c = new Graph();

      // Create initial log with some events
      const initialLog = new Log<string>().append("foo").append("bar");

      const input = new LogChangeInput<string>(c);
      const rlog = Reactive.create<Log<string>>(
        c,
        new LogOperations<string>(),
        input,
        initialLog,
      );

      const list = applyLogSequential<List<string>, string>(
        c,
        rlog,
        new ListOperations(new PrimitiveOperations<string>()),
        List<string>(),
        (state, event) => {
          return [{ type: "insert", index: state.size, value: event }];
        },
      );

      // Initial snapshot should have processed initial log entries
      expect(list.snapshot.size).toBe(2);
      expect(list.snapshot.get(0)).toBe("foo");
      expect(list.snapshot.get(1)).toBe("bar");

      // Add more events
      input.add("baz");
      c.step();

      expect(list.snapshot.size).toBe(3);
      expect(list.snapshot.get(2)).toBe("baz");
    });

    it("generates multiple commands per event", () => {
      const c = new Graph();
      const input = new LogChangeInput<string>(c);
      const rlog = Reactive.create<Log<string>>(
        c,
        new LogOperations<string>(),
        input,
        new Log<string>(),
      );

      // Each event generates two inserts: the value and its uppercase version
      const list = applyLogSequential<List<string>, string>(
        c,
        rlog,
        new ListOperations(new PrimitiveOperations<string>()),
        List<string>(),
        (state, event) => {
          return [
            { type: "insert", index: state.size, value: event },
            {
              type: "insert",
              index: state.size + 1,
              value: event.toUpperCase(),
            },
          ];
        },
      );
      input.add("hello");
      c.step();

      expect(list.snapshot.toArray()).toEqual(["hello", "HELLO"]);

      input.add("world");
      c.step();

      expect(list.snapshot.toArray()).toEqual([
        "hello",
        "HELLO",
        "world",
        "WORLD",
      ]);
    });

    it("correctly tracks state across sequential events", () => {
      const c = new Graph();
      const input = new LogChangeInput<number>(c);
      const rlog = Reactive.create<Log<number>>(
        c,
        new LogOperations<number>(),
        input,
        new Log<number>(),
      );

      // Insert the cumulative sum of events
      const list = applyLogSequential<List<number>, number>(
        c,
        rlog,
        new ListOperations(new PrimitiveOperations<number>()),
        List<number>(),
        (state, event) => {
          // Get the last cumulative sum, or 0 if empty
          const prevSum = state.size > 0 ? state.get(state.size - 1)! : 0;
          const sum = prevSum + event;
          return [{ type: "insert", index: state.size, value: sum }];
        },
      );

      input.add(5);
      c.step();
      expect(list.snapshot.toArray()).toEqual([5]);

      input.add(3);
      c.step();
      expect(list.snapshot.toArray()).toEqual([5, 8]); // 5 + 3

      input.add(2);
      c.step();
      expect(list.snapshot.toArray()).toEqual([5, 8, 10]); // 5 + 3 + 2
    });

    it("handles empty command arrays", () => {
      const c = new Graph();
      const input = new LogChangeInput<number>(c);
      const rlog = Reactive.create<Log<number>>(
        c,
        new LogOperations<number>(),
        input,
        new Log<number>(),
      );

      // Only insert even numbers
      const list = applyLogSequential<List<number>, number>(
        c,
        rlog,
        new ListOperations(new PrimitiveOperations<number>()),
        List<number>(),
        (state, event) => {
          if (event % 2 === 0) {
            return [{ type: "insert", index: state.size, value: event }];
          }
          return []; // No commands for odd numbers
        },
      );

      input.addAll([1, 2, 3, 4, 5, 6]);
      c.step();

      expect(list.snapshot.toArray()).toEqual([2, 4, 6]);
    });

    it("works with derived reactive values", () => {
      const c = new Graph();
      const input = new LogChangeInput<string>(c);
      const rlog = Reactive.create<Log<string>>(
        c,
        new LogOperations<string>(),
        input,
        new Log<string>(),
      );

      const list = applyLogSequential<List<string>, string>(
        c,
        rlog,
        new ListOperations(new PrimitiveOperations<string>()),
        List<string>(),
        (state, event) => {
          return [{ type: "insert", index: state.size, value: event }];
        },
      );

      // Verify we can create derived reactive values from the result
      const length = list.changes.accumulate(0, (count, cmd) => {
        if (cmd === null) return count;
        const commands = cmd as ListCommand<string>[];
        return commands.reduce((c, command) => {
          if (command.type === "insert") return c + 1;
          if (command.type === "remove") return c - 1;
          return c;
        }, count);
      });

      input.add("a");
      c.step();
      expect(list.snapshot.size).toBe(1);
      expect(length.value).toBe(1);

      input.add("hello");
      c.step();
      expect(list.snapshot.size).toBe(2);
      expect(length.value).toBe(2);
    });
  });
});
