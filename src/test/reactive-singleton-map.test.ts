import { describe, it, expect, beforeEach } from "vitest";
import { Graph, inputValue, Input } from "derivation";
import { Map as IMap } from "immutable";
import { Reactive } from "../reactive.js";
import { Cell } from "../cell.js";
import { CellOperations } from "../cell-operations.js";
import { reactiveSingletonMap } from "../singleton-map.js";
import { MapCommand } from "../map-operations.js";

const stringOps = new CellOperations<string>();
const numberOps = new CellOperations<number>();

const v = (map: IMap<string, Cell<number>>, key: string) => map.get(key)?.value;

describe("reactiveSingletonMap", () => {
  let graph: Graph;
  let keyChanges: Input<string | null>;
  let valueChanges: Input<number | null>;
  let key: Reactive<Cell<string>>;
  let value: Reactive<Cell<number>>;
  let map: Reactive<IMap<string, Cell<number>>>;

  beforeEach(() => {
    graph = new Graph();
    keyChanges = inputValue(graph, null as string | null);
    valueChanges = inputValue(graph, null as number | null);

    key = Reactive.create<Cell<string>>(graph, stringOps, keyChanges, new Cell("a"));
    value = Reactive.create<Cell<number>>(graph, numberOps, valueChanges, new Cell(1));

    map = reactiveSingletonMap(graph, key, value);
  });

  it("creates an initial singleton map", () => {
    graph.step();

    expect(map.snapshot.size).toBe(1);
    expect(v(map.snapshot, "a")).toBe(1);
  });

  it("emits update when value changes and key is stable", () => {
    graph.step();

    valueChanges.push(7);
    graph.step();

    expect(v(map.snapshot, "a")).toBe(7);
    expect(map.changes.value).toEqual([
      { type: "update", key: "a", command: 7 } as MapCommand<string, Cell<number>>,
    ]);
  });

  it("moves the singleton entry when key changes", () => {
    graph.step();

    keyChanges.push("b");
    graph.step();

    expect(map.snapshot.has("a")).toBe(false);
    expect(v(map.snapshot, "b")).toBe(1);

    const cmds = map.changes.value;
    expect(cmds?.length).toBe(2);
    expect(cmds?.[0]).toEqual({ type: "delete", key: "a" });
    expect(cmds?.[1]?.type).toBe("add");
    if (cmds?.[1]?.type === "add") {
      expect(cmds[1].key).toBe("b");
      expect(cmds[1].value.value).toBe(1);
    }
  });

  it("uses delete+add when key and value both change in the same step", () => {
    graph.step();

    keyChanges.push("b");
    valueChanges.push(9);
    graph.step();

    expect(map.snapshot.has("a")).toBe(false);
    expect(v(map.snapshot, "b")).toBe(9);

    const cmds = map.changes.value;
    expect(cmds?.length).toBe(2);
    expect(cmds?.[0]).toEqual({ type: "delete", key: "a" });
    expect(cmds?.[1]?.type).toBe("add");
    if (cmds?.[1]?.type === "add") {
      expect(cmds[1].key).toBe("b");
      expect(cmds[1].value.value).toBe(9);
    }
  });
});
