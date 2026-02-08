import { describe, it, expect, beforeEach } from "vitest";
import { Graph, inputValue, Input } from "derivation";
import { List, Map as IMap } from "immutable";
import { Reactive } from "../reactive.js";
import { ListOperations, ListCommand } from "../list-operations.js";
import { MapOperations, MapCommand } from "../map-operations.js";
import { mapList } from "../list-reactive.js";
import { mapMap } from "../map-reactive.js";
import { PrimitiveOperations } from "../primitive-operations.js";

// Simple operations for string values
const stringOps = new PrimitiveOperations<string>();

const mapOps = new MapOperations<string, string>(stringOps);
const listOps = new ListOperations(mapOps);

describe("List<Map<string, string>> with mapList and mapMap", () => {
  let graph: Graph;
  let changes: Input<ListCommand<IMap<string, string>>[]>;
  let list: Reactive<List<IMap<string, string>>>;

  beforeEach(() => {
    graph = new Graph();
    changes = inputValue(graph, [] as ListCommand<IMap<string, string>>[]);
    list = Reactive.create<List<IMap<string, string>>>(
      graph,
      listOps,
      changes,
      List<IMap<string, string>>(),
    );
  });

  it("should map over list and nested maps", () => {
    const initialList: List<IMap<string, string>> = List([
      IMap({ name: "alice", role: "admin" }),
      IMap({ name: "bob", role: "user" }),
    ]);
    const listWithData = Reactive.create<List<IMap<string, string>>>(
      graph,
      listOps,
      changes,
      initialList,
    );

    // Map over the list, then map over each map's values to uppercase them
    const mapped = mapList(graph, listWithData, (rxMap) => {
      return mapMap<string, string, string>(graph, rxMap, (rxString) => {
        const upper = rxString.materialized.map((s) => s.toUpperCase());
        const upperChanges = rxString.changes.map((cmd) =>
          cmd !== null ? (cmd as string).toUpperCase() : null,
        );
        return Reactive.create<string>(
          graph,
          stringOps,
          upperChanges,
          upper.value,
        );
      });
    });
    graph.step();

    expect(mapped.snapshot.get(0)?.get("name")).toBe("ALICE");
    expect(mapped.snapshot.get(0)?.get("role")).toBe("ADMIN");
    expect(mapped.snapshot.get(1)?.get("name")).toBe("BOB");
    expect(mapped.snapshot.get(1)?.get("role")).toBe("USER");
  });

  it("should handle inserting a new map into the list", () => {
    const initialList: List<IMap<string, string>> = List([
      IMap({ name: "alice" }),
    ]);
    const listWithData = Reactive.create<List<IMap<string, string>>>(
      graph,
      listOps,
      changes,
      initialList,
    );

    const mapped = mapList(graph, listWithData, (rxMap) => {
      return mapMap<string, string, string>(graph, rxMap, (rxString) => {
        const upper = rxString.materialized.map((s) => s.toUpperCase());
        const upperChanges = rxString.changes.map((cmd) =>
          cmd !== null ? (cmd as string).toUpperCase() : null,
        );
        return Reactive.create<string>(
          graph,
          stringOps,
          upperChanges,
          upper.value,
        );
      });
    });
    graph.step();

    expect(mapped.snapshot.size).toBe(1);

    // Insert a new map
    changes.push([
      { type: "insert", index: 1, value: IMap({ name: "bob", city: "nyc" }) },
    ]);
    graph.step();

    expect(mapped.snapshot.size).toBe(2);
    expect(mapped.snapshot.get(1)?.get("name")).toBe("BOB");
    expect(mapped.snapshot.get(1)?.get("city")).toBe("NYC");
  });

  it("should handle updating a value in a nested map", () => {
    const initialList: List<IMap<string, string>> = List([
      IMap({ name: "alice", role: "admin" }),
      IMap({ name: "bob", role: "user" }),
    ]);
    const listWithData = Reactive.create<List<IMap<string, string>>>(
      graph,
      listOps,
      changes,
      initialList,
    );

    const mapped = mapList(graph, listWithData, (rxMap) => {
      return mapMap<string, string, string>(graph, rxMap, (rxString) => {
        const upper = rxString.materialized.map((s) => s.toUpperCase());
        const upperChanges = rxString.changes.map((cmd) =>
          cmd !== null ? (cmd as string).toUpperCase() : null,
        );
        return Reactive.create<string>(
          graph,
          stringOps,
          upperChanges,
          upper.value,
        );
      });
    });
    graph.step();

    // Update bob's role via nested update command
    // List update -> Map update -> string command
    const mapUpdateCmd: MapCommand<string, string>[] = [
      { type: "update", key: "role", command: "moderator" },
    ];
    changes.push([{ type: "update", index: 1, command: mapUpdateCmd }]);
    graph.step();

    expect(mapped.snapshot.get(1)?.get("role")).toBe("MODERATOR");
    // Other values unchanged
    expect(mapped.snapshot.get(1)?.get("name")).toBe("BOB");
    expect(mapped.snapshot.get(0)?.get("name")).toBe("ALICE");
  });

  it.skip("should handle adding a new key to a nested map", () => {
    const initialList: List<IMap<string, string>> = List([
      IMap({ name: "alice" }),
    ]);
    const listWithData = Reactive.create<List<IMap<string, string>>>(
      graph,
      listOps,
      changes,
      initialList,
    );

    const mapped = mapList(graph, listWithData, (rxMap) => {
      return mapMap<string, string, string>(graph, rxMap, (rxString) => {
        const upper = rxString.materialized.map((s) => s.toUpperCase());
        const upperChanges = rxString.changes.map((cmd) =>
          cmd !== null ? (cmd as string).toUpperCase() : null,
        );
        return Reactive.create<string>(
          graph,
          stringOps,
          upperChanges,
          upper.value,
        );
      });
    });
    graph.step();

    expect(mapped.snapshot.get(0)?.has("email")).toBe(false);

    // Add a new key to the map at index 0
    const mapSetCmd: MapCommand<string, string>[] = [
      { type: "add", key: "email", value: "alice@example.com" },
    ];
    changes.push([{ type: "update", index: 0, command: mapSetCmd }]);
    graph.step();

    expect(mapped.snapshot.get(0)?.get("email")).toBe("ALICE@EXAMPLE.COM");
    expect(mapped.snapshot.get(0)?.get("name")).toBe("ALICE");
  });

  it("should handle removing a map from the list", () => {
    const initialList: List<IMap<string, string>> = List([
      IMap({ name: "alice" }),
      IMap({ name: "bob" }),
      IMap({ name: "charlie" }),
    ]);
    const listWithData = Reactive.create<List<IMap<string, string>>>(
      graph,
      listOps,
      changes,
      initialList,
    );

    const mapped = mapList(graph, listWithData, (rxMap) => {
      return mapMap<string, string, string>(graph, rxMap, (rxString) => {
        const upper = rxString.materialized.map((s) => s.toUpperCase());
        const upperChanges = rxString.changes.map((cmd) =>
          cmd !== null ? (cmd as string).toUpperCase() : null,
        );
        return Reactive.create<string>(
          graph,
          stringOps,
          upperChanges,
          upper.value,
        );
      });
    });
    graph.step();

    expect(mapped.snapshot.size).toBe(3);

    // Remove bob (index 1)
    changes.push([{ type: "remove", index: 1 }]);
    graph.step();

    expect(mapped.snapshot.size).toBe(2);
    expect(mapped.snapshot.get(0)?.get("name")).toBe("ALICE");
    expect(mapped.snapshot.get(1)?.get("name")).toBe("CHARLIE");
  });

  it.skip("should handle deleting a key from a nested map", () => {
    const initialList: List<IMap<string, string>> = List([
      IMap({ name: "alice", temp: "data" }),
    ]);
    const listWithData = Reactive.create<List<IMap<string, string>>>(
      graph,
      listOps,
      changes,
      initialList,
    );

    const mapped = mapList(graph, listWithData, (rxMap) => {
      return mapMap<string, string, string>(graph, rxMap, (rxString) => {
        const upper = rxString.materialized.map((s) => s.toUpperCase());
        const upperChanges = rxString.changes.map((cmd) =>
          cmd !== null ? (cmd as string).toUpperCase() : null,
        );
        return Reactive.create<string>(
          graph,
          stringOps,
          upperChanges,
          upper.value,
        );
      });
    });
    graph.step();

    expect(mapped.snapshot.get(0)?.has("temp")).toBe(true);

    // Delete the "temp" key
    const mapDeleteCmd: MapCommand<string, string>[] = [
      { type: "delete", key: "temp" },
    ];
    changes.push([{ type: "update", index: 0, command: mapDeleteCmd }]);
    graph.step();

    expect(mapped.snapshot.get(0)?.has("temp")).toBe(false);
    expect(mapped.snapshot.get(0)?.get("name")).toBe("ALICE");
  });

  it("should handle complex batch operations", () => {
    const initialList: List<IMap<string, string>> = List([
      IMap({ name: "alice", role: "admin" }),
      IMap({ name: "bob", role: "user" }),
    ]);
    const listWithData = Reactive.create<List<IMap<string, string>>>(
      graph,
      listOps,
      changes,
      initialList,
    );

    const mapped = mapList(graph, listWithData, (rxMap) => {
      return mapMap<string, string, string>(graph, rxMap, (rxString) => {
        const upper = rxString.materialized.map((s) => s.toUpperCase());
        const upperChanges = rxString.changes.map((cmd) =>
          cmd !== null ? (cmd as string).toUpperCase() : null,
        );
        return Reactive.create<string>(
          graph,
          stringOps,
          upperChanges,
          upper.value,
        );
      });
    });
    graph.step();

    // Batch: insert new map, update existing map, remove a map
    changes.push([
      { type: "insert", index: 0, value: IMap({ name: "zara" }) },
      {
        type: "update",
        index: 2,
        command: [
          { type: "update", key: "role", command: "guest" },
        ] as MapCommand<string, string>[],
      },
      { type: "remove", index: 1 },
    ]);
    graph.step();

    // After operations:
    // - Insert zara at 0: [zara, alice, bob]
    // - Update index 2 (bob): [zara, alice, bob(role=guest)]
    // - Remove index 1 (alice): [zara, bob(role=guest)]
    expect(mapped.snapshot.size).toBe(2);
    expect(mapped.snapshot.get(0)?.get("name")).toBe("ZARA");
    expect(mapped.snapshot.get(1)?.get("name")).toBe("BOB");
    expect(mapped.snapshot.get(1)?.get("role")).toBe("GUEST");
  });

  it.skip("should call mapping functions correct number of times", () => {
    const initialList: List<IMap<string, string>> = List([
      IMap({ a: "1", b: "2" }),
    ]);
    const listWithData = Reactive.create<List<IMap<string, string>>>(
      graph,
      listOps,
      changes,
      initialList,
    );

    let listMapCalls = 0;
    let mapMapCalls = 0;

    const mapped = mapList(graph, listWithData, (rxMap) => {
      listMapCalls++;
      return mapMap<string, string, string>(graph, rxMap, (rxString) => {
        mapMapCalls++;
        const upper = rxString.materialized.map((s) => s.toUpperCase());
        const upperChanges = rxString.changes.map((cmd) =>
          cmd !== null ? (cmd as string).toUpperCase() : null,
        );
        return Reactive.create<string>(
          graph,
          stringOps,
          upperChanges,
          upper.value,
        );
      });
    });
    graph.step();

    // 1 list item, 2 map entries
    expect(listMapCalls).toBe(1);
    expect(mapMapCalls).toBe(2);

    // Update a value - should not call any mapping functions
    const updateCmd: MapCommand<string, string>[] = [
      { type: "update", key: "a", command: "updated" },
    ];
    changes.push([{ type: "update", index: 0, command: updateCmd }]);
    graph.step();

    expect(listMapCalls).toBe(1);
    expect(mapMapCalls).toBe(2);
    expect(mapped.snapshot.get(0)?.get("a")).toBe("UPDATED");

    // Add a new key to the map - should call mapMap once
    const setCmd: MapCommand<string, string>[] = [
      { type: "add", key: "c", value: "3" },
    ];
    changes.push([{ type: "update", index: 0, command: setCmd }]);
    graph.step();

    expect(listMapCalls).toBe(1);
    expect(mapMapCalls).toBe(3);
    expect(mapped.snapshot.get(0)?.get("c")).toBe("3");

    // Insert a new list item - should call listMap once, mapMap for each entry
    changes.push([
      { type: "insert", index: 1, value: IMap({ x: "10", y: "20" }) },
    ]);
    graph.step();

    expect(listMapCalls).toBe(2);
    expect(mapMapCalls).toBe(5); // 3 + 2 new entries
  });
});
