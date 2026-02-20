import { describe, it, expect, beforeEach } from "vitest";
import { Graph, inputValue, Input } from "derivation";
import { List, Map as IMap } from "immutable";
import { Reactive } from "../reactive.js";
import { ListOperations, ListCommand } from "../list-operations.js";
import { MapOperations, MapCommand } from "../map-operations.js";
import { mapList } from "../list-reactive.js";
import { mapMap } from "../map-reactive.js";
import { mapCell } from "../map-cell.js";
import { CellOperations } from "../cell-operations.js";
import { Cell } from "../cell.js";

const stringOps = new CellOperations<string>();
const c = (s: string) => new Cell(s);
const cm = (obj: Record<string, string>) =>
  IMap<string, Cell<string>>(
    Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, c(v)])),
  );
const gv = (
  list: List<IMap<string, Cell<string>>>,
  i: number,
  key: string,
): string | undefined => list.get(i)?.get(key)?.value;

const mapOps = new MapOperations<string, Cell<string>>(stringOps);
const listOps = new ListOperations<IMap<string, Cell<string>>>(mapOps);

describe("List<Map<string, string>> with mapList and mapMap", () => {
  let graph: Graph;
  let changes: Input<ListCommand<IMap<string, Cell<string>>>[]>;
  let list: Reactive<List<IMap<string, Cell<string>>>>;

  beforeEach(() => {
    graph = new Graph();
    changes = inputValue(graph, [] as ListCommand<IMap<string, Cell<string>>>[]);
    list = Reactive.create<List<IMap<string, Cell<string>>>>(
      graph,
      listOps,
      changes,
      List<IMap<string, Cell<string>>>(),
    );
  });

  it("should map over list and nested maps", () => {
    const initialList = List([cm({ name: "alice", role: "admin" }), cm({ name: "bob", role: "user" })]);
    const listWithData = Reactive.create<List<IMap<string, Cell<string>>>>(
      graph,
      listOps,
      changes,
      initialList,
    );

    const mapped = mapList(graph, listWithData, (rxMap) =>
      mapMap<string, Cell<string>, Cell<string>>(graph, rxMap, (rxString) =>
        mapCell(graph, rxString, (s) => s.toUpperCase()),
      ),
    );
    graph.step();

    expect(gv(mapped.snapshot, 0, "name")).toBe("ALICE");
    expect(gv(mapped.snapshot, 0, "role")).toBe("ADMIN");
    expect(gv(mapped.snapshot, 1, "name")).toBe("BOB");
    expect(gv(mapped.snapshot, 1, "role")).toBe("USER");
  });

  it("should handle inserting a new map into the list", () => {
    const listWithData = Reactive.create<List<IMap<string, Cell<string>>>>(
      graph,
      listOps,
      changes,
      List([cm({ name: "alice" })]),
    );

    const mapped = mapList(graph, listWithData, (rxMap) =>
      mapMap<string, Cell<string>, Cell<string>>(graph, rxMap, (rxString) =>
        mapCell(graph, rxString, (s) => s.toUpperCase()),
      ),
    );
    graph.step();

    changes.push([{ type: "insert", index: 1, value: cm({ name: "bob", city: "nyc" }) }]);
    graph.step();

    expect(mapped.snapshot.size).toBe(2);
    expect(gv(mapped.snapshot, 1, "name")).toBe("BOB");
    expect(gv(mapped.snapshot, 1, "city")).toBe("NYC");
  });

  it("should handle updating a value in a nested map", () => {
    const listWithData = Reactive.create<List<IMap<string, Cell<string>>>>(
      graph,
      listOps,
      changes,
      List([cm({ name: "alice", role: "admin" }), cm({ name: "bob", role: "user" })]),
    );

    const mapped = mapList(graph, listWithData, (rxMap) =>
      mapMap<string, Cell<string>, Cell<string>>(graph, rxMap, (rxString) =>
        mapCell(graph, rxString, (s) => s.toUpperCase()),
      ),
    );
    graph.step();

    const mapUpdateCmd: MapCommand<string, Cell<string>>[] = [
      { type: "update", key: "role", command: "moderator" },
    ];
    changes.push([{ type: "update", index: 1, command: mapUpdateCmd }]);
    graph.step();

    expect(gv(mapped.snapshot, 1, "role")).toBe("MODERATOR");
    expect(gv(mapped.snapshot, 1, "name")).toBe("BOB");
    expect(gv(mapped.snapshot, 0, "name")).toBe("ALICE");
  });

  it("should handle adding a new key to a nested map", () => {
    const listWithData = Reactive.create<List<IMap<string, Cell<string>>>>(
      graph,
      listOps,
      changes,
      List([cm({ name: "alice" })]),
    );

    const mapped = mapList(graph, listWithData, (rxMap) =>
      mapMap<string, Cell<string>, Cell<string>>(graph, rxMap, (rxString) =>
        mapCell(graph, rxString, (x) => x.toUpperCase()),
      ),
    );
    graph.step();

    const mapSetCmd: MapCommand<string, Cell<string>>[] = [
      { type: "add", key: "email", value: c("alice@example.com") },
    ];
    changes.push([{ type: "update", index: 0, command: mapSetCmd }]);
    graph.step();

    expect(gv(listWithData.snapshot, 0, "name")).toBe("alice");
    expect(gv(mapped.snapshot, 0, "email")).toBe("ALICE@EXAMPLE.COM");
    expect(gv(mapped.snapshot, 0, "name")).toBe("ALICE");
  });

  it("should handle removing a map from the list", () => {
    const listWithData = Reactive.create<List<IMap<string, Cell<string>>>>(
      graph,
      listOps,
      changes,
      List([cm({ name: "alice" }), cm({ name: "bob" }), cm({ name: "charlie" })]),
    );

    const mapped = mapList(graph, listWithData, (rxMap) =>
      mapMap<string, Cell<string>, Cell<string>>(graph, rxMap, (rxString) =>
        mapCell(graph, rxString, (s) => s.toUpperCase()),
      ),
    );
    graph.step();

    changes.push([{ type: "remove", index: 1 }]);
    graph.step();

    expect(mapped.snapshot.size).toBe(2);
    expect(gv(mapped.snapshot, 0, "name")).toBe("ALICE");
    expect(gv(mapped.snapshot, 1, "name")).toBe("CHARLIE");
  });

  it("should handle deleting a key from a nested map", () => {
    const listWithData = Reactive.create<List<IMap<string, Cell<string>>>>(
      graph,
      listOps,
      changes,
      List([cm({ name: "alice", temp: "data" })]),
    );

    const mapped = mapList(graph, listWithData, (rxMap) =>
      mapMap<string, Cell<string>, Cell<string>>(graph, rxMap, (rxString) =>
        mapCell(graph, rxString, (s) => s.toUpperCase()),
      ),
    );
    graph.step();

    const mapDeleteCmd: MapCommand<string, Cell<string>>[] = [{ type: "delete", key: "temp" }];
    changes.push([{ type: "update", index: 0, command: mapDeleteCmd }]);
    graph.step();

    expect(mapped.snapshot.get(0)?.has("temp")).toBe(false);
    expect(gv(mapped.snapshot, 0, "name")).toBe("ALICE");
  });

  it("should handle complex batch operations", () => {
    const listWithData = Reactive.create<List<IMap<string, Cell<string>>>>(
      graph,
      listOps,
      changes,
      List([cm({ name: "alice", role: "admin" }), cm({ name: "bob", role: "user" })]),
    );

    const mapped = mapList(graph, listWithData, (rxMap) =>
      mapMap<string, Cell<string>, Cell<string>>(graph, rxMap, (rxString) =>
        mapCell(graph, rxString, (s) => s.toUpperCase()),
      ),
    );
    graph.step();

    changes.push([
      { type: "insert", index: 0, value: cm({ name: "zara" }) },
      {
        type: "update",
        index: 2,
        command: [{ type: "update", key: "role", command: "guest" }] as MapCommand<
          string,
          Cell<string>
        >[],
      },
      { type: "remove", index: 1 },
    ]);
    graph.step();

    expect(mapped.snapshot.size).toBe(2);
    expect(gv(mapped.snapshot, 0, "name")).toBe("ZARA");
    expect(gv(mapped.snapshot, 1, "name")).toBe("BOB");
    expect(gv(mapped.snapshot, 1, "role")).toBe("GUEST");
  });

  it("should call mapping functions correct number of times", () => {
    const listWithData = Reactive.create<List<IMap<string, Cell<string>>>>(
      graph,
      listOps,
      changes,
      List([cm({ a: "1", b: "2" })]),
    );

    let listMapCalls = 0;
    let mapMapCalls = 0;

    const mapped = mapList(graph, listWithData, (rxMap) => {
      listMapCalls++;
      return mapMap<string, Cell<string>, Cell<string>>(graph, rxMap, (rxString) => {
        mapMapCalls++;
        return mapCell(graph, rxString, (s) => s.toUpperCase());
      });
    });
    graph.step();

    expect(listMapCalls).toBe(1);
    expect(mapMapCalls).toBe(2);

    const updateCmd: MapCommand<string, Cell<string>>[] = [
      { type: "update", key: "a", command: "updated" },
    ];
    changes.push([{ type: "update", index: 0, command: updateCmd }]);
    graph.step();

    expect(listMapCalls).toBe(1);
    expect(mapMapCalls).toBe(2);
    expect(gv(mapped.snapshot, 0, "a")).toBe("UPDATED");

    const setCmd: MapCommand<string, Cell<string>>[] = [
      { type: "add", key: "c", value: c("3") },
    ];
    changes.push([{ type: "update", index: 0, command: setCmd }]);
    graph.step();

    expect(listMapCalls).toBe(1);
    expect(mapMapCalls).toBe(3);
    expect(gv(mapped.snapshot, 0, "c")).toBe("3");

    changes.push([{ type: "insert", index: 1, value: cm({ x: "10", y: "20" }) }]);
    graph.step();

    expect(listMapCalls).toBe(2);
    expect(mapMapCalls).toBe(5);
  });
});
