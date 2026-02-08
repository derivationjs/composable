import { describe, it, expect, beforeEach } from "vitest";
import { Graph, inputValue, Input } from "derivation";
import { Map as IMap } from "immutable";
import { Reactive } from "../reactive.js";
import { TupleOperations, TupleCommand } from "../tuple-operations.js";
import { MapOperations, MapCommand } from "../map-operations.js";
import { PrimitiveOperations } from "../primitive-operations.js";
import { Tuple } from "../tuple.js";
import { projectTuple } from "../project-tuple.js";

const numberOps = new PrimitiveOperations<number>();
const stringOps = new PrimitiveOperations<string>();

describe("projectTuple", () => {
  let graph: Graph;

  beforeEach(() => {
    graph = new Graph();
  });

  it("should extract element 0 initial value", () => {
    type T = [number, string];
    const tupleOps = new TupleOperations<T>(numberOps, stringOps);
    const changes = inputValue<TupleCommand<T> | null>(graph, null);
    const source = Reactive.create<Tuple<T>>(graph, tupleOps, changes, Tuple(10, "hello"));

    const first = projectTuple(graph, source, 0);
    graph.step();

    expect(first.snapshot).toBe(10);
  });

  it("should extract element 1 initial value", () => {
    type T = [number, string];
    const tupleOps = new TupleOperations<T>(numberOps, stringOps);
    const changes = inputValue<TupleCommand<T> | null>(graph, null);
    const source = Reactive.create<Tuple<T>>(graph, tupleOps, changes, Tuple(10, "hello"));

    const second = projectTuple(graph, source, 1);
    graph.step();

    expect(second.snapshot).toBe("hello");
  });

  it("should propagate updates to the projected element", () => {
    type T = [number, string];
    const tupleOps = new TupleOperations<T>(numberOps, stringOps);
    const changes = inputValue<TupleCommand<T> | null>(graph, null);
    const source = Reactive.create<Tuple<T>>(graph, tupleOps, changes, Tuple(10, "hello"));

    const first = projectTuple(graph, source, 0);
    graph.step();

    changes.push([42, null]);
    graph.step();

    expect(first.snapshot).toBe(42);
  });

  it("should ignore updates to other elements", () => {
    type T = [number, string];
    const tupleOps = new TupleOperations<T>(numberOps, stringOps);
    const changes = inputValue<TupleCommand<T> | null>(graph, null);
    const source = Reactive.create<Tuple<T>>(graph, tupleOps, changes, Tuple(10, "hello"));

    const first = projectTuple(graph, source, 0);
    graph.step();

    changes.push([null, "world"]);
    graph.step();

    expect(first.snapshot).toBe(10);
  });

  it("should work with map elements", () => {
    type T = [IMap<string, number>, string];
    const mapOps = new MapOperations<string, number>(numberOps);
    const tupleOps = new TupleOperations<T>(mapOps, stringOps);
    const changes = inputValue<TupleCommand<T> | null>(graph, null);
    const source = Reactive.create<Tuple<T>>(
      graph,
      tupleOps,
      changes,
      Tuple(IMap({ a: 1, b: 2 }), "hello"),
    );

    const map = projectTuple(graph, source, 0);
    graph.step();

    expect(map.snapshot.get("a")).toBe(1);
    expect(map.snapshot.get("b")).toBe(2);

    // Update via inner map command
    changes.push([[{ type: "update", key: "a", command: 10 }], null]);
    graph.step();

    expect(map.snapshot.get("a")).toBe(10);
    expect(map.snapshot.get("b")).toBe(2);
  });

  it("should handle sequential updates across steps", () => {
    type T = [number, string];
    const tupleOps = new TupleOperations<T>(numberOps, stringOps);
    const changes = inputValue<TupleCommand<T> | null>(graph, null);
    const source = Reactive.create<Tuple<T>>(graph, tupleOps, changes, Tuple(10, "hello"));

    const first = projectTuple(graph, source, 0);
    graph.step();

    changes.push([20, null]);
    graph.step();
    expect(first.snapshot).toBe(20);

    changes.push([30, null]);
    graph.step();
    expect(first.snapshot).toBe(30);
  });

  it("should handle updates to both elements simultaneously", () => {
    type T = [number, string];
    const tupleOps = new TupleOperations<T>(numberOps, stringOps);
    const changes = inputValue<TupleCommand<T> | null>(graph, null);
    const source = Reactive.create<Tuple<T>>(graph, tupleOps, changes, Tuple(10, "hello"));

    const first = projectTuple(graph, source, 0);
    const second = projectTuple(graph, source, 1);
    graph.step();

    changes.push([42, "world"]);
    graph.step();

    expect(first.snapshot).toBe(42);
    expect(second.snapshot).toBe("world");
  });
});
