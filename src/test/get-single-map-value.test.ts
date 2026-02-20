import { describe, it, expect, beforeEach } from "vitest";
import { Graph, inputValue, Input } from "derivation";
import { Map as IMap } from "immutable";
import { Reactive } from "../reactive.js";
import { Cell } from "../cell.js";
import { CellOperations } from "../cell-operations.js";
import { MapOperations, MapCommand } from "../map-operations.js";
import { getSingleMapValue } from "../get-single-map-value.js";
import { List } from "immutable";
import { ListOperations, ListCommand } from "../list-operations.js";

const numberOps = new CellOperations<number>();

describe("getSingleMapValue", () => {
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
      IMap({ a: new Cell(1) }),
    );
  });

  it("should extract the only value when map size is 1", () => {
    const value = getSingleMapValue(graph, map, new Cell(0));
    graph.step();

    expect(value.snapshot.value).toBe(1);
  });

  it("should use default value when map is empty", () => {
    const emptyChanges = inputValue(graph, [] as MapCommand<string, Cell<number>>[]);
    const emptyMap = Reactive.create<IMap<string, Cell<number>>>(
      graph,
      new MapOperations<string, Cell<number>>(numberOps),
      emptyChanges,
      IMap<string, Cell<number>>(),
    );

    const value = getSingleMapValue(graph, emptyMap, new Cell(7));
    graph.step();

    expect(value.snapshot.value).toBe(7);
  });

  it("should use default value when map has more than one entry", () => {
    const multiChanges = inputValue(graph, [] as MapCommand<string, Cell<number>>[]);
    const multiMap = Reactive.create<IMap<string, Cell<number>>>(
      graph,
      new MapOperations<string, Cell<number>>(numberOps),
      multiChanges,
      IMap({ a: new Cell(1), b: new Cell(2) }),
    );

    const value = getSingleMapValue(graph, multiMap, new Cell(9));
    graph.step();

    expect(value.snapshot.value).toBe(9);
  });

  it("should update when size transitions to 1", () => {
    const value = getSingleMapValue(graph, map, new Cell(0));
    graph.step();

    expect(value.snapshot.value).toBe(1);

    changes.push([{ type: "add", key: "b", value: new Cell(2) }]);
    graph.step();
    expect(value.snapshot.value).toBe(0);

    changes.push([{ type: "delete", key: "b" }]);
    graph.step();
    expect(value.snapshot.value).toBe(1);
  });

  it("should update when the single value changes", () => {
    const value = getSingleMapValue(graph, map, new Cell(0));
    graph.step();

    changes.push([{ type: "update", key: "a", command: 5 }]);
    graph.step();

    expect(value.snapshot.value).toBe(5);
  });

  it("should fall back to default on clear and recover on add", () => {
    const value = getSingleMapValue(graph, map, new Cell(3));
    graph.step();

    changes.push([{ type: "clear" }]);
    graph.step();
    expect(value.snapshot.value).toBe(3);

    changes.push([{ type: "add", key: "z", value: new Cell(8) }]);
    graph.step();
    expect(value.snapshot.value).toBe(8);
  });

  it("should pass through list updates without replacing the list", () => {
    const listOps = new ListOperations<Cell<number>>(numberOps);
    const outerOps = new MapOperations<string, List<Cell<number>>>(listOps);
    const listMapChanges = inputValue(
      graph,
      [] as MapCommand<string, List<Cell<number>>>[],
    );
    const listMap = Reactive.create<IMap<string, List<Cell<number>>>>(
      graph,
      outerOps,
      listMapChanges,
      IMap({ only: List([new Cell(1), new Cell(2)]) }),
    );

    const single = getSingleMapValue(graph, listMap, List<Cell<number>>());
    graph.step();

    const listInsert: ListCommand<Cell<number>> = {
      type: "insert",
      index: 2,
      value: new Cell(3),
    };
    listMapChanges.push([
      { type: "update", key: "only", command: [listInsert] },
    ]);
    graph.step();

    expect(single.changes.value).toEqual([listInsert]);
  });
});
