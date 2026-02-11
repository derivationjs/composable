import { describe, it, expect } from "vitest";
import { Graph, inputValue } from "derivation";
import { List } from "immutable";
import { Reactive } from "../reactive.js";
import { ListOperations, ListCommand } from "../list-operations.js";
import { PrimitiveOperations } from "../primitive-operations.js";
import { filterList } from "../filter-list.js";
import { mapPrimitive } from "../map-primitive.js";

const numberOps = new PrimitiveOperations<number>();

function greaterThan(
  graph: Graph,
  rx: Reactive<number>,
  threshold: number,
): Reactive<boolean> {
  return mapPrimitive(graph, rx, (x) => x > threshold);
}

describe("filterList regressions", () => {
  it("handles dynamically inserted item crossing false->true", () => {
    const graph = new Graph();
    const changes = inputValue(graph, [] as ListCommand<number>[]);
    const list = Reactive.create<List<number>>(
      graph,
      new ListOperations(numberOps),
      changes,
      List<number>(),
    );
    const filtered = filterList(graph, list, (rx) => greaterThan(graph, rx, 5));

    graph.step();

    changes.push([{ type: "insert", index: 0, value: 3 }]);
    graph.step();
    expect(filtered.snapshot.toArray()).toEqual([]);

    changes.push([{ type: "update", index: 0, command: 10 }]);
    graph.step();
    expect(filtered.snapshot.toArray()).toEqual([10]);
  });

  it("handles dynamically inserted item crossing true->false", () => {
    const graph = new Graph();
    const changes = inputValue(graph, [] as ListCommand<number>[]);
    const list = Reactive.create<List<number>>(
      graph,
      new ListOperations(numberOps),
      changes,
      List<number>(),
    );
    const filtered = filterList(graph, list, (rx) => greaterThan(graph, rx, 5));

    graph.step();

    changes.push([{ type: "insert", index: 0, value: 10 }]);
    graph.step();
    expect(filtered.snapshot.toArray()).toEqual([10]);

    changes.push([{ type: "update", index: 0, command: 2 }]);
    graph.step();
    expect(filtered.snapshot.toArray()).toEqual([]);
  });

  it("reacts when predicate depends on external reactive state", () => {
    const graph = new Graph();
    const listChanges = inputValue(graph, [] as ListCommand<number>[]);
    const thresholdInput = inputValue(graph, 5);

    const list = Reactive.create<List<number>>(
      graph,
      new ListOperations(numberOps),
      listChanges,
      List([3, 7]),
    );
    const thresholdRx = Reactive.create<number>(graph, numberOps, thresholdInput, 5);

    const filtered = filterList(graph, list, (rx) =>
      mapPrimitive(graph, thresholdRx, (t) => rx.snapshot > t),
    );

    graph.step();
    expect(filtered.snapshot.toArray()).toEqual([7]);

    thresholdInput.push(2);
    graph.step();
    expect(filtered.snapshot.toArray()).toEqual([3, 7]);
  });
});
