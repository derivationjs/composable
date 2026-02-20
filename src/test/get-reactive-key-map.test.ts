import { describe, it, expect, beforeEach } from "vitest";
import { Graph, inputValue, Input } from "derivation";
import { Map as IMap } from "immutable";
import { Reactive } from "../reactive.js";
import { Cell } from "../cell.js";
import { CellOperations } from "../cell-operations.js";
import { MapOperations, MapCommand } from "../map-operations.js";
import { getReactiveKeyMap } from "../get-reactive-key-map.js";

const numberOps = new CellOperations<number>();
const stringOps = new CellOperations<string>();

describe("getReactiveKeyMap", () => {
  let graph: Graph;
  let mapChanges: Input<MapCommand<string, Cell<number>>[]>;
  let keyChanges: Input<string | null>;
  let source: Reactive<IMap<string, Cell<number>>>;
  let key: Reactive<Cell<string>>;

  beforeEach(() => {
    graph = new Graph();
    mapChanges = inputValue(graph, [] as MapCommand<string, Cell<number>>[]);
    keyChanges = inputValue(graph, null as string | null);

    source = Reactive.create<IMap<string, Cell<number>>>(
      graph,
      new MapOperations<string, Cell<number>>(numberOps),
      mapChanges,
      IMap({ a: new Cell(1), b: new Cell(2) }),
    );

    key = Reactive.create<Cell<string>>(
      graph,
      stringOps,
      keyChanges,
      new Cell("a"),
    );
  });

  it("reads the initial selected key", () => {
    const selected = getReactiveKeyMap(graph, source, key, new Cell(0));
    graph.step();

    expect(selected.snapshot.value).toBe(1);
  });

  it("updates when selected key changes", () => {
    const selected = getReactiveKeyMap(graph, source, key, new Cell(0));
    graph.step();

    keyChanges.push("b");
    graph.step();

    expect(selected.snapshot.value).toBe(2);
  });

  it("propagates updates for the currently selected key", () => {
    const selected = getReactiveKeyMap(graph, source, key, new Cell(0));
    graph.step();

    mapChanges.push([{ type: "update", key: "a", command: 10 }]);
    graph.step();

    expect(selected.snapshot.value).toBe(10);
  });

  it("ignores updates for non-selected keys", () => {
    const selected = getReactiveKeyMap(graph, source, key, new Cell(0));
    graph.step();

    mapChanges.push([{ type: "update", key: "b", command: 20 }]);
    graph.step();

    expect(selected.snapshot.value).toBe(1);
  });

  it("falls back to default when selected key is missing", () => {
    const selected = getReactiveKeyMap(graph, source, key, new Cell(7));
    graph.step();

    keyChanges.push("z");
    graph.step();

    expect(selected.snapshot.value).toBe(7);
  });

  it("handles key and value changes in the same step", () => {
    const selected = getReactiveKeyMap(graph, source, key, new Cell(0));
    graph.step();

    keyChanges.push("b");
    mapChanges.push([{ type: "update", key: "b", command: 99 }]);
    graph.step();

    expect(selected.snapshot.value).toBe(99);
  });
});
