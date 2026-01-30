import { describe, it, expect, beforeEach } from "vitest";
import { Graph, inputValue, Input } from "derivation";
import { Map as IMap } from "immutable";
import { Reactive } from "../reactive.js";
import { MapOperations, MapCommand } from "../map-operations.js";
import { joinMap } from "../join-map.js";
import { PrimitiveOperations } from "../primitive-operations.js";
import { Tuple } from "../tuple.js";

const numberOps = new PrimitiveOperations<number>();
const stringOps = new PrimitiveOperations<string>();

// Inner map operations: IMap<string, number> needs PrimitiveOperations<number> as value ops
const innerNumberMapOps = new MapOperations<string, number>(numberOps);
const innerStringMapOps = new MapOperations<string, string>(stringOps);

describe("joinMap", () => {
  let graph: Graph;
  let leftChanges: Input<MapCommand<string, IMap<string, number>>[]>;
  let rightChanges: Input<MapCommand<string, IMap<string, string>>[]>;
  let left: Reactive<IMap<string, IMap<string, number>>>;
  let right: Reactive<IMap<string, IMap<string, string>>>;

  beforeEach(() => {
    graph = new Graph();
    leftChanges = inputValue(graph, [] as MapCommand<string, IMap<string, number>>[]);
    rightChanges = inputValue(graph, [] as MapCommand<string, IMap<string, string>>[]);
    left = Reactive.create<IMap<string, IMap<string, number>>>(
      graph,
      new MapOperations<string, IMap<string, number>>(innerNumberMapOps as any),
      leftChanges,
      IMap<string, IMap<string, number>>(),
    );
    right = Reactive.create<IMap<string, IMap<string, string>>>(
      graph,
      new MapOperations<string, IMap<string, string>>(innerStringMapOps as any),
      rightChanges,
      IMap<string, IMap<string, string>>(),
    );
  });

  it("should produce empty output for empty inputs", () => {
    const joined = joinMap(graph, left, right);
    graph.step();

    expect(joined.snapshot.size).toBe(0);
  });

  it("should produce initial snapshot with matching keys", () => {
    const lInitial = IMap<string, IMap<string, number>>({
      x: IMap({ a: 1, b: 2 }),
      y: IMap({ c: 3 }),
    });
    const rInitial = IMap<string, IMap<string, string>>({
      x: IMap({ p: "hello" }),
      z: IMap({ q: "world" }),
    });

    const l = Reactive.create<IMap<string, IMap<string, number>>>(
      graph,
      new MapOperations<string, IMap<string, number>>(innerNumberMapOps as any),
      leftChanges,
      lInitial,
    );
    const r = Reactive.create<IMap<string, IMap<string, string>>>(
      graph,
      new MapOperations<string, IMap<string, string>>(innerStringMapOps as any),
      rightChanges,
      rInitial,
    );

    const joined = joinMap(graph, l, r);
    graph.step();

    // Only key "x" matches
    expect(joined.snapshot.size).toBe(1);
    expect(joined.snapshot.has("x")).toBe(true);

    const xProduct = joined.snapshot.get("x")!;
    // Cartesian product: {a,b} × {p} = 2 entries
    expect(xProduct.size).toBe(2);
    expect(xProduct.get(Tuple("a", "p"))).toEqual(Tuple(1, "hello"));
    expect(xProduct.get(Tuple("b", "p"))).toEqual(Tuple(2, "hello"));
  });

  it("should produce output when key is added to left and right already has it", () => {
    // Right starts with key "x"
    const rInitial = IMap<string, IMap<string, string>>({
      x: IMap({ p: "hello" }),
    });
    const r = Reactive.create<IMap<string, IMap<string, string>>>(
      graph,
      new MapOperations<string, IMap<string, string>>(innerStringMapOps as any),
      rightChanges,
      rInitial,
    );

    const joined = joinMap(graph, left, r);
    graph.step();

    // No matching keys yet
    expect(joined.snapshot.size).toBe(0);

    // Add key "x" to left
    leftChanges.push([{ type: "add", key: "x", value: IMap({ a: 1 }) }]);
    graph.step();

    expect(joined.snapshot.size).toBe(1);
    const xProduct = joined.snapshot.get("x")!;
    expect(xProduct.size).toBe(1);
    expect(xProduct.get(Tuple("a", "p"))).toEqual(Tuple(1, "hello"));
  });

  it("should produce output when key is added to right and left already has it", () => {
    // Left starts with key "x"
    const lInitial = IMap<string, IMap<string, number>>({
      x: IMap({ a: 1, b: 2 }),
    });
    const l = Reactive.create<IMap<string, IMap<string, number>>>(
      graph,
      new MapOperations<string, IMap<string, number>>(innerNumberMapOps as any),
      leftChanges,
      lInitial,
    );

    const joined = joinMap(graph, l, right);
    graph.step();

    expect(joined.snapshot.size).toBe(0);

    // Add key "x" to right
    rightChanges.push([{ type: "add", key: "x", value: IMap({ p: "hello" }) }]);
    graph.step();

    expect(joined.snapshot.size).toBe(1);
    const xProduct = joined.snapshot.get("x")!;
    expect(xProduct.size).toBe(2);
    expect(xProduct.get(Tuple("a", "p"))).toEqual(Tuple(1, "hello"));
    expect(xProduct.get(Tuple("b", "p"))).toEqual(Tuple(2, "hello"));
  });

  it("should update output when inner map on one side changes", () => {
    const lInitial = IMap<string, IMap<string, number>>({
      x: IMap({ a: 1 }),
    });
    const rInitial = IMap<string, IMap<string, string>>({
      x: IMap({ p: "hello" }),
    });
    const l = Reactive.create<IMap<string, IMap<string, number>>>(
      graph,
      new MapOperations<string, IMap<string, number>>(innerNumberMapOps as any),
      leftChanges,
      lInitial,
    );
    const r = Reactive.create<IMap<string, IMap<string, string>>>(
      graph,
      new MapOperations<string, IMap<string, string>>(innerStringMapOps as any),
      rightChanges,
      rInitial,
    );

    const joined = joinMap(graph, l, r);
    graph.step();

    expect(joined.snapshot.get("x")!.size).toBe(1);

    // Update left's inner map at key "x" — add entry "b"
    leftChanges.push([{
      type: "update",
      key: "x",
      command: [{ type: "add", key: "b", value: 2 }],
    }]);
    graph.step();

    const xProduct = joined.snapshot.get("x")!;
    expect(xProduct.size).toBe(2);
    expect(xProduct.get(Tuple("a", "p"))).toEqual(Tuple(1, "hello"));
    expect(xProduct.get(Tuple("b", "p"))).toEqual(Tuple(2, "hello"));
  });

  it("should remove output when key is deleted from one side", () => {
    const lInitial = IMap<string, IMap<string, number>>({
      x: IMap({ a: 1 }),
    });
    const rInitial = IMap<string, IMap<string, string>>({
      x: IMap({ p: "hello" }),
    });
    const l = Reactive.create<IMap<string, IMap<string, number>>>(
      graph,
      new MapOperations<string, IMap<string, number>>(innerNumberMapOps as any),
      leftChanges,
      lInitial,
    );
    const r = Reactive.create<IMap<string, IMap<string, string>>>(
      graph,
      new MapOperations<string, IMap<string, string>>(innerStringMapOps as any),
      rightChanges,
      rInitial,
    );

    const joined = joinMap(graph, l, r);
    graph.step();

    expect(joined.snapshot.size).toBe(1);

    // Delete key "x" from left
    leftChanges.push([{ type: "delete", key: "x" }]);
    graph.step();

    expect(joined.snapshot.size).toBe(0);
  });

  it("should not produce output for non-matching keys", () => {
    const lInitial = IMap<string, IMap<string, number>>({
      a: IMap({ id1: 1 }),
    });
    const rInitial = IMap<string, IMap<string, string>>({
      b: IMap({ id2: "hello" }),
    });
    const l = Reactive.create<IMap<string, IMap<string, number>>>(
      graph,
      new MapOperations<string, IMap<string, number>>(innerNumberMapOps as any),
      leftChanges,
      lInitial,
    );
    const r = Reactive.create<IMap<string, IMap<string, string>>>(
      graph,
      new MapOperations<string, IMap<string, string>>(innerStringMapOps as any),
      rightChanges,
      rInitial,
    );

    const joined = joinMap(graph, l, r);
    graph.step();

    expect(joined.snapshot.size).toBe(0);

    // Add a key to left that still doesn't match right
    leftChanges.push([{ type: "add", key: "c", value: IMap({ id3: 3 }) }]);
    graph.step();

    expect(joined.snapshot.size).toBe(0);
  });

  it("should handle updates on both sides in the same step", () => {
    const lInitial = IMap<string, IMap<string, number>>({
      x: IMap({ a: 1 }),
    });
    const rInitial = IMap<string, IMap<string, string>>({
      x: IMap({ p: "hello" }),
    });
    const l = Reactive.create<IMap<string, IMap<string, number>>>(
      graph,
      new MapOperations<string, IMap<string, number>>(innerNumberMapOps as any),
      leftChanges,
      lInitial,
    );
    const r = Reactive.create<IMap<string, IMap<string, string>>>(
      graph,
      new MapOperations<string, IMap<string, string>>(innerStringMapOps as any),
      rightChanges,
      rInitial,
    );

    const joined = joinMap(graph, l, r);
    graph.step();

    // Add entry to both sides at key "x" in same step
    leftChanges.push([{
      type: "update",
      key: "x",
      command: [{ type: "add", key: "b", value: 2 }],
    }]);
    rightChanges.push([{
      type: "update",
      key: "x",
      command: [{ type: "add", key: "q", value: "world" }],
    }]);
    graph.step();

    const xProduct = joined.snapshot.get("x")!;
    // {a,b} × {p,q} = 4 entries
    expect(xProduct.size).toBe(4);
    expect(xProduct.get(Tuple("a", "p"))).toEqual(Tuple(1, "hello"));
    expect(xProduct.get(Tuple("a", "q"))).toEqual(Tuple(1, "world"));
    expect(xProduct.get(Tuple("b", "p"))).toEqual(Tuple(2, "hello"));
    expect(xProduct.get(Tuple("b", "q"))).toEqual(Tuple(2, "world"));
  });

  it("should handle value changes in inner maps", () => {
    const lInitial = IMap<string, IMap<string, number>>({
      x: IMap({ a: 1 }),
    });
    const rInitial = IMap<string, IMap<string, string>>({
      x: IMap({ p: "hello" }),
    });
    const l = Reactive.create<IMap<string, IMap<string, number>>>(
      graph,
      new MapOperations<string, IMap<string, number>>(innerNumberMapOps as any),
      leftChanges,
      lInitial,
    );
    const r = Reactive.create<IMap<string, IMap<string, string>>>(
      graph,
      new MapOperations<string, IMap<string, string>>(innerStringMapOps as any),
      rightChanges,
      rInitial,
    );

    const joined = joinMap(graph, l, r);
    graph.step();

    expect(joined.snapshot.get("x")!.get(Tuple("a", "p"))).toEqual(Tuple(1, "hello"));

    // Update value in left inner map
    leftChanges.push([{
      type: "update",
      key: "x",
      command: [{ type: "update", key: "a", command: 99 }],
    }]);
    graph.step();

    expect(joined.snapshot.get("x")!.get(Tuple("a", "p"))).toEqual(Tuple(99, "hello"));
  });

  it("should handle simultaneous value updates on both sides", () => {
    const lInitial = IMap<string, IMap<string, number>>({
      x: IMap({ a: 1, b: 2 }),
    });
    const rInitial = IMap<string, IMap<string, string>>({
      x: IMap({ p: "hello", q: "world" }),
    });
    const l = Reactive.create<IMap<string, IMap<string, number>>>(
      graph,
      new MapOperations<string, IMap<string, number>>(innerNumberMapOps as any),
      leftChanges,
      lInitial,
    );
    const r = Reactive.create<IMap<string, IMap<string, string>>>(
      graph,
      new MapOperations<string, IMap<string, string>>(innerStringMapOps as any),
      rightChanges,
      rInitial,
    );

    const joined = joinMap(graph, l, r);
    graph.step();

    // Update a value on each side simultaneously
    leftChanges.push([{
      type: "update",
      key: "x",
      command: [{ type: "update", key: "a", command: 10 }],
    }]);
    rightChanges.push([{
      type: "update",
      key: "x",
      command: [{ type: "update", key: "p", command: "new" }],
    }]);
    graph.step();

    // {a:10, b:2} × {p:"new", q:"world"}
    const xProduct = joined.snapshot.get("x")!;
    expect(xProduct.size).toBe(4);
    expect(xProduct.get(Tuple("a", "p"))).toEqual(Tuple(10, "new"));
    expect(xProduct.get(Tuple("a", "q"))).toEqual(Tuple(10, "world"));
    expect(xProduct.get(Tuple("b", "p"))).toEqual(Tuple(2, "new"));
    expect(xProduct.get(Tuple("b", "q"))).toEqual(Tuple(2, "world"));
  });

  it("should handle left add + right delete of inner entries simultaneously", () => {
    const lInitial = IMap<string, IMap<string, number>>({
      x: IMap({ a: 1 }),
    });
    const rInitial = IMap<string, IMap<string, string>>({
      x: IMap({ p: "hello", q: "world" }),
    });
    const l = Reactive.create<IMap<string, IMap<string, number>>>(
      graph,
      new MapOperations<string, IMap<string, number>>(innerNumberMapOps as any),
      leftChanges,
      lInitial,
    );
    const r = Reactive.create<IMap<string, IMap<string, string>>>(
      graph,
      new MapOperations<string, IMap<string, string>>(innerStringMapOps as any),
      rightChanges,
      rInitial,
    );

    const joined = joinMap(graph, l, r);
    graph.step();

    expect(joined.snapshot.get("x")!.size).toBe(2); // {a} × {p,q}

    // Left adds entry "b", right deletes entry "q"
    leftChanges.push([{
      type: "update",
      key: "x",
      command: [{ type: "add", key: "b", value: 2 }],
    }]);
    rightChanges.push([{
      type: "update",
      key: "x",
      command: [{ type: "delete", key: "q" }],
    }]);
    graph.step();

    // {a:1, b:2} × {p:"hello"}
    const xProduct = joined.snapshot.get("x")!;
    expect(xProduct.size).toBe(2);
    expect(xProduct.get(Tuple("a", "p"))).toEqual(Tuple(1, "hello"));
    expect(xProduct.get(Tuple("b", "p"))).toEqual(Tuple(2, "hello"));
    // Deleted pairs should not exist
    expect(xProduct.has(Tuple("a", "q"))).toBe(false);
    expect(xProduct.has(Tuple("b", "q"))).toBe(false);
  });

  it("should handle simultaneous deletes from both inner maps", () => {
    const lInitial = IMap<string, IMap<string, number>>({
      x: IMap({ a: 1, b: 2 }),
    });
    const rInitial = IMap<string, IMap<string, string>>({
      x: IMap({ p: "hello", q: "world" }),
    });
    const l = Reactive.create<IMap<string, IMap<string, number>>>(
      graph,
      new MapOperations<string, IMap<string, number>>(innerNumberMapOps as any),
      leftChanges,
      lInitial,
    );
    const r = Reactive.create<IMap<string, IMap<string, string>>>(
      graph,
      new MapOperations<string, IMap<string, string>>(innerStringMapOps as any),
      rightChanges,
      rInitial,
    );

    const joined = joinMap(graph, l, r);
    graph.step();

    expect(joined.snapshot.get("x")!.size).toBe(4); // {a,b} × {p,q}

    // Delete from both sides simultaneously
    leftChanges.push([{
      type: "update",
      key: "x",
      command: [{ type: "delete", key: "a" }],
    }]);
    rightChanges.push([{
      type: "update",
      key: "x",
      command: [{ type: "delete", key: "p" }],
    }]);
    graph.step();

    // {b:2} × {q:"world"}
    const xProduct = joined.snapshot.get("x")!;
    expect(xProduct.size).toBe(1);
    expect(xProduct.get(Tuple("b", "q"))).toEqual(Tuple(2, "world"));
  });

  it("should handle inner clear on one side with changes on the other", () => {
    const lInitial = IMap<string, IMap<string, number>>({
      x: IMap({ a: 1, b: 2 }),
    });
    const rInitial = IMap<string, IMap<string, string>>({
      x: IMap({ p: "hello" }),
    });
    const l = Reactive.create<IMap<string, IMap<string, number>>>(
      graph,
      new MapOperations<string, IMap<string, number>>(innerNumberMapOps as any),
      leftChanges,
      lInitial,
    );
    const r = Reactive.create<IMap<string, IMap<string, string>>>(
      graph,
      new MapOperations<string, IMap<string, string>>(innerStringMapOps as any),
      rightChanges,
      rInitial,
    );

    const joined = joinMap(graph, l, r);
    graph.step();

    expect(joined.snapshot.get("x")!.size).toBe(2);

    // Left clears inner map and re-adds, right adds an entry
    leftChanges.push([{
      type: "update",
      key: "x",
      command: [{ type: "clear" }, { type: "add", key: "c", value: 3 }],
    }]);
    rightChanges.push([{
      type: "update",
      key: "x",
      command: [{ type: "add", key: "q", value: "world" }],
    }]);
    graph.step();

    // {c:3} × {p:"hello", q:"world"}
    const xProduct = joined.snapshot.get("x")!;
    expect(xProduct.size).toBe(2);
    expect(xProduct.get(Tuple("c", "p"))).toEqual(Tuple(3, "hello"));
    expect(xProduct.get(Tuple("c", "q"))).toEqual(Tuple(3, "world"));
  });

  it("should handle delete-then-add of same inner key simultaneously with right changes", () => {
    const lInitial = IMap<string, IMap<string, number>>({
      x: IMap({ a: 1 }),
    });
    const rInitial = IMap<string, IMap<string, string>>({
      x: IMap({ p: "hello" }),
    });
    const l = Reactive.create<IMap<string, IMap<string, number>>>(
      graph,
      new MapOperations<string, IMap<string, number>>(innerNumberMapOps as any),
      leftChanges,
      lInitial,
    );
    const r = Reactive.create<IMap<string, IMap<string, string>>>(
      graph,
      new MapOperations<string, IMap<string, string>>(innerStringMapOps as any),
      rightChanges,
      rInitial,
    );

    const joined = joinMap(graph, l, r);
    graph.step();

    expect(joined.snapshot.get("x")!.get(Tuple("a", "p"))).toEqual(Tuple(1, "hello"));

    // Left: delete "a" then add "a" back with new value (replace)
    // Right: update "p" value
    leftChanges.push([{
      type: "update",
      key: "x",
      command: [
        { type: "delete", key: "a" },
        { type: "add", key: "a", value: 5 },
      ],
    }]);
    rightChanges.push([{
      type: "update",
      key: "x",
      command: [{ type: "update", key: "p", command: "world" }],
    }]);
    graph.step();

    // {a:5} × {p:"world"}
    const xProduct = joined.snapshot.get("x")!;
    expect(xProduct.size).toBe(1);
    expect(xProduct.get(Tuple("a", "p"))).toEqual(Tuple(5, "world"));
  });

  it("should handle both sides adding then one side deleting the outer key", () => {
    const joined = joinMap(graph, left, right);
    graph.step();

    // Add matching key on both sides
    leftChanges.push([{ type: "add", key: "x", value: IMap({ a: 1 }) }]);
    rightChanges.push([{ type: "add", key: "x", value: IMap({ p: "hello" }) }]);
    graph.step();

    expect(joined.snapshot.size).toBe(1);
    expect(joined.snapshot.get("x")!.get(Tuple("a", "p"))).toEqual(Tuple(1, "hello"));

    // Delete from left
    leftChanges.push([{ type: "delete", key: "x" }]);
    graph.step();

    expect(joined.snapshot.size).toBe(0);

    // Re-add on left with different inner map
    leftChanges.push([{ type: "add", key: "x", value: IMap({ b: 2 }) }]);
    graph.step();

    expect(joined.snapshot.size).toBe(1);
    const xProduct = joined.snapshot.get("x")!;
    expect(xProduct.size).toBe(1);
    expect(xProduct.get(Tuple("b", "p"))).toEqual(Tuple(2, "hello"));
  });
});
