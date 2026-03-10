import { describe, it, expect, beforeEach } from "vitest";
import { Graph, inputValue, Input } from "derivation";
import { Map as IMap } from "immutable";
import { Reactive } from "../reactive.js";
import { Cell } from "../cell.js";
import { CellOperations } from "../cell-operations.js";
import { MapOperations, MapCommand } from "../map-operations.js";
import { groupByMap } from "../group-by-map.js";

const numberOps = new CellOperations<number>();
const stringOps = new CellOperations<string>();
const c = (n: number) => new Cell(n);
const s = (value: string) => new Cell(value);

function makeKeyFn(graph: Graph) {
  return (rx: Reactive<Cell<number>>): Reactive<Cell<string>> => {
    return Reactive.create<Cell<string>>(
      graph,
      stringOps,
      rx.changes.map((cmd) => (cmd === null ? null : cmd % 2 === 0 ? "even" : "odd")),
      new Cell(rx.previousSnapshot.value % 2 === 0 ? "even" : "odd"),
    );
  };
}

function getGroup(
  grouped: IMap<string, IMap<string, Cell<number>>>,
  key: string,
): IMap<string, Cell<number>> | undefined {
  return grouped.get(key);
}

function hasGroup(
  grouped: IMap<string, IMap<string, Cell<number>>>,
  key: string,
): boolean {
  return grouped.has(key);
}

describe("groupByMap", () => {
  let graph: Graph;
  let changes: Input<MapCommand<string, Cell<number>>[]>;
  let source: Reactive<IMap<string, Cell<number>>>;

  beforeEach(() => {
    graph = new Graph();
    changes = inputValue(graph, [] as MapCommand<string, Cell<number>>[]);
    source = Reactive.create<IMap<string, Cell<number>>>(
      graph,
      new MapOperations<string, Cell<number>>(numberOps),
      changes,
      IMap<string, Cell<number>>(),
    );
  });

  it("should group empty map into empty result", () => {
    const grouped = groupByMap(graph, source, makeKeyFn(graph));
    graph.step();

    expect(grouped.snapshot.size).toBe(0);
  });

  it("should group initial values correctly", () => {
    const initial = IMap({ a: c(1), b: c(2), c: c(3), d: c(4) });
    const src = Reactive.create<IMap<string, Cell<number>>>(
      graph,
      new MapOperations<string, Cell<number>>(numberOps),
      changes,
      initial,
    );

    const grouped = groupByMap(graph, src, makeKeyFn(graph));
    graph.step();

    const oddGroup = getGroup(grouped.snapshot, "odd")!;
    const evenGroup = getGroup(grouped.snapshot, "even")!;

    expect(oddGroup.get("a")?.value).toBe(1);
    expect(oddGroup.get("c")?.value).toBe(3);
    expect(evenGroup.get("b")?.value).toBe(2);
    expect(evenGroup.get("d")?.value).toBe(4);
  });

  it("should handle adding a new entry", () => {
    const grouped = groupByMap(graph, source, makeKeyFn(graph));
    graph.step();

    changes.push([{ type: "add", key: "a", value: c(1) }]);
    graph.step();

    expect(getGroup(grouped.snapshot, "odd")!.get("a")?.value).toBe(1);

    changes.push([{ type: "add", key: "b", value: c(2) }]);
    graph.step();

    expect(getGroup(grouped.snapshot, "odd")!.get("a")?.value).toBe(1);
    expect(getGroup(grouped.snapshot, "even")!.get("b")?.value).toBe(2);
  });

  it("should handle adding to an existing group", () => {
    const initial = IMap({ a: c(1) });
    const src = Reactive.create<IMap<string, Cell<number>>>(
      graph,
      new MapOperations<string, Cell<number>>(numberOps),
      changes,
      initial,
    );

    const grouped = groupByMap(graph, src, makeKeyFn(graph));
    graph.step();

    expect(getGroup(grouped.snapshot, "odd")!.size).toBe(1);

    changes.push([{ type: "add", key: "b", value: c(3) }]);
    graph.step();

    expect(getGroup(grouped.snapshot, "odd")!.size).toBe(2);
    expect(getGroup(grouped.snapshot, "odd")!.get("b")?.value).toBe(3);
  });

  it("should propagate updates within the same group", () => {
    const initial = IMap({ a: c(2), b: c(4) });
    const src = Reactive.create<IMap<string, Cell<number>>>(
      graph,
      new MapOperations<string, Cell<number>>(numberOps),
      changes,
      initial,
    );

    const grouped = groupByMap(graph, src, makeKeyFn(graph));
    graph.step();

    expect(getGroup(grouped.snapshot, "even")!.get("a")?.value).toBe(2);

    changes.push([{ type: "update", key: "a", command: 6 }]);
    graph.step();

    expect(getGroup(grouped.snapshot, "even")!.get("a")?.value).toBe(6);
    expect(getGroup(grouped.snapshot, "even")!.get("b")?.value).toBe(4);
  });

  it("should move entry between groups when key changes", () => {
    const initial = IMap({ a: c(2), b: c(4) });
    const src = Reactive.create<IMap<string, Cell<number>>>(
      graph,
      new MapOperations<string, Cell<number>>(numberOps),
      changes,
      initial,
    );

    const grouped = groupByMap(graph, src, makeKeyFn(graph));
    graph.step();

    expect(getGroup(grouped.snapshot, "even")!.size).toBe(2);
    expect(hasGroup(grouped.snapshot, "odd")).toBe(false);

    changes.push([{ type: "update", key: "a", command: 3 }]);
    graph.step();

    expect(getGroup(grouped.snapshot, "even")!.size).toBe(1);
    expect(getGroup(grouped.snapshot, "even")!.get("b")?.value).toBe(4);
    expect(getGroup(grouped.snapshot, "odd")!.size).toBe(1);
    expect(getGroup(grouped.snapshot, "odd")!.get("a")?.value).toBe(3);
  });

  it("should delete group when last entry is removed", () => {
    const initial = IMap({ a: c(1), b: c(2) });
    const src = Reactive.create<IMap<string, Cell<number>>>(
      graph,
      new MapOperations<string, Cell<number>>(numberOps),
      changes,
      initial,
    );

    const grouped = groupByMap(graph, src, makeKeyFn(graph));
    graph.step();

    expect(getGroup(grouped.snapshot, "odd")!.get("a")?.value).toBe(1);

    changes.push([{ type: "delete", key: "a" }]);
    graph.step();

    expect(hasGroup(grouped.snapshot, "odd")).toBe(false);
    expect(getGroup(grouped.snapshot, "even")!.get("b")?.value).toBe(2);
  });

  it("should remove entry from group but keep group when others remain", () => {
    const initial = IMap({ a: c(1), b: c(3), c: c(2) });
    const src = Reactive.create<IMap<string, Cell<number>>>(
      graph,
      new MapOperations<string, Cell<number>>(numberOps),
      changes,
      initial,
    );

    const grouped = groupByMap(graph, src, makeKeyFn(graph));
    graph.step();

    expect(getGroup(grouped.snapshot, "odd")!.size).toBe(2);

    changes.push([{ type: "delete", key: "a" }]);
    graph.step();

    expect(getGroup(grouped.snapshot, "odd")!.size).toBe(1);
    expect(getGroup(grouped.snapshot, "odd")!.get("b")?.value).toBe(3);
    expect(getGroup(grouped.snapshot, "odd")!.has("a")).toBe(false);
  });

  it("should handle clear", () => {
    const initial = IMap({ a: c(1), b: c(2), c: c(3) });
    const src = Reactive.create<IMap<string, Cell<number>>>(
      graph,
      new MapOperations<string, Cell<number>>(numberOps),
      changes,
      initial,
    );

    const grouped = groupByMap(graph, src, makeKeyFn(graph));
    graph.step();

    expect(grouped.snapshot.size).toBe(2);

    changes.push([{ type: "clear" }]);
    graph.step();

    expect(grouped.snapshot.size).toBe(0);
  });

  it("should call f once per ID (not on updates)", () => {
    const initial = IMap({ a: c(1), b: c(2) });
    const src = Reactive.create<IMap<string, Cell<number>>>(
      graph,
      new MapOperations<string, Cell<number>>(numberOps),
      changes,
      initial,
    );

    let fCallCount = 0;
    const grouped = groupByMap<string, Cell<number>, string>(graph, src, (rx) => {
      fCallCount++;
      return Reactive.create<Cell<string>>(
        graph,
        stringOps,
        rx.changes.map((cmd) =>
          cmd === null ? null : cmd % 2 === 0 ? "even" : "odd",
        ),
        new Cell(rx.previousSnapshot.value % 2 === 0 ? "even" : "odd"),
      );
    });
    graph.step();

    expect(fCallCount).toBe(2);

    changes.push([{ type: "update", key: "a", command: 3 }]);
    graph.step();
    expect(fCallCount).toBe(2);

    changes.push([{ type: "delete", key: "a" }]);
    graph.step();
    expect(fCallCount).toBe(2);

    changes.push([{ type: "add", key: "c", value: c(5) }]);
    graph.step();
    expect(fCallCount).toBe(3);
  });

  it("should delete old group when key change empties it", () => {
    const initial = IMap({ a: c(2) });
    const src = Reactive.create<IMap<string, Cell<number>>>(
      graph,
      new MapOperations<string, Cell<number>>(numberOps),
      changes,
      initial,
    );

    const grouped = groupByMap(graph, src, makeKeyFn(graph));
    graph.step();

    expect(hasGroup(grouped.snapshot, "even")).toBe(true);

    changes.push([{ type: "update", key: "a", command: 3 }]);
    graph.step();

    expect(hasGroup(grouped.snapshot, "even")).toBe(false);
    expect(getGroup(grouped.snapshot, "odd")!.get("a")?.value).toBe(3);
  });

  describe("incrementality", () => {
    it("should emit targeted add, not full replacement, when adding a new entry", () => {
      const initial = IMap({ a: c(1) });
      const src = Reactive.create<IMap<string, Cell<number>>>(
        graph,
        new MapOperations<string, Cell<number>>(numberOps),
        changes,
        initial,
      );

      const grouped = groupByMap(graph, src, makeKeyFn(graph));
      graph.step();

      changes.push([{ type: "add", key: "b", value: c(2) }]);
      graph.step();

      expect(getGroup(grouped.snapshot, "even")!.get("b")?.value).toBe(2);
      const cmds = grouped.changes.value as MapCommand<
        string,
        IMap<string, Cell<number>>
      >[];
      expect(cmds).not.toBeNull();
      expect(cmds.some((c) => c.type === "clear")).toBe(false);
    });

    it("should emit targeted delete, not full replacement, when removing an entry", () => {
      const initial = IMap({ a: c(1), b: c(2) });
      const src = Reactive.create<IMap<string, Cell<number>>>(
        graph,
        new MapOperations<string, Cell<number>>(numberOps),
        changes,
        initial,
      );

      const grouped = groupByMap(graph, src, makeKeyFn(graph));
      graph.step();

      changes.push([{ type: "delete", key: "a" }]);
      graph.step();

      expect(hasGroup(grouped.snapshot, "odd")).toBe(false);
      const cmds = grouped.changes.value as MapCommand<
        string,
        IMap<string, Cell<number>>
      >[];
      expect(cmds).not.toBeNull();
      expect(cmds.some((c) => c.type === "clear")).toBe(false);
    });

    it("should emit targeted update, not full replacement, when updating a value within the same group", () => {
      const initial = IMap({ a: c(2), b: c(4) });
      const src = Reactive.create<IMap<string, Cell<number>>>(
        graph,
        new MapOperations<string, Cell<number>>(numberOps),
        changes,
        initial,
      );

      const grouped = groupByMap(graph, src, makeKeyFn(graph));
      graph.step();

      changes.push([{ type: "update", key: "a", command: 6 }]);
      graph.step();

      expect(getGroup(grouped.snapshot, "even")!.get("a")?.value).toBe(6);
      const cmds = grouped.changes.value as MapCommand<
        string,
        IMap<string, Cell<number>>
      >[];
      expect(cmds).not.toBeNull();
      expect(cmds.some((c) => c.type === "clear")).toBe(false);
    });

    it("should emit targeted commands, not full replacement, when an item moves between groups", () => {
      const initial = IMap({ a: c(2), b: c(4) });
      const src = Reactive.create<IMap<string, Cell<number>>>(
        graph,
        new MapOperations<string, Cell<number>>(numberOps),
        changes,
        initial,
      );

      const grouped = groupByMap(graph, src, makeKeyFn(graph));
      graph.step();

      changes.push([{ type: "update", key: "a", command: 3 }]);
      graph.step();

      expect(getGroup(grouped.snapshot, "odd")!.get("a")?.value).toBe(3);
      expect(getGroup(grouped.snapshot, "even")!.get("b")?.value).toBe(4);
      const cmds = grouped.changes.value as MapCommand<
        string,
        IMap<string, Cell<number>>
      >[];
      expect(cmds).not.toBeNull();
      expect(cmds.some((c) => c.type === "clear")).toBe(false);
    });
  });

  it("should handle transient inserts (add + delete in same batch)", () => {
    const initial = IMap({ a: c(1) });
    const src = Reactive.create<IMap<string, Cell<number>>>(
      graph,
      new MapOperations<string, Cell<number>>(numberOps),
      changes,
      initial,
    );

    const grouped = groupByMap(graph, src, makeKeyFn(graph));
    graph.step();

    expect(getGroup(grouped.snapshot, "odd")!.get("a")?.value).toBe(1);

    changes.push([
      { type: "add", key: "b", value: c(2) },
      { type: "delete", key: "b" },
    ]);
    graph.step();

    expect(getGroup(grouped.snapshot, "odd")!.get("a")?.value).toBe(1);
    expect(hasGroup(grouped.snapshot, "even")).toBe(false);
  });

  it("should handle key changes not driven by value updates", () => {
    const initial = IMap({ a: c(1), b: c(2) });
    const src = Reactive.create<IMap<string, Cell<number>>>(
      graph,
      new MapOperations<string, Cell<number>>(numberOps),
      changes,
      initial,
    );

    const keyOverride = inputValue(graph, "" as string);

    const grouped = groupByMap<string, Cell<number>, string>(graph, src, (rx) => {
      const baseKey = Reactive.create<Cell<string>>(
        graph,
        stringOps,
        rx.changes.map((cmd) => (cmd === null ? null : cmd % 2 === 0 ? "even" : "odd")),
        new Cell(rx.previousSnapshot.value % 2 === 0 ? "even" : "odd"),
      );
      return Reactive.create<Cell<string>>(
        graph,
        stringOps,
        baseKey.changes.zip(keyOverride, (valKey, override): string | null => {
          if (override !== "") return override;
          return valKey;
        }),
        baseKey.previousSnapshot,
      );
    });
    graph.step();

    expect(getGroup(grouped.snapshot, "odd")!.get("a")?.value).toBe(1);
    expect(getGroup(grouped.snapshot, "even")!.get("b")?.value).toBe(2);

    // Change all keys externally, without changing values
    keyOverride.push("all");
    graph.step();

    expect(hasGroup(grouped.snapshot, "odd")).toBe(false);
    expect(hasGroup(grouped.snapshot, "even")).toBe(false);
    expect(getGroup(grouped.snapshot, "all")!.get("a")?.value).toBe(1);
    expect(getGroup(grouped.snapshot, "all")!.get("b")?.value).toBe(2);
  });
});
