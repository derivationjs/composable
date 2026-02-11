import { describe, it, expect, beforeEach } from "vitest";
import { Graph, inputValue, Input } from "derivation";
import { List, Map as IMap } from "immutable";
import { Reactive } from "../reactive.js";
import { ListOperations, ListCommand } from "../list-operations.js";
import { MapOperations, MapCommand } from "../map-operations.js";
import { PrimitiveOperations } from "../primitive-operations.js";
import { filterList } from "../filter-list.js";
import { groupByList } from "../group-by-list.js";
import { groupByMap } from "../group-by-map.js";
import { decomposeList } from "../decompose-list.js";
import { composeList } from "../compose-list.js";
import { mapMap } from "../map-reactive.js";
import { getKeyMap } from "../get-key-map.js";
import { mapPrimitive } from "../map-primitive.js";

const numberOps = new PrimitiveOperations<number>();

// Helper: creates a reactive boolean predicate (value > threshold)
function greaterThan(
  graph: Graph,
  rx: Reactive<number>,
  threshold: number,
): Reactive<boolean> {
  return mapPrimitive(graph, rx, (x) => x > threshold);
}

// Helper: creates a reactive key function (even/odd)
function evenOddKey(graph: Graph, rx: Reactive<number>): Reactive<string> {
  return mapPrimitive(graph, rx, (n) => (n % 2 === 0 ? "even" : "odd"));
}

// =============================================================================
// filterList: dynamic item predicate toggle bugs
//
// Root cause: filterList creates rx/predRx nodes inside allChanges.accumulate's
// callback. These dynamic nodes get FractionalIndex values AFTER allChanges,
// so on subsequent steps allChanges evaluates BEFORE the dynamic predRx,
// reading stale predRx.snapshot values.
// =============================================================================

describe("filterList - predicate toggle for initial items", () => {
  let graph: Graph;
  let changes: Input<ListCommand<number>[]>;

  beforeEach(() => {
    graph = new Graph();
    changes = inputValue(graph, [] as ListCommand<number>[]);
  });

  it("should handle predicate false→true for initial item", () => {
    const initialList = List([3, 7]);
    const list = Reactive.create<List<number>>(
      graph,
      new ListOperations(numberOps),
      changes,
      initialList,
    );

    const filtered = filterList(graph, list, (rx) => greaterThan(graph, rx, 5));
    graph.step();

    expect(filtered.snapshot.toArray()).toEqual([7]);

    // Update 3 → 10 (crosses threshold, should enter filtered list)
    changes.push([{ type: "update", index: 0, command: 10 }]);
    graph.step();

    expect(filtered.snapshot.toArray()).toEqual([10, 7]);
  });

  it("should handle predicate true→false for initial item", () => {
    const initialList = List([3, 7]);
    const list = Reactive.create<List<number>>(
      graph,
      new ListOperations(numberOps),
      changes,
      initialList,
    );

    const filtered = filterList(graph, list, (rx) => greaterThan(graph, rx, 5));
    graph.step();

    expect(filtered.snapshot.toArray()).toEqual([7]);

    // Update 7 → 2 (drops below threshold, should leave filtered list)
    changes.push([{ type: "update", index: 1, command: 2 }]);
    graph.step();

    expect(filtered.snapshot.toArray()).toEqual([]);
  });
});

describe("filterList - predicate toggle for dynamically inserted items", () => {
  let graph: Graph;
  let changes: Input<ListCommand<number>[]>;
  let list: Reactive<List<number>>;

  beforeEach(() => {
    graph = new Graph();
    changes = inputValue(graph, [] as ListCommand<number>[]);
    list = Reactive.create<List<number>>(
      graph,
      new ListOperations(numberOps),
      changes,
      List<number>(),
    );
  });

  it("should handle predicate false→true for dynamically inserted item", () => {
    const filtered = filterList(graph, list, (rx) => greaterThan(graph, rx, 5));
    graph.step();

    // Insert item below threshold
    changes.push([{ type: "insert", index: 0, value: 3 }]);
    graph.step();
    expect(filtered.snapshot.toArray()).toEqual([]);

    // Update above threshold — should now appear in filtered list
    changes.push([{ type: "update", index: 0, command: 10 }]);
    graph.step();

    // BUG: allChanges reads stale predRx.snapshot (still false) because
    // the dynamic predRx node evaluates AFTER allChanges.accumulate
    expect(filtered.snapshot.toArray()).toEqual([10]);
  });

  it("should handle predicate true→false for dynamically inserted item", () => {
    const filtered = filterList(graph, list, (rx) => greaterThan(graph, rx, 5));
    graph.step();

    // Insert item above threshold
    changes.push([{ type: "insert", index: 0, value: 10 }]);
    graph.step();
    expect(filtered.snapshot.toArray()).toEqual([10]);

    // Update below threshold — should disappear from filtered list
    changes.push([{ type: "update", index: 0, command: 2 }]);
    graph.step();

    // BUG: allChanges reads stale predRx.snapshot (still true).
    // The value updates to 2 (via upd.command) but stays in the list
    // because the predicate toggle is not detected.
    expect(filtered.snapshot.toArray()).toEqual([]);
  });

  it("should handle multiple dynamic items with predicate toggles", () => {
    const filtered = filterList(graph, list, (rx) => greaterThan(graph, rx, 5));
    graph.step();

    // Insert two items: one below, one above threshold
    changes.push([
      { type: "insert", index: 0, value: 3 },
      { type: "insert", index: 1, value: 10 },
    ]);
    graph.step();
    expect(filtered.snapshot.toArray()).toEqual([10]);

    // Toggle both: 3→8 (enters), 10→2 (leaves)
    changes.push([
      { type: "update", index: 0, command: 8 },
      { type: "update", index: 1, command: 2 },
    ]);
    graph.step();

    expect(filtered.snapshot.toArray()).toEqual([8]);
  });
});

// =============================================================================
// groupByList: dynamic item key change bugs
//
// Root cause: same as filterList — keyRx nodes created inside
// allChanges.accumulate have higher indices, so keyRx.snapshot is stale
// when allChanges reads it on the next step.
// =============================================================================

describe("groupByList - key change for dynamically inserted items", () => {
  let graph: Graph;
  let changes: Input<ListCommand<number>[]>;
  let list: Reactive<List<number>>;

  beforeEach(() => {
    graph = new Graph();
    changes = inputValue(graph, [] as ListCommand<number>[]);
    list = Reactive.create<List<number>>(
      graph,
      new ListOperations(numberOps),
      changes,
      List<number>(),
    );
  });

  it("should move dynamically inserted item between groups on key change", () => {
    const grouped = groupByList<number, string>(graph, list, (rx) =>
      evenOddKey(graph, rx),
    );
    graph.step();

    // Insert an even number
    changes.push([{ type: "insert", index: 0, value: 2 }]);
    graph.step();

    expect(grouped.snapshot.get("even")?.toArray()).toEqual([2]);
    expect(grouped.snapshot.has("odd")).toBe(false);

    // Update to odd — should move from "even" to "odd" group
    changes.push([{ type: "update", index: 0, command: 3 }]);
    graph.step();

    // BUG: keyRx.snapshot is stale (still "even"), so the key change
    // is not detected and the item stays in "even" with value 3
    expect(grouped.snapshot.get("odd")?.toArray()).toEqual([3]);
    expect(grouped.snapshot.has("even")).toBe(false);
  });

  it("should create new group when dynamically inserted item changes key", () => {
    const grouped = groupByList<number, string>(graph, list, (rx) =>
      evenOddKey(graph, rx),
    );
    graph.step();

    // Insert two even numbers
    changes.push([
      { type: "insert", index: 0, value: 2 },
      { type: "insert", index: 1, value: 4 },
    ]);
    graph.step();

    expect(grouped.snapshot.get("even")?.toArray()).toEqual([2, 4]);
    expect(grouped.snapshot.has("odd")).toBe(false);

    // Update first to odd — "odd" group should be created
    changes.push([{ type: "update", index: 0, command: 3 }]);
    graph.step();

    expect(grouped.snapshot.get("odd")?.toArray()).toEqual([3]);
    expect(grouped.snapshot.get("even")?.toArray()).toEqual([4]);
  });
});

// =============================================================================
// groupByMap: dynamic entry update and key change bugs
//
// Root cause: groupByMap's accumulate callback reads rx.changes.value and
// keyRx.snapshot for dynamically created entries, but these nodes haven't
// been stepped yet because they have higher FractionalIndex values.
//
// Unlike groupByList (which passes upd.command from the source), groupByMap
// uses rx.changes.value for the inner update command, making value updates
// also affected.
// =============================================================================

describe("groupByMap - updates to dynamically added entries", () => {
  let graph: Graph;
  let changes: Input<MapCommand<string, number>[]>;
  let source: Reactive<IMap<string, number>>;

  beforeEach(() => {
    graph = new Graph();
    changes = inputValue(graph, [] as MapCommand<string, number>[]);
    source = Reactive.create<IMap<string, number>>(
      graph,
      new MapOperations<string, number>(numberOps),
      changes,
      IMap<string, number>(),
    );
  });

  it("should propagate value update for dynamically added entry (same group)", () => {
    const grouped = groupByMap(graph, source, (rx) => evenOddKey(graph, rx));
    graph.step();

    // Add an even entry
    changes.push([{ type: "add", key: "a", value: 2 }]);
    graph.step();

    expect(grouped.snapshot.get("even")!.get("a")).toBe(2);

    // Update to a different even number
    changes.push([{ type: "update", key: "a", command: 4 }]);
    graph.step();

    // BUG: rx.changes.value is stale (empty command), so the inner
    // update applies a no-op and the value stays at 2
    expect(grouped.snapshot.get("even")!.get("a")).toBe(4);
  });

  it("should move dynamically added entry between groups on key change", () => {
    const grouped = groupByMap(graph, source, (rx) => evenOddKey(graph, rx));
    graph.step();

    // Add an even entry
    changes.push([{ type: "add", key: "a", value: 2 }]);
    graph.step();

    expect(grouped.snapshot.get("even")!.get("a")).toBe(2);
    expect(grouped.snapshot.has("odd")).toBe(false);

    // Update to odd — should move between groups
    changes.push([{ type: "update", key: "a", command: 3 }]);
    graph.step();

    // BUG: keyRx.snapshot is stale (still "even"), so the key change
    // is not detected. The entry stays in "even" with a stale value.
    expect(grouped.snapshot.get("odd")!.get("a")).toBe(3);
    expect(grouped.snapshot.has("even")).toBe(false);
  });

  it("should handle multiple dynamically added entries with updates", () => {
    const grouped = groupByMap(graph, source, (rx) => evenOddKey(graph, rx));
    graph.step();

    // Add two entries
    changes.push([
      { type: "add", key: "a", value: 1 },
      { type: "add", key: "b", value: 2 },
    ]);
    graph.step();

    expect(grouped.snapshot.get("odd")!.get("a")).toBe(1);
    expect(grouped.snapshot.get("even")!.get("b")).toBe(2);

    // Update both — a stays odd, b moves to odd
    changes.push([
      { type: "update", key: "a", command: 3 },
      { type: "update", key: "b", command: 5 },
    ]);
    graph.step();

    expect(grouped.snapshot.get("odd")!.get("a")).toBe(3);
    expect(grouped.snapshot.get("odd")!.get("b")).toBe(5);
    expect(grouped.snapshot.has("even")).toBe(false);
  });
});

// =============================================================================
// composeList: insert+update in same batch double-applies for non-primitives
//
// Root cause: composeList reads map.snapshot.get(id) for inserts (which
// already has the update applied), then ALSO processes the map's "update"
// command, applying it a second time. For primitives this is invisible
// (replace semantics), but for lists/maps the command is applied twice.
// =============================================================================

describe("composeList - insert+update same batch with nested values", () => {
  it("should not double-apply update when insert and update happen in same batch", () => {
    const graph = new Graph();
    const innerListOps = new ListOperations<number>(numberOps);
    const outerListOps = new ListOperations<List<number>>(innerListOps);
    const changes = inputValue(graph, [] as ListCommand<List<number>>[]);
    const source = Reactive.create<List<List<number>>>(
      graph,
      outerListOps,
      changes,
      List<List<number>>(),
    );

    const [ids, map] = decomposeList(graph, source);
    const composed = composeList(graph, ids, map);
    graph.step();

    // Insert a list and update it in the same batch
    changes.push([
      { type: "insert", index: 0, value: List([1, 2, 3]) },
      {
        type: "update",
        index: 0,
        command: [{ type: "insert", index: 3, value: 4 }],
      },
    ]);
    graph.step();

    // BUG: composeList inserts the already-updated value [1,2,3,4] from
    // map.snapshot, then ALSO applies the update command [insert 3 4],
    // producing [1,2,3,4,4] instead of [1,2,3,4]
    expect(composed.snapshot.get(0)!.toArray()).toEqual([1, 2, 3, 4]);
  });

  it("should not double-apply update for map values in same batch", () => {
    const graph = new Graph();
    const innerMapOps = new MapOperations<string, number>(numberOps);
    const outerListOps = new ListOperations<IMap<string, number>>(innerMapOps);
    const changes = inputValue(
      graph,
      [] as ListCommand<IMap<string, number>>[],
    );
    const source = Reactive.create<List<IMap<string, number>>>(
      graph,
      outerListOps,
      changes,
      List<IMap<string, number>>(),
    );

    const [ids, map] = decomposeList(graph, source);
    const composed = composeList(graph, ids, map);
    graph.step();

    // Insert a map and add a key to it in the same batch
    changes.push([
      { type: "insert", index: 0, value: IMap({ a: 1 }) },
      {
        type: "update",
        index: 0,
        command: [{ type: "add", key: "b", value: 2 }],
      },
    ]);
    graph.step();

    const result = composed.snapshot.get(0)!;
    // BUG: The insert uses the snapshot {a:1, b:2}, then the update
    // tries to "add" key "b" again, but since "add" just sets the key,
    // for maps this happens to be idempotent. However, the command
    // semantics say "add" should only be used for NEW keys.
    expect(result.get("a")).toBe(1);
    expect(result.get("b")).toBe(2);
    expect(result.size).toBe(2);
  });

  it("should not corrupt values when insert + multiple updates in same batch", () => {
    const graph = new Graph();
    const innerListOps = new ListOperations<number>(numberOps);
    const outerListOps = new ListOperations<List<number>>(innerListOps);
    const changes = inputValue(graph, [] as ListCommand<List<number>>[]);
    const source = Reactive.create<List<List<number>>>(
      graph,
      outerListOps,
      changes,
      List<List<number>>(),
    );

    const [ids, map] = decomposeList(graph, source);
    const composed = composeList(graph, ids, map);
    graph.step();

    // Insert a list, then update it twice in the same batch
    changes.push([
      { type: "insert", index: 0, value: List([10]) },
      {
        type: "update",
        index: 0,
        command: [{ type: "insert", index: 1, value: 20 }],
      },
      {
        type: "update",
        index: 0,
        command: [{ type: "insert", index: 2, value: 30 }],
      },
    ]);
    graph.step();

    // Should be [10, 20, 30]
    // BUG: Double-applied updates produce [10, 20, 30, 20, 30]
    expect(composed.snapshot.get(0)!.toArray()).toEqual([10, 20, 30]);
  });
});

// =============================================================================
// mapMap + getKeyMap: operations proxy uninitialized when map starts empty
//
// Root cause: mapMap creates an operationsProxy for yValueOps with an empty
// object {} as initial target. setTarget is only called inside ensureReactive,
// which only runs when keys exist in the map. When the map starts empty and
// getKeyMap is called on the result, getKeyMap accesses
// source.operations.valueOperations (the uninitialized proxy) and immediately
// calls emptyCommand() on it. Since MapStream evaluates eagerly in its
// constructor, the callback runs immediately and hits the unset proxy target.
// =============================================================================

describe("mapMap + getKeyMap - operations proxy on empty map", () => {
  it("should not crash when getKeyMap is called on an empty mapMap result", () => {
    const graph = new Graph();
    const changes = inputValue(graph, [] as MapCommand<string, number>[]);
    const source = Reactive.create<IMap<string, number>>(
      graph,
      new MapOperations<string, number>(numberOps),
      changes,
      IMap<string, number>(),
    );

    const mapped = mapMap<string, number, number>(graph, source, (rx) => {
      return mapPrimitive(graph, rx, (x) => x * 2);
    });
    graph.step();

    // BUG: This crashes with "baseValueOps.emptyCommand is not a function"
    // because the mapMap operations proxy was never initialized (no keys
    // were ever added to the source map).
    const value = getKeyMap(graph, mapped, "someKey", 0);
    graph.step();

    expect(value.snapshot).toBe(0);
  });

  it("should work when getKeyMap is called on a mapMap result that later gets data", () => {
    const graph = new Graph();
    const changes = inputValue(graph, [] as MapCommand<string, number>[]);
    const source = Reactive.create<IMap<string, number>>(
      graph,
      new MapOperations<string, number>(numberOps),
      changes,
      IMap<string, number>(),
    );

    const mapped = mapMap<string, number, number>(graph, source, (rx) => {
      return mapPrimitive(graph, rx, (x) => x * 2);
    });
    graph.step();

    // BUG: getKeyMap crashes even before data is added
    const value = getKeyMap(graph, mapped, "a", 0);
    graph.step();

    expect(value.snapshot).toBe(0);

    // Now add data — the extracted key should update
    changes.push([{ type: "add", key: "a", value: 5 }]);
    graph.step();

    expect(value.snapshot).toBe(10);
  });
});
