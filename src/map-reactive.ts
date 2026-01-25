import { Map as IMap } from "immutable";
import { Graph, ReactiveValue, constantValue } from "derivation";
import { Reactive } from "./reactive.js";
import { Operations } from "./operations.js";
import { MapCommand } from "./map-operations.js";
import { groupBy } from "./group-by.js";

/**
 * Converts a Map of reactive values into a reactive Map.
 *
 * This "sequences" the reactive values - whenever any of the inner
 * reactive values change, the outer reactive map updates.
 */
export function sequenceMap<K, V>(
  graph: Graph,
  map: IMap<K, ReactiveValue<V>>,
): ReactiveValue<IMap<K, V>> {
  return map.reduce(
    (acc: ReactiveValue<IMap<K, V>>, rv: ReactiveValue<V>, key: K) => {
      return acc.zip(rv, (map, v) => map.set(key, v));
    },
    constantValue(graph, IMap()),
  );
}

/**
 * Maps a Reactive<Map<K, X>> to Reactive<Map<K, Y>> by applying a function
 * to each value's reactive wrapper.
 *
 * The function f is called exactly once per key when the key is first set.
 * Updates to existing values flow through the reactive chain without
 * calling f again.
 */
export function mapMap<K, X, Y>(
  graph: Graph,
  valueOperations: Operations<X>,
  map: Reactive<IMap<K, X>>,
  f: (x: Reactive<X>, key: K) => Reactive<Y>,
): Reactive<IMap<K, Y>> {
  // Group updates by key
  const groupedUpdates = groupBy(
    map.changes.map((cmds) => {
      const commands = cmds as MapCommand<K, X>[];
      return commands
        .filter((cmd): cmd is MapCommand<K, X> & { type: "update" } => cmd.type === "update")
        .map((cmd) => ({ key: cmd.key, command: cmd.command }));
    }),
    (u) => u.key,
    (u) => u.command,
  );

  // Map to store Reactive<Y> for each key
  const yReactives = new Map<K, Reactive<Y>>();

  // Helper to get or create Reactive<Y> for a key
  function getOrCreateY(key: K, initialValue: X): Reactive<Y> {
    let ry = yReactives.get(key);
    if (!ry) {
      const itemChanges = groupedUpdates.select(key).map((cmds) =>
        cmds.reduce(
          (acc, cmd) => valueOperations.mergeCommands(acc, cmd),
          valueOperations.emptyCommand(),
        ),
      );
      const rx = Reactive.create(graph, valueOperations, itemChanges, initialValue);
      ry = f(rx, key);
      yReactives.set(key, ry);
    }
    return ry;
  }

  // Create Reactive<Y> for all initial keys
  for (const [key, value] of map.snapshot) {
    getOrCreateY(key, value);
  }

  // Transform map changes to Y changes
  const yChanges: ReactiveValue<MapCommand<K, Y>[]> = map.changes.map((rawCmds) => {
    const cmds = rawCmds as MapCommand<K, X>[];
    const yCmds: MapCommand<K, Y>[] = [];

    for (const cmd of cmds) {
      switch (cmd.type) {
        case "set": {
          const ry = getOrCreateY(cmd.key, cmd.value);
          yCmds.push({ type: "set", key: cmd.key, value: ry.snapshot });
          break;
        }
        case "update": {
          const ry = yReactives.get(cmd.key);
          if (ry) {
            yCmds.push({ type: "update", key: cmd.key, command: ry.changes.value });
          }
          break;
        }
        case "delete": {
          yCmds.push({ type: "delete", key: cmd.key });
          break;
        }
        case "clear": {
          yCmds.push({ type: "clear" });
          break;
        }
      }
    }

    return yCmds;
  });

  // Build initial Y map - use map.snapshot to preserve key type
  const initialYMap: IMap<K, Y> = map.snapshot.map((_, key) =>
    yReactives.get(key)!.snapshot
  );

  // Operations for Map<K, Y> - uses snapshots for updates
  const yMapOps: Operations<IMap<K, Y>> = {
    emptyCommand: () => [],
    isEmpty: (cmd) => (cmd as MapCommand<K, Y>[]).length === 0,
    mergeCommands: (a, b) => [...(a as MapCommand<K, Y>[]), ...(b as MapCommand<K, Y>[])],
    apply: (state, cmd) => {
      const commands = cmd as MapCommand<K, Y>[];
      return commands.reduce((s, c) => {
        switch (c.type) {
          case "set":
            return s.set(c.key, c.value);
          case "update": {
            const ry = yReactives.get(c.key);
            return ry ? s.set(c.key, ry.snapshot) : s;
          }
          case "delete":
            return s.delete(c.key);
          case "clear":
            return s.clear();
        }
      }, state);
    },
  };

  return Reactive.create(graph, yMapOps, yChanges, initialYMap);
}
