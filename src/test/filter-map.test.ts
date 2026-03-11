import { describe, it, expect, beforeEach } from "vitest";
import { Graph, inputValue, Input } from "derivation";
import { Map as IMap } from "immutable";
import { Reactive } from "../reactive.js";
import { Cell } from "../cell.js";
import { CellOperations } from "../cell-operations.js";
import { MapOperations, MapCommand } from "../map-operations.js";
import { filterMap } from "../filter-map.js";
import { mapCell } from "../map-cell.js";

const numberOps = new CellOperations<number>();
const c = (n: number) => new Cell(n);
const cm = (obj: Record<string, number>) =>
  IMap<string, Cell<number>>(
    Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, c(v)])),
  );
const unwrapMap = (map: IMap<string, Cell<number>>) =>
  map.map((x) => x.value).toObject() as Record<string, number>;

describe("filterMap", () => {
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

  const predicate = (rx: Reactive<Cell<number>>) =>
    mapCell(graph, rx, (value) => value % 2 === 0);

  it("should filter initial values", () => {
    const sourceWithData = Reactive.create<IMap<string, Cell<number>>>(
      graph,
      new MapOperations<string, Cell<number>>(numberOps),
      changes,
      cm({ a: 1, b: 2, c: 4 }),
    );

    const filtered = filterMap(graph, sourceWithData, predicate);
    graph.step();

    expect(unwrapMap(filtered.snapshot)).toEqual({ b: 2, c: 4 });
  });

  it("should add selected entries", () => {
    const filtered = filterMap(graph, source, predicate);
    graph.step();

    changes.push([{ type: "add", key: "a", value: c(2) }]);
    graph.step();

    expect(unwrapMap(filtered.snapshot)).toEqual({ a: 2 });
  });

  it("should skip unselected entries", () => {
    const filtered = filterMap(graph, source, predicate);
    graph.step();

    changes.push([{ type: "add", key: "a", value: c(1) }]);
    graph.step();

    expect(filtered.snapshot.size).toBe(0);
    expect(filtered.changes.value).toBeNull();
  });

  it("should include an entry when an update makes it match", () => {
    const sourceWithData = Reactive.create<IMap<string, Cell<number>>>(
      graph,
      new MapOperations<string, Cell<number>>(numberOps),
      changes,
      cm({ a: 1 }),
    );

    const filtered = filterMap(graph, sourceWithData, predicate);
    graph.step();

    changes.push([{ type: "update", key: "a", command: 2 }]);
    graph.step();

    expect(unwrapMap(filtered.snapshot)).toEqual({ a: 2 });
  });

  it("should remove an entry when an update stops matching", () => {
    const sourceWithData = Reactive.create<IMap<string, Cell<number>>>(
      graph,
      new MapOperations<string, Cell<number>>(numberOps),
      changes,
      cm({ a: 2, b: 4 }),
    );

    const filtered = filterMap(graph, sourceWithData, predicate);
    graph.step();

    changes.push([{ type: "update", key: "a", command: 3 }]);
    graph.step();

    expect(unwrapMap(filtered.snapshot)).toEqual({ b: 4 });
  });

  it("should update values that remain selected", () => {
    const sourceWithData = Reactive.create<IMap<string, Cell<number>>>(
      graph,
      new MapOperations<string, Cell<number>>(numberOps),
      changes,
      cm({ a: 2, b: 4 }),
    );

    const filtered = filterMap(graph, sourceWithData, predicate);
    graph.step();

    changes.push([{ type: "update", key: "a", command: 6 }]);
    graph.step();

    expect(unwrapMap(filtered.snapshot)).toEqual({ a: 6, b: 4 });
  });

  it("should handle delete", () => {
    const sourceWithData = Reactive.create<IMap<string, Cell<number>>>(
      graph,
      new MapOperations<string, Cell<number>>(numberOps),
      changes,
      cm({ a: 2, b: 3, c: 4 }),
    );

    const filtered = filterMap(graph, sourceWithData, predicate);
    graph.step();

    changes.push([{ type: "delete", key: "a" }]);
    graph.step();

    expect(unwrapMap(filtered.snapshot)).toEqual({ c: 4 });
  });

  it("should handle clear", () => {
    const sourceWithData = Reactive.create<IMap<string, Cell<number>>>(
      graph,
      new MapOperations<string, Cell<number>>(numberOps),
      changes,
      cm({ a: 2, b: 4 }),
    );

    const filtered = filterMap(graph, sourceWithData, predicate);
    graph.step();

    changes.push([{ type: "clear" }]);
    graph.step();

    expect(filtered.snapshot.size).toBe(0);
  });

  it("should handle delete of non-matching entry", () => {
    const sourceWithData = Reactive.create<IMap<string, Cell<number>>>(
      graph,
      new MapOperations<string, Cell<number>>(numberOps),
      changes,
      cm({ a: 1, b: 2 }),
    );

    const filtered = filterMap(graph, sourceWithData, predicate);
    graph.step();

    expect(unwrapMap(filtered.snapshot)).toEqual({ b: 2 });

    changes.push([{ type: "delete", key: "a" }]);
    graph.step();

    expect(unwrapMap(filtered.snapshot)).toEqual({ b: 2 });
    expect(filtered.changes.value).toBeNull();
  });

  describe("incrementality", () => {
    it("should emit targeted add, not full replacement, when adding a matching entry", () => {
      const sourceWithData = Reactive.create<IMap<string, Cell<number>>>(
        graph,
        new MapOperations<string, Cell<number>>(numberOps),
        changes,
        cm({ a: 2 }),
      );

      const filtered = filterMap(graph, sourceWithData, predicate);
      graph.step();

      changes.push([{ type: "add", key: "b", value: c(4) }]);
      graph.step();

      expect(unwrapMap(filtered.snapshot)).toEqual({ a: 2, b: 4 });
      const cmds = filtered.changes.value as MapCommand<string, Cell<number>>[];
      expect(cmds).not.toBeNull();
      expect(cmds.some((c) => c.type === "clear")).toBe(false);
    });

    it("should emit null changes when adding a non-matching entry", () => {
      const sourceWithData = Reactive.create<IMap<string, Cell<number>>>(
        graph,
        new MapOperations<string, Cell<number>>(numberOps),
        changes,
        cm({ a: 2 }),
      );

      const filtered = filterMap(graph, sourceWithData, predicate);
      graph.step();

      changes.push([{ type: "add", key: "b", value: c(3) }]);
      graph.step();

      expect(unwrapMap(filtered.snapshot)).toEqual({ a: 2 });
      expect(filtered.changes.value).toBeNull();
    });

    it("should emit targeted delete, not full replacement, when deleting a matching entry", () => {
      const sourceWithData = Reactive.create<IMap<string, Cell<number>>>(
        graph,
        new MapOperations<string, Cell<number>>(numberOps),
        changes,
        cm({ a: 2, b: 4 }),
      );

      const filtered = filterMap(graph, sourceWithData, predicate);
      graph.step();

      changes.push([{ type: "delete", key: "a" }]);
      graph.step();

      expect(unwrapMap(filtered.snapshot)).toEqual({ b: 4 });
      const cmds = filtered.changes.value as MapCommand<string, Cell<number>>[];
      expect(cmds).not.toBeNull();
      expect(cmds.some((c) => c.type === "clear")).toBe(false);
    });

    it("should emit null changes when deleting a non-matching entry", () => {
      const sourceWithData = Reactive.create<IMap<string, Cell<number>>>(
        graph,
        new MapOperations<string, Cell<number>>(numberOps),
        changes,
        cm({ a: 1, b: 4 }),
      );

      const filtered = filterMap(graph, sourceWithData, predicate);
      graph.step();

      changes.push([{ type: "delete", key: "a" }]);
      graph.step();

      expect(unwrapMap(filtered.snapshot)).toEqual({ b: 4 });
      expect(filtered.changes.value).toBeNull();
    });

    it("should emit targeted update when a matching entry stays matching", () => {
      const sourceWithData = Reactive.create<IMap<string, Cell<number>>>(
        graph,
        new MapOperations<string, Cell<number>>(numberOps),
        changes,
        cm({ a: 2, b: 4 }),
      );

      const filtered = filterMap(graph, sourceWithData, predicate);
      graph.step();

      changes.push([{ type: "update", key: "a", command: 6 }]);
      graph.step();

      expect(unwrapMap(filtered.snapshot)).toEqual({ a: 6, b: 4 });
      const cmds = filtered.changes.value as MapCommand<string, Cell<number>>[];
      expect(cmds).not.toBeNull();
      expect(cmds.some((c) => c.type === "clear")).toBe(false);
      expect(cmds).toEqual([{ type: "update", key: "a", command: 6 }]);
    });

    it("should emit targeted delete when update makes entry stop matching", () => {
      const sourceWithData = Reactive.create<IMap<string, Cell<number>>>(
        graph,
        new MapOperations<string, Cell<number>>(numberOps),
        changes,
        cm({ a: 2, b: 4 }),
      );

      const filtered = filterMap(graph, sourceWithData, predicate);
      graph.step();

      changes.push([{ type: "update", key: "a", command: 3 }]);
      graph.step();

      expect(unwrapMap(filtered.snapshot)).toEqual({ b: 4 });
      const cmds = filtered.changes.value as MapCommand<string, Cell<number>>[];
      expect(cmds).not.toBeNull();
      expect(cmds.some((c) => c.type === "clear")).toBe(false);
      expect(cmds).toEqual([{ type: "delete", key: "a" }]);
    });

    it("should emit targeted add when update makes entry start matching", () => {
      const sourceWithData = Reactive.create<IMap<string, Cell<number>>>(
        graph,
        new MapOperations<string, Cell<number>>(numberOps),
        changes,
        cm({ a: 1, b: 4 }),
      );

      const filtered = filterMap(graph, sourceWithData, predicate);
      graph.step();

      changes.push([{ type: "update", key: "a", command: 2 }]);
      graph.step();

      expect(unwrapMap(filtered.snapshot)).toEqual({ a: 2, b: 4 });
      const cmds = filtered.changes.value as MapCommand<string, Cell<number>>[];
      expect(cmds).not.toBeNull();
      expect(cmds.some((c) => c.type === "clear")).toBe(false);
      expect(cmds).toEqual([{ type: "add", key: "a", value: c(2) }]);
    });

    it("should emit null changes when update on non-matching entry keeps it non-matching", () => {
      const sourceWithData = Reactive.create<IMap<string, Cell<number>>>(
        graph,
        new MapOperations<string, Cell<number>>(numberOps),
        changes,
        cm({ a: 1, b: 4 }),
      );

      const filtered = filterMap(graph, sourceWithData, predicate);
      graph.step();

      changes.push([{ type: "update", key: "a", command: 3 }]);
      graph.step();

      expect(unwrapMap(filtered.snapshot)).toEqual({ b: 4 });
      expect(filtered.changes.value).toBeNull();
    });

    it("should emit targeted commands when selection changes without source update", () => {
      const selectionOverride = inputValue(graph, null as boolean | null);

      const sourceWithData = Reactive.create<IMap<string, Cell<number>>>(
        graph,
        new MapOperations<string, Cell<number>>(numberOps),
        changes,
        cm({ a: 1, b: 2 }),
      );

      const filtered = filterMap(graph, sourceWithData, (rx) => {
        const base = mapCell(graph, rx, (value) => value % 2 === 0);
        return Reactive.create<Cell<boolean>>(
          graph,
          new CellOperations<boolean>(),
          base.changes.zip(selectionOverride, (baseVal, override): boolean | null => {
            if (override !== null) return override;
            return baseVal;
          }),
          base.previousSnapshot,
        );
      });
      graph.step();

      expect(unwrapMap(filtered.snapshot)).toEqual({ b: 2 });

      // Override: select everything
      selectionOverride.push(true);
      graph.step();

      expect(unwrapMap(filtered.snapshot)).toEqual({ a: 1, b: 2 });
      const cmds = filtered.changes.value as MapCommand<string, Cell<number>>[];
      expect(cmds).not.toBeNull();
      expect(cmds.some((c) => c.type === "clear")).toBe(false);
    });

    it("should not emit clear when clearing an already empty filtered map", () => {
      const sourceWithData = Reactive.create<IMap<string, Cell<number>>>(
        graph,
        new MapOperations<string, Cell<number>>(numberOps),
        changes,
        cm({ a: 1, b: 3 }),
      );

      const filtered = filterMap(graph, sourceWithData, predicate);
      graph.step();

      expect(filtered.snapshot.size).toBe(0);

      changes.push([{ type: "clear" }]);
      graph.step();

      expect(filtered.snapshot.size).toBe(0);
      expect(filtered.changes.value).toBeNull();
    });
  });
});
