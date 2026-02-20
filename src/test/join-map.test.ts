import { describe, it, expect, beforeEach } from "vitest";
import { Graph, inputValue, Input } from "derivation";
import { Map as IMap } from "immutable";
import { Reactive } from "../reactive.js";
import { Cell } from "../cell.js";
import { CellOperations } from "../cell-operations.js";
import { MapOperations, MapCommand } from "../map-operations.js";
import { joinMap } from "../join-map.js";
import { Tuple } from "../tuple.js";

const numberOps = new CellOperations<number>();
const stringOps = new CellOperations<string>();
const cn = (n: number) => new Cell(n);
const cs = (s: string) => new Cell(s);
const nm = (obj: Record<string, number>) =>
  IMap<string, Cell<number>>(
    Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, cn(v)])),
  );
const sm = (obj: Record<string, string>) =>
  IMap<string, Cell<string>>(
    Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, cs(v)])),
  );
const tv = (n: number, s: string) => Tuple(cn(n), cs(s));

const innerNumberMapOps = new MapOperations<string, Cell<number>>(numberOps);
const innerStringMapOps = new MapOperations<string, Cell<string>>(stringOps);

describe("joinMap", () => {
  let graph: Graph;
  let leftChanges: Input<MapCommand<string, IMap<string, Cell<number>>>[]>;
  let rightChanges: Input<MapCommand<string, IMap<string, Cell<string>>>[]>;
  let left: Reactive<IMap<string, IMap<string, Cell<number>>>>;
  let right: Reactive<IMap<string, IMap<string, Cell<string>>>>;

  beforeEach(() => {
    graph = new Graph();
    leftChanges = inputValue(graph, [] as MapCommand<string, IMap<string, Cell<number>>>[]);
    rightChanges = inputValue(graph, [] as MapCommand<string, IMap<string, Cell<string>>>[]);
    left = Reactive.create<IMap<string, IMap<string, Cell<number>>>>(
      graph,
      new MapOperations<string, IMap<string, Cell<number>>>(innerNumberMapOps as any),
      leftChanges,
      IMap<string, IMap<string, Cell<number>>>(),
    );
    right = Reactive.create<IMap<string, IMap<string, Cell<string>>>>(
      graph,
      new MapOperations<string, IMap<string, Cell<string>>>(innerStringMapOps as any),
      rightChanges,
      IMap<string, IMap<string, Cell<string>>>(),
    );
  });

  it("should produce empty output for empty inputs", () => {
    const joined = joinMap(graph, left, right);
    graph.step();

    expect(joined.snapshot.size).toBe(0);
  });

  it("should produce initial snapshot with matching keys", () => {
    const lInitial = IMap<string, IMap<string, Cell<number>>>({
      x: nm({ a: 1, b: 2 }),
      y: nm({ c: 3 }),
    });
    const rInitial = IMap<string, IMap<string, Cell<string>>>({
      x: sm({ p: "hello" }),
      z: sm({ q: "world" }),
    });

    const l = Reactive.create<IMap<string, IMap<string, Cell<number>>>>(
      graph,
      new MapOperations<string, IMap<string, Cell<number>>>(innerNumberMapOps as any),
      leftChanges,
      lInitial,
    );
    const r = Reactive.create<IMap<string, IMap<string, Cell<string>>>>(
      graph,
      new MapOperations<string, IMap<string, Cell<string>>>(innerStringMapOps as any),
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
    expect(xProduct.get(Tuple("a", "p"))).toEqual(tv(1, "hello"));
    expect(xProduct.get(Tuple("b", "p"))).toEqual(tv(2, "hello"));
  });

  it("should produce output when key is added to left and right already has it", () => {
    // Right starts with key "x"
    const rInitial = IMap<string, IMap<string, Cell<string>>>({
      x: sm({ p: "hello" }),
    });
    const r = Reactive.create<IMap<string, IMap<string, Cell<string>>>>(
      graph,
      new MapOperations<string, IMap<string, Cell<string>>>(innerStringMapOps as any),
      rightChanges,
      rInitial,
    );

    const joined = joinMap(graph, left, r);
    graph.step();

    // No matching keys yet
    expect(joined.snapshot.size).toBe(0);

    // Add key "x" to left
    leftChanges.push([{ type: "add", key: "x", value: nm({ a: 1 }) }]);
    graph.step();

    expect(joined.snapshot.size).toBe(1);
    const xProduct = joined.snapshot.get("x")!;
    expect(xProduct.size).toBe(1);
    expect(xProduct.get(Tuple("a", "p"))).toEqual(tv(1, "hello"));
  });

  it("should produce output when key is added to right and left already has it", () => {
    // Left starts with key "x"
    const lInitial = IMap<string, IMap<string, Cell<number>>>({
      x: nm({ a: 1, b: 2 }),
    });
    const l = Reactive.create<IMap<string, IMap<string, Cell<number>>>>(
      graph,
      new MapOperations<string, IMap<string, Cell<number>>>(innerNumberMapOps as any),
      leftChanges,
      lInitial,
    );

    const joined = joinMap(graph, l, right);
    graph.step();

    expect(joined.snapshot.size).toBe(0);

    // Add key "x" to right
    rightChanges.push([{ type: "add", key: "x", value: sm({ p: "hello" }) }]);
    graph.step();

    expect(joined.snapshot.size).toBe(1);
    const xProduct = joined.snapshot.get("x")!;
    expect(xProduct.size).toBe(2);
    expect(xProduct.get(Tuple("a", "p"))).toEqual(tv(1, "hello"));
    expect(xProduct.get(Tuple("b", "p"))).toEqual(tv(2, "hello"));
  });

  it("should update output when inner map on one side changes", () => {
    const lInitial = IMap<string, IMap<string, Cell<number>>>({
      x: nm({ a: 1 }),
    });
    const rInitial = IMap<string, IMap<string, Cell<string>>>({
      x: sm({ p: "hello" }),
    });
    const l = Reactive.create<IMap<string, IMap<string, Cell<number>>>>(
      graph,
      new MapOperations<string, IMap<string, Cell<number>>>(innerNumberMapOps as any),
      leftChanges,
      lInitial,
    );
    const r = Reactive.create<IMap<string, IMap<string, Cell<string>>>>(
      graph,
      new MapOperations<string, IMap<string, Cell<string>>>(innerStringMapOps as any),
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
      command: [{ type: "add", key: "b", value: cn(2) }],
    }]);
    graph.step();

    const xProduct = joined.snapshot.get("x")!;
    expect(xProduct.size).toBe(2);
    expect(xProduct.get(Tuple("a", "p"))).toEqual(tv(1, "hello"));
    expect(xProduct.get(Tuple("b", "p"))).toEqual(tv(2, "hello"));
  });

  it("should remove output when key is deleted from one side", () => {
    const lInitial = IMap<string, IMap<string, Cell<number>>>({
      x: nm({ a: 1 }),
    });
    const rInitial = IMap<string, IMap<string, Cell<string>>>({
      x: sm({ p: "hello" }),
    });
    const l = Reactive.create<IMap<string, IMap<string, Cell<number>>>>(
      graph,
      new MapOperations<string, IMap<string, Cell<number>>>(innerNumberMapOps as any),
      leftChanges,
      lInitial,
    );
    const r = Reactive.create<IMap<string, IMap<string, Cell<string>>>>(
      graph,
      new MapOperations<string, IMap<string, Cell<string>>>(innerStringMapOps as any),
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
    const lInitial = IMap<string, IMap<string, Cell<number>>>({
      a: nm({ id1: 1 }),
    });
    const rInitial = IMap<string, IMap<string, Cell<string>>>({
      b: sm({ id2: "hello" }),
    });
    const l = Reactive.create<IMap<string, IMap<string, Cell<number>>>>(
      graph,
      new MapOperations<string, IMap<string, Cell<number>>>(innerNumberMapOps as any),
      leftChanges,
      lInitial,
    );
    const r = Reactive.create<IMap<string, IMap<string, Cell<string>>>>(
      graph,
      new MapOperations<string, IMap<string, Cell<string>>>(innerStringMapOps as any),
      rightChanges,
      rInitial,
    );

    const joined = joinMap(graph, l, r);
    graph.step();

    expect(joined.snapshot.size).toBe(0);

    // Add a key to left that still doesn't match right
    leftChanges.push([{ type: "add", key: "c", value: nm({ id3: 3 }) }]);
    graph.step();

    expect(joined.snapshot.size).toBe(0);
  });

  it("should handle updates on both sides in the same step", () => {
    const lInitial = IMap<string, IMap<string, Cell<number>>>({
      x: nm({ a: 1 }),
    });
    const rInitial = IMap<string, IMap<string, Cell<string>>>({
      x: sm({ p: "hello" }),
    });
    const l = Reactive.create<IMap<string, IMap<string, Cell<number>>>>(
      graph,
      new MapOperations<string, IMap<string, Cell<number>>>(innerNumberMapOps as any),
      leftChanges,
      lInitial,
    );
    const r = Reactive.create<IMap<string, IMap<string, Cell<string>>>>(
      graph,
      new MapOperations<string, IMap<string, Cell<string>>>(innerStringMapOps as any),
      rightChanges,
      rInitial,
    );

    const joined = joinMap(graph, l, r);
    graph.step();

    // Add entry to both sides at key "x" in same step
    leftChanges.push([{
      type: "update",
      key: "x",
      command: [{ type: "add", key: "b", value: cn(2) }],
    }]);
    rightChanges.push([{
      type: "update",
      key: "x",
      command: [{ type: "add", key: "q", value: cs("world") }],
    }]);
    graph.step();

    const xProduct = joined.snapshot.get("x")!;
    // {a,b} × {p,q} = 4 entries
    expect(xProduct.size).toBe(4);
    expect(xProduct.get(Tuple("a", "p"))).toEqual(tv(1, "hello"));
    expect(xProduct.get(Tuple("a", "q"))).toEqual(tv(1, "world"));
    expect(xProduct.get(Tuple("b", "p"))).toEqual(tv(2, "hello"));
    expect(xProduct.get(Tuple("b", "q"))).toEqual(tv(2, "world"));
  });

  it("should handle value changes in inner maps", () => {
    const lInitial = IMap<string, IMap<string, Cell<number>>>({
      x: nm({ a: 1 }),
    });
    const rInitial = IMap<string, IMap<string, Cell<string>>>({
      x: sm({ p: "hello" }),
    });
    const l = Reactive.create<IMap<string, IMap<string, Cell<number>>>>(
      graph,
      new MapOperations<string, IMap<string, Cell<number>>>(innerNumberMapOps as any),
      leftChanges,
      lInitial,
    );
    const r = Reactive.create<IMap<string, IMap<string, Cell<string>>>>(
      graph,
      new MapOperations<string, IMap<string, Cell<string>>>(innerStringMapOps as any),
      rightChanges,
      rInitial,
    );

    const joined = joinMap(graph, l, r);
    graph.step();

    expect(joined.snapshot.get("x")!.get(Tuple("a", "p"))).toEqual(tv(1, "hello"));

    // Update value in left inner map
    leftChanges.push([{
      type: "update",
      key: "x",
      command: [{ type: "update", key: "a", command: 99 }],
    }]);
    graph.step();

    expect(joined.snapshot.get("x")!.get(Tuple("a", "p"))).toEqual(tv(99, "hello"));
  });

  it("should handle simultaneous value updates on both sides", () => {
    const lInitial = IMap<string, IMap<string, Cell<number>>>({
      x: nm({ a: 1, b: 2 }),
    });
    const rInitial = IMap<string, IMap<string, Cell<string>>>({
      x: sm({ p: "hello", q: "world" }),
    });
    const l = Reactive.create<IMap<string, IMap<string, Cell<number>>>>(
      graph,
      new MapOperations<string, IMap<string, Cell<number>>>(innerNumberMapOps as any),
      leftChanges,
      lInitial,
    );
    const r = Reactive.create<IMap<string, IMap<string, Cell<string>>>>(
      graph,
      new MapOperations<string, IMap<string, Cell<string>>>(innerStringMapOps as any),
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
    expect(xProduct.get(Tuple("a", "p"))).toEqual(tv(10, "new"));
    expect(xProduct.get(Tuple("a", "q"))).toEqual(tv(10, "world"));
    expect(xProduct.get(Tuple("b", "p"))).toEqual(tv(2, "new"));
    expect(xProduct.get(Tuple("b", "q"))).toEqual(tv(2, "world"));
  });

  it("should handle left add + right delete of inner entries simultaneously", () => {
    const lInitial = IMap<string, IMap<string, Cell<number>>>({
      x: nm({ a: 1 }),
    });
    const rInitial = IMap<string, IMap<string, Cell<string>>>({
      x: sm({ p: "hello", q: "world" }),
    });
    const l = Reactive.create<IMap<string, IMap<string, Cell<number>>>>(
      graph,
      new MapOperations<string, IMap<string, Cell<number>>>(innerNumberMapOps as any),
      leftChanges,
      lInitial,
    );
    const r = Reactive.create<IMap<string, IMap<string, Cell<string>>>>(
      graph,
      new MapOperations<string, IMap<string, Cell<string>>>(innerStringMapOps as any),
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
      command: [{ type: "add", key: "b", value: cn(2) }],
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
    expect(xProduct.get(Tuple("a", "p"))).toEqual(tv(1, "hello"));
    expect(xProduct.get(Tuple("b", "p"))).toEqual(tv(2, "hello"));
    // Deleted pairs should not exist
    expect(xProduct.has(Tuple("a", "q"))).toBe(false);
    expect(xProduct.has(Tuple("b", "q"))).toBe(false);
  });

  it("should handle simultaneous deletes from both inner maps", () => {
    const lInitial = IMap<string, IMap<string, Cell<number>>>({
      x: nm({ a: 1, b: 2 }),
    });
    const rInitial = IMap<string, IMap<string, Cell<string>>>({
      x: sm({ p: "hello", q: "world" }),
    });
    const l = Reactive.create<IMap<string, IMap<string, Cell<number>>>>(
      graph,
      new MapOperations<string, IMap<string, Cell<number>>>(innerNumberMapOps as any),
      leftChanges,
      lInitial,
    );
    const r = Reactive.create<IMap<string, IMap<string, Cell<string>>>>(
      graph,
      new MapOperations<string, IMap<string, Cell<string>>>(innerStringMapOps as any),
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
    expect(xProduct.get(Tuple("b", "q"))).toEqual(tv(2, "world"));
  });

  it("should handle inner clear on one side with changes on the other", () => {
    const lInitial = IMap<string, IMap<string, Cell<number>>>({
      x: nm({ a: 1, b: 2 }),
    });
    const rInitial = IMap<string, IMap<string, Cell<string>>>({
      x: sm({ p: "hello" }),
    });
    const l = Reactive.create<IMap<string, IMap<string, Cell<number>>>>(
      graph,
      new MapOperations<string, IMap<string, Cell<number>>>(innerNumberMapOps as any),
      leftChanges,
      lInitial,
    );
    const r = Reactive.create<IMap<string, IMap<string, Cell<string>>>>(
      graph,
      new MapOperations<string, IMap<string, Cell<string>>>(innerStringMapOps as any),
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
      command: [{ type: "clear" }, { type: "add", key: "c", value: cn(3) }],
    }]);
    rightChanges.push([{
      type: "update",
      key: "x",
      command: [{ type: "add", key: "q", value: cs("world") }],
    }]);
    graph.step();

    // {c:3} × {p:"hello", q:"world"}
    const xProduct = joined.snapshot.get("x")!;
    expect(xProduct.size).toBe(2);
    expect(xProduct.get(Tuple("c", "p"))).toEqual(tv(3, "hello"));
    expect(xProduct.get(Tuple("c", "q"))).toEqual(tv(3, "world"));
  });

  it("should handle delete-then-add of same inner key simultaneously with right changes", () => {
    const lInitial = IMap<string, IMap<string, Cell<number>>>({
      x: nm({ a: 1 }),
    });
    const rInitial = IMap<string, IMap<string, Cell<string>>>({
      x: sm({ p: "hello" }),
    });
    const l = Reactive.create<IMap<string, IMap<string, Cell<number>>>>(
      graph,
      new MapOperations<string, IMap<string, Cell<number>>>(innerNumberMapOps as any),
      leftChanges,
      lInitial,
    );
    const r = Reactive.create<IMap<string, IMap<string, Cell<string>>>>(
      graph,
      new MapOperations<string, IMap<string, Cell<string>>>(innerStringMapOps as any),
      rightChanges,
      rInitial,
    );

    const joined = joinMap(graph, l, r);
    graph.step();

    expect(joined.snapshot.get("x")!.get(Tuple("a", "p"))).toEqual(tv(1, "hello"));

    // Left: delete "a" then add "a" back with new value (replace)
    // Right: update "p" value
    leftChanges.push([{
      type: "update",
      key: "x",
      command: [
        { type: "delete", key: "a" },
        { type: "add", key: "a", value: cn(5) },
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
    expect(xProduct.get(Tuple("a", "p"))).toEqual(tv(5, "world"));
  });

  it("should handle both sides adding then one side deleting the outer key", () => {
    const joined = joinMap(graph, left, right);
    graph.step();

    // Add matching key on both sides
    leftChanges.push([{ type: "add", key: "x", value: nm({ a: 1 }) }]);
    rightChanges.push([{ type: "add", key: "x", value: sm({ p: "hello" }) }]);
    graph.step();

    expect(joined.snapshot.size).toBe(1);
    expect(joined.snapshot.get("x")!.get(Tuple("a", "p"))).toEqual(tv(1, "hello"));

    // Delete from left
    leftChanges.push([{ type: "delete", key: "x" }]);
    graph.step();

    expect(joined.snapshot.size).toBe(0);

    // Re-add on left with different inner map
    leftChanges.push([{ type: "add", key: "x", value: nm({ b: 2 }) }]);
    graph.step();

    expect(joined.snapshot.size).toBe(1);
    const xProduct = joined.snapshot.get("x")!;
    expect(xProduct.size).toBe(1);
    expect(xProduct.get(Tuple("b", "p"))).toEqual(tv(2, "hello"));
  });
});
