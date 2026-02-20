import { describe, it, expect, beforeEach } from "vitest";
import { Graph, inputValue, Input } from "derivation";
import { List, Map as IMap } from "immutable";
import { Reactive } from "../reactive.js";
import { Cell } from "../cell.js";
import { CellOperations } from "../cell-operations.js";
import { ListOperations, ListCommand } from "../list-operations.js";
import { groupByList } from "../group-by-list.js";
import { mapCell } from "../map-cell.js";

const numberOps = new CellOperations<number>();
const c = (n: number) => new Cell(n);

function keyCell(graph: Graph, rx: Reactive<Cell<number>>): Reactive<Cell<string>> {
  return mapCell(graph, rx, (n) => (n % 2 === 0 ? "even" : "odd"));
}

function getGroup(
  grouped: IMap<string, List<Cell<number>>>,
  key: string,
): List<Cell<number>> | undefined {
  return grouped.get(key);
}

function groupVals(
  grouped: IMap<string, List<Cell<number>>>,
  key: string,
): number[] | undefined {
  return getGroup(grouped, key)?.map((x) => x.value).toArray();
}

function hasGroup(grouped: IMap<string, List<Cell<number>>>, key: string): boolean {
  return grouped.has(key);
}

describe("groupByList", () => {
  let graph: Graph;
  let changes: Input<ListCommand<Cell<number>>[]>;
  let list: Reactive<List<Cell<number>>>;

  beforeEach(() => {
    graph = new Graph();
    changes = inputValue(graph, [] as ListCommand<Cell<number>>[]);
    list = Reactive.create<List<Cell<number>>>(
      graph,
      new ListOperations(numberOps),
      changes,
      List<Cell<number>>(),
    );
  });

  it("should group empty list into empty map", () => {
    const grouped = groupByList<Cell<number>, string>(graph, list, (rx) =>
      keyCell(graph, rx),
    );
    graph.step();

    expect(grouped.snapshot.size).toBe(0);
  });

  it("should group initial values by even/odd", () => {
    const initialList = List([c(1), c(2), c(3), c(4), c(5)]);
    const listWithData = Reactive.create<List<Cell<number>>>(
      graph,
      new ListOperations(numberOps),
      changes,
      initialList,
    );

    const grouped = groupByList<Cell<number>, string>(graph, listWithData, (rx) =>
      keyCell(graph, rx),
    );
    graph.step();

    expect(groupVals(grouped.snapshot, "odd")).toEqual([1, 3, 5]);
    expect(groupVals(grouped.snapshot, "even")).toEqual([2, 4]);
  });

  it("should handle inserting items into groups", () => {
    const initialList = List([c(1), c(2)]);
    const listWithData = Reactive.create<List<Cell<number>>>(
      graph,
      new ListOperations(numberOps),
      changes,
      initialList,
    );

    const grouped = groupByList<Cell<number>, string>(graph, listWithData, (rx) =>
      keyCell(graph, rx),
    );
    graph.step();

    expect(groupVals(grouped.snapshot, "odd")).toEqual([1]);
    expect(groupVals(grouped.snapshot, "even")).toEqual([2]);

    changes.push([{ type: "insert", index: 2, value: c(3) }]);
    graph.step();

    expect(groupVals(grouped.snapshot, "odd")).toEqual([1, 3]);
    expect(groupVals(grouped.snapshot, "even")).toEqual([2]);

    changes.push([{ type: "insert", index: 3, value: c(4) }]);
    graph.step();

    expect(groupVals(grouped.snapshot, "odd")).toEqual([1, 3]);
    expect(groupVals(grouped.snapshot, "even")).toEqual([2, 4]);
  });

  it("should handle removing items from groups", () => {
    const initialList = List([c(1), c(2), c(3), c(4)]);
    const listWithData = Reactive.create<List<Cell<number>>>(
      graph,
      new ListOperations(numberOps),
      changes,
      initialList,
    );

    const grouped = groupByList<Cell<number>, string>(graph, listWithData, (rx) =>
      keyCell(graph, rx),
    );
    graph.step();

    expect(groupVals(grouped.snapshot, "odd")).toEqual([1, 3]);
    expect(groupVals(grouped.snapshot, "even")).toEqual([2, 4]);

    changes.push([{ type: "remove", index: 0 }]);
    graph.step();

    expect(groupVals(grouped.snapshot, "odd")).toEqual([3]);
    expect(groupVals(grouped.snapshot, "even")).toEqual([2, 4]);

    changes.push([{ type: "remove", index: 1 }]);
    graph.step();

    expect(hasGroup(grouped.snapshot, "odd")).toBe(false);
    expect(groupVals(grouped.snapshot, "even")).toEqual([2, 4]);
  });

  it("should handle updating items within same group", () => {
    const initialList = List([c(2), c(4)]);
    const listWithData = Reactive.create<List<Cell<number>>>(
      graph,
      new ListOperations(numberOps),
      changes,
      initialList,
    );

    const grouped = groupByList<Cell<number>, string>(graph, listWithData, (rx) =>
      keyCell(graph, rx),
    );
    graph.step();

    expect(groupVals(grouped.snapshot, "even")).toEqual([2, 4]);

    changes.push([{ type: "update", index: 0, command: 6 }]);
    graph.step();

    expect(groupVals(grouped.snapshot, "even")).toEqual([6, 4]);
  });

  it("should handle items moving between groups", () => {
    const initialList = List([c(2), c(4)]);
    const listWithData = Reactive.create<List<Cell<number>>>(
      graph,
      new ListOperations(numberOps),
      changes,
      initialList,
    );

    const grouped = groupByList<Cell<number>, string>(graph, listWithData, (rx) =>
      keyCell(graph, rx),
    );
    graph.step();

    expect(groupVals(grouped.snapshot, "even")).toEqual([2, 4]);
    expect(hasGroup(grouped.snapshot, "odd")).toBe(false);

    changes.push([{ type: "update", index: 0, command: 3 }]);
    graph.step();

    expect(groupVals(grouped.snapshot, "even")).toEqual([4]);
    expect(groupVals(grouped.snapshot, "odd")).toEqual([3]);
  });

  it("should handle clear command", () => {
    const initialList = List([c(1), c(2), c(3), c(4)]);
    const listWithData = Reactive.create<List<Cell<number>>>(
      graph,
      new ListOperations(numberOps),
      changes,
      initialList,
    );

    const grouped = groupByList<Cell<number>, string>(graph, listWithData, (rx) =>
      keyCell(graph, rx),
    );
    graph.step();

    expect(grouped.snapshot.size).toBe(2);

    changes.push([{ type: "clear" }]);
    graph.step();

    expect(grouped.snapshot.size).toBe(0);
  });

  it("should maintain source list order within groups after insert", () => {
    const initialList = List([c(1), c(3)]);
    const listWithData = Reactive.create<List<Cell<number>>>(
      graph,
      new ListOperations(numberOps),
      changes,
      initialList,
    );

    const grouped = groupByList<Cell<number>, string>(graph, listWithData, (rx) =>
      keyCell(graph, rx),
    );
    graph.step();

    expect(groupVals(grouped.snapshot, "odd")).toEqual([1, 3]);

    changes.push([{ type: "insert", index: 1, value: c(5) }]);
    graph.step();

    expect(groupVals(grouped.snapshot, "odd")).toEqual([1, 5, 3]);

    changes.push([{ type: "insert", index: 0, value: c(2) }]);
    graph.step();

    expect(groupVals(grouped.snapshot, "odd")).toEqual([1, 5, 3]);
    expect(groupVals(grouped.snapshot, "even")).toEqual([2]);

    changes.push([{ type: "insert", index: 2, value: c(4) }]);
    graph.step();

    expect(groupVals(grouped.snapshot, "even")).toEqual([2, 4]);
    expect(groupVals(grouped.snapshot, "odd")).toEqual([1, 5, 3]);
  });

  it("should maintain source order when item moves to new group mid-list", () => {
    const initialList = List([c(1), c(3), c(5), c(2), c(4)]);
    const listWithData = Reactive.create<List<Cell<number>>>(
      graph,
      new ListOperations(numberOps),
      changes,
      initialList,
    );

    const grouped = groupByList<Cell<number>, string>(graph, listWithData, (rx) =>
      keyCell(graph, rx),
    );
    graph.step();

    expect(groupVals(grouped.snapshot, "odd")).toEqual([1, 3, 5]);
    expect(groupVals(grouped.snapshot, "even")).toEqual([2, 4]);

    changes.push([{ type: "update", index: 1, command: 6 }]);
    graph.step();

    expect(groupVals(grouped.snapshot, "odd")).toEqual([1, 5]);
    expect(groupVals(grouped.snapshot, "even")).toEqual([6, 2, 4]);

    changes.push([{ type: "update", index: 4, command: 7 }]);
    graph.step();

    expect(groupVals(grouped.snapshot, "odd")).toEqual([1, 5, 7]);
    expect(groupVals(grouped.snapshot, "even")).toEqual([6, 2]);
  });

  it("should maintain source list order within groups after move", () => {
    const initialList = List([c(1), c(3), c(5), c(2), c(4)]);
    const listWithData = Reactive.create<List<Cell<number>>>(
      graph,
      new ListOperations(numberOps),
      changes,
      initialList,
    );

    const grouped = groupByList<Cell<number>, string>(graph, listWithData, (rx) =>
      keyCell(graph, rx),
    );
    graph.step();

    expect(groupVals(grouped.snapshot, "odd")).toEqual([1, 3, 5]);
    expect(groupVals(grouped.snapshot, "even")).toEqual([2, 4]);

    changes.push([{ type: "move", from: 2, to: 0 }]);
    graph.step();

    expect(groupVals(grouped.snapshot, "odd")).toEqual([5, 1, 3]);
    expect(groupVals(grouped.snapshot, "even")).toEqual([2, 4]);

    changes.push([{ type: "move", from: 4, to: 3 }]);
    graph.step();

    expect(groupVals(grouped.snapshot, "odd")).toEqual([5, 1, 3]);
    expect(groupVals(grouped.snapshot, "even")).toEqual([4, 2]);
  });
});
