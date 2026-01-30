import { Map as IMap } from "immutable";
import { Graph, ReactiveValue, constantValue } from "derivation";
import { Reactive } from "./reactive.js";
import { Operations, asBase, Changes } from "./operations.js";
import { MapCommand, MapOperations } from "./map-operations.js";
import { forwardingProxy } from "./forwarding-proxy.js";

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
  map: Reactive<IMap<K, X>>,
  f: (x: Reactive<X>, key: K) => Reactive<Y>,
): Reactive<IMap<K, Y>> {
  const valueOperations = map.operations.valueOperations;
  const valueOpsBase = asBase(valueOperations);

  const updateCommandForKey = (
    cmds: MapCommand<K, X>[],
    prevHasKey: boolean,
    key: K,
  ): Changes<X> => {
    let present = prevHasKey;
    let merged = valueOpsBase.emptyCommand();

    for (const cmd of cmds) {
      switch (cmd.type) {
        case "add": {
          if (cmd.key === key) {
            present = true;
            merged = valueOpsBase.emptyCommand();
          }
          break;
        }
        case "delete": {
          if (cmd.key === key) {
            present = false;
            merged = valueOpsBase.emptyCommand();
          }
          break;
        }
        case "clear": {
          present = false;
          merged = valueOpsBase.emptyCommand();
          break;
        }
        case "update": {
          if (cmd.key === key && present) {
            merged = valueOpsBase.mergeCommands(merged, cmd.command);
          }
          break;
        }
      }
    }

    return present ? merged : valueOpsBase.emptyCommand();
  };

  // Create a forwarding proxy for Y operations - we'll set the real target lazily from first Y reactive
  const { proxy: yValueOpsProxy, setTarget: setYValueOps } = forwardingProxy(
    {} as Operations<Y>,
  );
  const yMapOps = new MapOperations<K, Y>(yValueOpsProxy);

  function ensureReactive(
    reactives: IMap<K, Reactive<Y>>,
    key: K,
    initialValue: X,
  ): { reactives: IMap<K, Reactive<Y>>; reactive: Reactive<Y> } {
    const existing = reactives.get(key);
    if (existing) {
      return { reactives, reactive: existing };
    }

    const itemChanges = map.changes.zip(
      map.previousMaterialized,
      (cmds, prevMap) => updateCommandForKey(cmds, prevMap.has(key), key),
    );
    const rx = Reactive.create(
      graph,
      valueOperations,
      itemChanges,
      initialValue,
    );
    const reactive = f(rx, key);
    setYValueOps(reactive.operations);
    return { reactives: reactives.set(key, reactive), reactive };
  }

  const initialReactives = map.snapshot.reduce<IMap<K, Reactive<Y>>>(
    (cache, value, key) => ensureReactive(cache, key, value).reactives,
    IMap<K, Reactive<Y>>(),
  );

  // Track the Reactive<Y> instances that correspond to each key. This runs
  // before we emit commands so the reactive chains for dynamically added keys
  // are created (and thus stepped) before we try to read their changes.
  const reactivesState: ReactiveValue<IMap<K, Reactive<Y>>> =
    map.changes.accumulate(initialReactives, (reactives, cmds) => {
      return cmds.reduce<IMap<K, Reactive<Y>>>((current, cmd) => {
        switch (cmd.type) {
          case "add": {
            return ensureReactive(current, cmd.key, cmd.value).reactives;
          }
          case "delete": {
            return current.delete(cmd.key);
          }
          case "clear": {
            return IMap<K, Reactive<Y>>();
          }
          default:
            return current;
        }
      }, reactives);
    });

  const yChanges: ReactiveValue<MapCommand<K, Y>[]> = map.changes.zip3(
    reactivesState,
    map.previousMaterialized,
    map.materialized,
    (cmds, reactives, prevMap, nextMap) => {
      const yCmds: MapCommand<K, Y>[] = [];

      let effectiveCmds = cmds;
      let startMap = prevMap;
      let lastClearIndex = -1;
      for (let i = 0; i < cmds.length; i++) {
        if (cmds[i].type === "clear") {
          lastClearIndex = i;
        }
      }

      if (lastClearIndex !== -1) {
        yCmds.push({ type: "clear" });
        effectiveCmds = cmds.slice(lastClearIndex + 1);
        startMap = IMap<K, X>();
      }

      const keyOrder: K[] = [];
      const summaries = new Map<
        K,
        { hasAdd: boolean; hasDelete: boolean; hasUpdate: boolean }
      >();

      for (const cmd of effectiveCmds) {
        if (cmd.type === "add" || cmd.type === "update" || cmd.type === "delete") {
          const key = cmd.key;
          let summary = summaries.get(key);
          if (!summary) {
            summary = { hasAdd: false, hasDelete: false, hasUpdate: false };
            summaries.set(key, summary);
            keyOrder.push(key);
          }
          if (cmd.type === "add") {
            summary.hasAdd = true;
          } else if (cmd.type === "delete") {
            summary.hasDelete = true;
          } else {
            summary.hasUpdate = true;
          }
        }
      }

      for (const key of keyOrder) {
        const summary = summaries.get(key)!;
        const startHasKey = startMap.has(key);
        const endHasKey = nextMap.has(key);

        if (!endHasKey) {
          yCmds.push({ type: "delete", key });
          continue;
        }

        if (summary.hasDelete) {
          yCmds.push({ type: "delete", key });
          const reactive = reactives.get(key);
          if (reactive) {
            yCmds.push({ type: "add", key, value: reactive.snapshot });
          }
          continue;
        }

        if (!startHasKey || summary.hasAdd) {
          const reactive = reactives.get(key);
          if (reactive) {
            yCmds.push({ type: "add", key, value: reactive.snapshot });
          }
          continue;
        }

        if (summary.hasUpdate) {
          const reactive = reactives.get(key);
          if (reactive) {
            yCmds.push({
              type: "update",
              key,
              command: reactive.changes.value,
            });
          }
        }
      }

      return yCmds;
    },
  );

  // Build initial Y map - use map.snapshot to preserve key type
  const initialYMap: IMap<K, Y> = map.snapshot.map(
    (_, key) => initialReactives.get(key)!.snapshot,
  );

  return Reactive.create<IMap<K, Y>>(graph, yMapOps, yChanges, initialYMap);
}
