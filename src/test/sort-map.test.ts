import { describe, it, expect, beforeEach } from "vitest";
import { Graph, inputValue, Input } from "derivation";
import { hash, List, Map as IMap } from "immutable";
import {
  Reactive,
  Cell,
  CellOperations,
  type OperationsBase,
  type ListCommand,
  MapOperations,
  type MapCommand,
  sortMap,
} from "../index.js";

const numberOps = new CellOperations<number>();
const c = (n: number) => new Cell(n);
const values = (list: List<Cell<number>>) => list.map((x) => x.value).toArray();
const byValue = (
  [, left]: [string, Cell<number>],
  [, right]: [string, Cell<number>],
) => left.value - right.value;
const preserveSourceOrder = () => 0;

class RankedTag {
  constructor(
    readonly rank: number,
    readonly tag: string,
  ) {}

  equals(other: unknown): boolean {
    return other instanceof RankedTag && other.rank === this.rank;
  }

  hashCode(): number {
    return hash(this.rank);
  }
}

const tags = (list: List<RankedTag>) => list.map((x) => x.tag).toArray();

function createRankedTagOps(): OperationsBase<RankedTag, RankedTag | null> {
  return {
    apply: (_state: RankedTag, command: RankedTag) => command,
    mergeCommands: (first: RankedTag | null, second: RankedTag | null) =>
      second === null ? first : second,
    replaceCommand: (value: RankedTag) => value,
  };
}

function createOptionalNumberMapOps() {
  const valueOperations = {
    apply: (_state: number | undefined, command: number | undefined) => command,
    mergeCommands: (
      first: number | undefined | null,
      second: number | undefined | null,
    ) => (second === null ? first : second),
    replaceCommand: (value: number | undefined) => value,
  };

  return {
    valueOperations,
    apply(
      state: IMap<string, number | undefined>,
      commands: MapCommand<string, number | undefined>[] | null,
    ) {
      if (commands === null) return state;
      return commands.reduce((s, cmd) => {
        switch (cmd.type) {
          case "add":
            return s.set(cmd.key, cmd.value);
          case "update":
            if (!s.has(cmd.key)) return s;
            return s.set(
              cmd.key,
              valueOperations.apply(s.get(cmd.key), cmd.command),
            );
          case "delete":
            return s.delete(cmd.key);
          case "clear":
            return IMap<string, number | undefined>();
          default:
            return s;
        }
      }, state);
    },
    mergeCommands(
      first: MapCommand<string, number | undefined>[] | null,
      second: MapCommand<string, number | undefined>[] | null,
    ) {
      if (first === null) return second;
      if (second === null) return first;
      return [...first, ...second];
    },
    replaceCommand(value: IMap<string, number | undefined>) {
      const cmds: MapCommand<string, number | undefined>[] = [{ type: "clear" }];
      for (const [key, entry] of value.entries()) {
        cmds.push({ type: "add", key, value: entry });
      }
      return cmds;
    },
  } as unknown as MapOperations<string, number | undefined>;
}

describe("sort", () => {
  let graph: Graph;
  let changes: Input<MapCommand<string, Cell<number>>[]>;
  let map: Reactive<IMap<string, Cell<number>>>;

  beforeEach(() => {
    graph = new Graph();
    changes = inputValue(graph, [] as MapCommand<string, Cell<number>>[]);
    map = Reactive.create<IMap<string, Cell<number>>>(
      graph,
      new MapOperations<string, Cell<number>>(numberOps),
      changes,
      IMap<string, Cell<number>>(),
    );
  });

  it("sorts the initial map into a reactive list", () => {
    const initialMap = IMap({
      c: c(3),
      a: c(1),
      b: c(2),
    });
    const mapWithData = Reactive.create<IMap<string, Cell<number>>>(
      graph,
      new MapOperations<string, Cell<number>>(numberOps),
      changes,
      initialMap,
    );

    const sorted = sortMap(graph, mapWithData, byValue);
    graph.step();

    expect(values(sorted.snapshot)).toEqual([1, 2, 3]);
  });

  it("recomputes sorted order when a key is added", () => {
    const sorted = sortMap(graph, map, byValue);
    graph.step();

    changes.push([
      { type: "add", key: "a", value: c(10) },
      { type: "add", key: "c", value: c(30) },
    ]);
    graph.step();
    expect(values(sorted.snapshot)).toEqual([10, 30]);

    changes.push([{ type: "add", key: "b", value: c(20) }]);
    graph.step();

    expect(values(sorted.snapshot)).toEqual([10, 20, 30]);
  });

  it("recomputes sorted order when a value update changes rank", () => {
    const mapWithData = Reactive.create<IMap<string, Cell<number>>>(
      graph,
      new MapOperations<string, Cell<number>>(numberOps),
      changes,
      IMap({
        a: c(1),
        b: c(2),
        c: c(3),
      }),
    );

    const sorted = sortMap(graph, mapWithData, byValue);
    graph.step();
    expect(values(sorted.snapshot)).toEqual([1, 2, 3]);

    changes.push([{ type: "update", key: "a", command: 4 }]);
    graph.step();

    expect(values(sorted.snapshot)).toEqual([2, 3, 4]);
  });

  it("recomputes values even when order stays the same", () => {
    const mapWithData = Reactive.create<IMap<string, Cell<number>>>(
      graph,
      new MapOperations<string, Cell<number>>(numberOps),
      changes,
      IMap({
        a: c(1),
        b: c(2),
        c: c(30),
      }),
    );

    const sorted = sortMap(graph, mapWithData, byValue);
    graph.step();
    expect(values(sorted.snapshot)).toEqual([1, 2, 30]);

    changes.push([{ type: "update", key: "b", command: 5 }]);
    graph.step();

    expect(values(sorted.snapshot)).toEqual([1, 5, 30]);
  });

  it("recomputes when a key is deleted", () => {
    const mapWithData = Reactive.create<IMap<string, Cell<number>>>(
      graph,
      new MapOperations<string, Cell<number>>(numberOps),
      changes,
      IMap({
        a: c(1),
        b: c(2),
        c: c(3),
      }),
    );

    const sorted = sortMap(graph, mapWithData, byValue);
    graph.step();
    expect(values(sorted.snapshot)).toEqual([1, 2, 3]);

    changes.push([{ type: "delete", key: "b" }]);
    graph.step();

    expect(values(sorted.snapshot)).toEqual([1, 3]);
  });

  it("recomputes to an empty list on clear", () => {
    const mapWithData = Reactive.create<IMap<string, Cell<number>>>(
      graph,
      new MapOperations<string, Cell<number>>(numberOps),
      changes,
      IMap({
        a: c(1),
        b: c(2),
        c: c(3),
      }),
    );

    const sorted = sortMap(graph, mapWithData, byValue);
    graph.step();
    expect(values(sorted.snapshot)).toEqual([1, 2, 3]);

    changes.push([{ type: "clear" }]);
    graph.step();

    expect(values(sorted.snapshot)).toEqual([]);
  });

  it("builds initial state from the previous snapshot", () => {
    changes.push([
      { type: "add", key: "b", value: c(2) },
      { type: "add", key: "a", value: c(1) },
    ]);
    graph.step();

    const sorted = sortMap(graph, map, byValue);

    // Initial state reflects source's previous snapshot (empty),
    // not the current snapshot
    expect(values(sorted.previousSnapshot)).toEqual([]);
    expect(values(sorted.snapshot)).toEqual([1, 2]);
  });

  describe("incrementality", () => {
    it("should emit a targeted insert when adding a key", () => {
      const mapWithData = Reactive.create<IMap<string, Cell<number>>>(
        graph,
        new MapOperations<string, Cell<number>>(numberOps),
        changes,
        IMap({
          a: c(1),
          c: c(3),
        }),
      );

      const sorted = sortMap(graph, mapWithData, byValue);
      graph.step();

      const b = c(2);
      changes.push([{ type: "add", key: "b", value: b }]);
      graph.step();

      expect(values(sorted.snapshot)).toEqual([1, 2, 3]);
      expect(sorted.changes.value).toEqual([
        { type: "insert", index: 1, value: b },
      ] satisfies ListCommand<Cell<number>>[]);
    });

    it("should emit a targeted remove when deleting a key", () => {
      const mapWithData = Reactive.create<IMap<string, Cell<number>>>(
        graph,
        new MapOperations<string, Cell<number>>(numberOps),
        changes,
        IMap({
          a: c(1),
          b: c(2),
          c: c(3),
        }),
      );

      const sorted = sortMap(graph, mapWithData, byValue);
      graph.step();

      changes.push([{ type: "delete", key: "b" }]);
      graph.step();

      expect(values(sorted.snapshot)).toEqual([1, 3]);
      expect(sorted.changes.value).toEqual([
        { type: "remove", index: 1 },
      ] satisfies ListCommand<Cell<number>>[]);
    });

    it("should emit a targeted update when a value changes but keeps its rank", () => {
      const mapWithData = Reactive.create<IMap<string, Cell<number>>>(
        graph,
        new MapOperations<string, Cell<number>>(numberOps),
        changes,
        IMap({
          a: c(1),
          b: c(20),
          c: c(30),
        }),
      );

      const sorted = sortMap(graph, mapWithData, byValue);
      graph.step();

      changes.push([{ type: "update", key: "b", command: 25 }]);
      graph.step();

      expect(values(sorted.snapshot)).toEqual([1, 25, 30]);
      expect(sorted.changes.value).toEqual([
        { type: "update", index: 1, command: 25 },
      ] satisfies ListCommand<Cell<number>>[]);
    });

    it("should emit a move and update when a value changes rank", () => {
      const mapWithData = Reactive.create<IMap<string, Cell<number>>>(
        graph,
        new MapOperations<string, Cell<number>>(numberOps),
        changes,
        IMap({
          a: c(1),
          b: c(2),
          c: c(3),
        }),
      );

      const sorted = sortMap(graph, mapWithData, byValue);
      graph.step();

      changes.push([{ type: "update", key: "a", command: 4 }]);
      graph.step();

      expect(values(sorted.snapshot)).toEqual([2, 3, 4]);
      const cmds = sorted.changes.value as ListCommand<Cell<number>>[] | null;
      expect(cmds).not.toBeNull();
      expect(cmds?.some((cmd) => cmd.type === "clear")).toBe(false);
      expect(cmds).toContainEqual({ type: "move", from: 0, to: 2 });
      expect(
        cmds?.some(
          (cmd) =>
            cmd.type === "update" && (cmd.index === 0 || cmd.index === 2) && cmd.command === 4,
        ),
      ).toBe(true);
    });
  });

  describe("regressions", () => {
    it("reorders ties when a key is deleted and re-added in the same batch", () => {
      const mapWithData = Reactive.create<IMap<string, Cell<number>>>(
        graph,
        new MapOperations<string, Cell<number>>(numberOps),
        changes,
        IMap({
          a: c(1),
          b: c(2),
        }),
      );

      const sorted = sortMap(graph, mapWithData, preserveSourceOrder);
      graph.step();
      expect(values(sorted.snapshot)).toEqual([1, 2]);

      changes.push([
        { type: "delete", key: "a" },
        { type: "add", key: "a", value: c(1) },
      ]);
      graph.step();

      expect(values(sorted.snapshot)).toEqual([2, 1]);
    });

    it("emits replacement changes when list values compare equal but are observably different", () => {
      const localGraph = new Graph();
      const localChanges = inputValue(
        localGraph,
        [] as MapCommand<string, RankedTag>[],
      );
      const rankedTagOps = createRankedTagOps();
      const mapWithData = Reactive.create<IMap<string, RankedTag>>(
        localGraph,
        new MapOperations<string, RankedTag>(rankedTagOps as never),
        localChanges,
        IMap({
          a: new RankedTag(1, "A"),
          b: new RankedTag(1, "B"),
        }),
      );

      const sorted = sortMap(
        localGraph,
        mapWithData,
        ([, left], [, right]) => left.rank - right.rank,
      );
      localGraph.step();
      expect(tags(sorted.snapshot)).toEqual(["A", "B"]);

      localChanges.push([
        { type: "delete", key: "a" },
        { type: "add", key: "c", value: new RankedTag(1, "C") },
      ]);
      localGraph.step();

      expect(tags(sorted.snapshot)).toEqual(["B", "C"]);
    });

    it("updates entries addressed by an equivalent immutable key", () => {
      const localGraph = new Graph();
      const localChanges = inputValue(
        localGraph,
        [] as MapCommand<IMap<string, number>, Cell<number>>[],
      );
      const keyA = IMap<string, number>({ id: 1 });
      const keyB = IMap<string, number>({ id: 1 });
      const mapWithData = Reactive.create<IMap<IMap<string, number>, Cell<number>>>(
        localGraph,
        new MapOperations<IMap<string, number>, Cell<number>>(numberOps),
        localChanges,
        IMap<IMap<string, number>, Cell<number>>([[keyA, c(1)]]),
      );

      const sorted = sortMap(
        localGraph,
        mapWithData,
        ([, left], [, right]) => left.value - right.value,
      );
      localGraph.step();
      expect(values(sorted.snapshot)).toEqual([1]);

      localChanges.push([{ type: "update", key: keyB, command: 2 }]);
      localGraph.step();

      expect(values(sorted.snapshot)).toEqual([2]);
    });

    it("deletes entries addressed by an equivalent immutable key", () => {
      const localGraph = new Graph();
      const localChanges = inputValue(
        localGraph,
        [] as MapCommand<IMap<string, number>, Cell<number>>[],
      );
      const keyA = IMap<string, number>({ id: 1 });
      const keyB = IMap<string, number>({ id: 1 });
      const mapWithData = Reactive.create<IMap<IMap<string, number>, Cell<number>>>(
        localGraph,
        new MapOperations<IMap<string, number>, Cell<number>>(numberOps),
        localChanges,
        IMap<IMap<string, number>, Cell<number>>([[keyA, c(1)]]),
      );

      const sorted = sortMap(
        localGraph,
        mapWithData,
        ([, left], [, right]) => left.value - right.value,
      );
      localGraph.step();
      expect(values(sorted.snapshot)).toEqual([1]);

      localChanges.push([{ type: "delete", key: keyB }]);
      localGraph.step();

      expect(values(sorted.snapshot)).toEqual([]);
    });

    it("reflects updates for keys whose current value is undefined", () => {
      const localGraph = new Graph();
      const localChanges = inputValue(
        localGraph,
        [] as MapCommand<string, number | undefined>[],
      );
      const mapWithUndefined = Reactive.create<IMap<string, number | undefined>>(
        localGraph,
        createOptionalNumberMapOps(),
        localChanges,
        IMap<string, number | undefined>({ a: undefined, b: 2 }),
      );

      const sorted = sortMap(
        localGraph,
        mapWithUndefined,
        ([, left], [, right]) => (left ?? Number.NEGATIVE_INFINITY) - (right ?? Number.NEGATIVE_INFINITY),
      );
      localGraph.step();
      expect(sorted.snapshot.toArray()).toEqual([undefined, 2]);

      localChanges.push(
        [{ type: "update", key: "a", command: 1 }] as unknown as MapCommand<
          string,
          number | undefined
        >[],
      );
      localGraph.step();

      expect(sorted.snapshot.toArray()).toEqual([1, 2]);
    });
  });
});
