import { describe, it, expect, beforeEach } from "vitest";
import { Graph, inputValue, Input } from "derivation";
import { Map as IMap } from "immutable";
import { Reactive } from "../reactive.js";
import { MapOperations, MapCommand } from "../map-operations.js";
import { PrimitiveOperations } from "../primitive-operations.js";
import { sequenceMap } from "../sequence-map.js";

const numberOps = new PrimitiveOperations<number>();
const reactiveNumberOps = new PrimitiveOperations<Reactive<number>>();

describe("sequenceMap", () => {
  let graph: Graph;
  let outerChanges: Input<MapCommand<string, Reactive<number>>[]>;

  beforeEach(() => {
    graph = new Graph();
    outerChanges = inputValue(graph, [] as MapCommand<string, Reactive<number>>[]);
  });

  const makeInner = (initial: number) => {
    const changes = inputValue<number | null>(graph, null);
    const rx = Reactive.create<number>(graph, numberOps, changes, initial);
    return { rx, changes };
  };

  type ChangeKind = "add" | "delete" | "update" | "clear";
  const orderedPairs = (["add", "delete", "update", "clear"] as const)
    .flatMap((first) =>
      (["add", "delete", "update", "clear"] as const)
        .filter((second) => second !== first)
        .map((second) => [first, second] as const),
    );

  it.each(orderedPairs)(
    "applies %s then %s in one batch",
    (firstKind, secondKind) => {
      const a = makeInner(1);
      const b = makeInner(2);
      const addValue = makeInner(3);
      const updateValue = makeInner(4);

      const source = Reactive.create<IMap<string, Reactive<number>>>(
        graph,
        new MapOperations<string, Reactive<number>>(reactiveNumberOps),
        outerChanges,
        IMap({
          a: a.rx,
          b: b.rx,
        }),
      );
      const sequenced = sequenceMap(graph, source);
      graph.step();

      const makeCmd = (
        kind: ChangeKind,
      ): MapCommand<string, Reactive<number>> => {
        switch (kind) {
          case "add":
            return { type: "add", key: "x", value: addValue.rx };
          case "delete":
            return { type: "delete", key: "a" };
          case "update":
            return { type: "update", key: "a", command: updateValue.rx };
          case "clear":
            return { type: "clear" };
        }
      };

      const cmds = [makeCmd(firstKind), makeCmd(secondKind)];
      outerChanges.push(cmds);
      graph.step();

      const mapOps = new MapOperations<string, Reactive<number>>(reactiveNumberOps);
      const expectedOuter = mapOps.apply(IMap({ a: a.rx, b: b.rx }), cmds);
      let expected = IMap<string, number>();
      for (const [key, rx] of expectedOuter.entries()) {
        expected = expected.set(key, rx.snapshot);
      }

      expect(sequenced.snapshot.toObject()).toEqual(expected.toObject());
    },
  );

  it("sequences initial values and propagates inner updates", () => {
    const a = makeInner(1);
    const b = makeInner(2);
    const source = Reactive.create<IMap<string, Reactive<number>>>(
      graph,
      new MapOperations<string, Reactive<number>>(reactiveNumberOps),
      outerChanges,
      IMap({
        a: a.rx,
        b: b.rx,
      }),
    );

    const sequenced = sequenceMap(graph, source);
    graph.step();

    expect(sequenced.snapshot.get("a")).toBe(1);
    expect(sequenced.snapshot.get("b")).toBe(2);

    a.changes.push(10);
    graph.step();

    expect(sequenced.snapshot.get("a")).toBe(10);
    expect(sequenced.snapshot.get("b")).toBe(2);
  });

  it("subscribes on add and unsubscribes on delete", () => {
    const source = Reactive.create<IMap<string, Reactive<number>>>(
      graph,
      new MapOperations<string, Reactive<number>>(reactiveNumberOps),
      outerChanges,
      IMap<string, Reactive<number>>(),
    );
    const sequenced = sequenceMap(graph, source);
    graph.step();

    const x = makeInner(5);
    outerChanges.push([{ type: "add", key: "x", value: x.rx }]);
    graph.step();
    expect(sequenced.snapshot.get("x")).toBe(5);

    x.changes.push(8);
    graph.step();
    expect(sequenced.snapshot.get("x")).toBe(8);

    outerChanges.push([{ type: "delete", key: "x" }]);
    graph.step();
    expect(sequenced.snapshot.has("x")).toBe(false);

    x.changes.push(11);
    graph.step();
    expect(sequenced.snapshot.has("x")).toBe(false);
  });

  it("handles clear followed by add in the same batch", () => {
    const a = makeInner(1);
    const b = makeInner(2);
    const source = Reactive.create<IMap<string, Reactive<number>>>(
      graph,
      new MapOperations<string, Reactive<number>>(reactiveNumberOps),
      outerChanges,
      IMap({
        a: a.rx,
        b: b.rx,
      }),
    );
    const sequenced = sequenceMap(graph, source);
    graph.step();

    const c = makeInner(3);
    outerChanges.push([
      { type: "clear" },
      { type: "add", key: "c", value: c.rx },
    ]);
    graph.step();

    expect(sequenced.snapshot.size).toBe(1);
    expect(sequenced.snapshot.get("c")).toBe(3);
    expect(sequenced.snapshot.has("a")).toBe(false);
    expect(sequenced.snapshot.has("b")).toBe(false);

    a.changes.push(99);
    c.changes.push(7);
    graph.step();

    expect(sequenced.snapshot.size).toBe(1);
    expect(sequenced.snapshot.get("c")).toBe(7);
    expect(sequenced.snapshot.has("a")).toBe(false);
  });

  it("replacing a key via add detaches the old inner reactive", () => {
    const first = makeInner(10);
    const source = Reactive.create<IMap<string, Reactive<number>>>(
      graph,
      new MapOperations<string, Reactive<number>>(reactiveNumberOps),
      outerChanges,
      IMap({ a: first.rx }),
    );
    const sequenced = sequenceMap(graph, source);
    graph.step();
    expect(sequenced.snapshot.get("a")).toBe(10);

    const second = makeInner(20);
    outerChanges.push([{ type: "add", key: "a", value: second.rx }]);
    graph.step();
    expect(sequenced.snapshot.get("a")).toBe(20);

    first.changes.push(30);
    graph.step();
    expect(sequenced.snapshot.get("a")).toBe(20);

    second.changes.push(21);
    graph.step();
    expect(sequenced.snapshot.get("a")).toBe(21);
  });

  it("applies multiple operations in one batch across keys", () => {
    const a = makeInner(1);
    const b = makeInner(2);
    const source = Reactive.create<IMap<string, Reactive<number>>>(
      graph,
      new MapOperations<string, Reactive<number>>(reactiveNumberOps),
      outerChanges,
      IMap({
        a: a.rx,
        b: b.rx,
      }),
    );
    const sequenced = sequenceMap(graph, source);
    graph.step();

    const c = makeInner(3);
    const d = makeInner(4);
    outerChanges.push([
      { type: "delete", key: "a" },
      { type: "add", key: "c", value: c.rx },
      { type: "add", key: "d", value: d.rx },
      { type: "delete", key: "b" },
    ]);
    graph.step();

    expect(sequenced.snapshot.toObject()).toEqual({ c: 3, d: 4 });

    a.changes.push(100);
    b.changes.push(200);
    c.changes.push(30);
    d.changes.push(40);
    graph.step();

    expect(sequenced.snapshot.toObject()).toEqual({ c: 30, d: 40 });
  });

  it("uses last structural operation for the same key in a batch", () => {
    const first = makeInner(1);
    const source = Reactive.create<IMap<string, Reactive<number>>>(
      graph,
      new MapOperations<string, Reactive<number>>(reactiveNumberOps),
      outerChanges,
      IMap({ k: first.rx }),
    );
    const sequenced = sequenceMap(graph, source);
    graph.step();

    const second = makeInner(2);
    const third = makeInner(3);
    outerChanges.push([
      { type: "delete", key: "k" },
      { type: "add", key: "k", value: second.rx },
      { type: "delete", key: "k" },
      { type: "add", key: "k", value: third.rx },
    ]);
    graph.step();

    expect(sequenced.snapshot.get("k")).toBe(3);

    first.changes.push(11);
    second.changes.push(22);
    third.changes.push(33);
    graph.step();

    expect(sequenced.snapshot.get("k")).toBe(33);
  });

  it("replaces a key when outer map emits update with a new inner reactive", () => {
    const first = makeInner(1);
    const source = Reactive.create<IMap<string, Reactive<number>>>(
      graph,
      new MapOperations<string, Reactive<number>>(reactiveNumberOps),
      outerChanges,
      IMap({ k: first.rx }),
    );
    const sequenced = sequenceMap(graph, source);
    graph.step();
    expect(sequenced.snapshot.get("k")).toBe(1);

    const second = makeInner(2);
    outerChanges.push([{ type: "update", key: "k", command: second.rx }]);
    graph.step();

    // Expected: update should replace the inner reactive for key "k".
    expect(sequenced.snapshot.get("k")).toBe(2);

    first.changes.push(11);
    second.changes.push(22);
    graph.step();

    // Expected: old inner reactive should be detached after replacement.
    expect(sequenced.snapshot.get("k")).toBe(22);
  });

  it("ignores update for a missing key", () => {
    const source = Reactive.create<IMap<string, Reactive<number>>>(
      graph,
      new MapOperations<string, Reactive<number>>(reactiveNumberOps),
      outerChanges,
      IMap<string, Reactive<number>>(),
    );
    const sequenced = sequenceMap(graph, source);
    graph.step();

    const missing = makeInner(9);
    outerChanges.push([{ type: "update", key: "missing", command: missing.rx }]);
    graph.step();

    expect(sequenced.snapshot.has("missing")).toBe(false);

    missing.changes.push(11);
    graph.step();

    expect(sequenced.snapshot.has("missing")).toBe(false);
  });
});
