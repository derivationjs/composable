import { Map as IMap } from "immutable";
import { Graph, ReactiveValue, constantValue } from "derivation";
import { Reactive } from "./reactive.js";
import { Operations, asBase, Changes } from "./operations.js";
import { MapCommand, MapOperations } from "./map-operations.js";
import { operationsProxy } from "./operations-proxy.js";
import { groupBy } from "./group-by.js";
import { joinReactive } from "./join-reactive.js";
import { TwoThreeTree, Monoid } from "./two-three-tree.js";
import { unsafeMergeMap, emptyReactiveMap } from "./unsafe-merge-map.js";
import { singletonMap } from "./singleton-map.js";

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

function takeRightWhile<X>(
  array: X[],
  predicate: (x: X) => boolean,
): [X | null, X[]] {
  const result = [];

  for (let i = array.length - 1; i >= 0; i--) {
    if (!predicate(array[i])) {
      return [array[i], result.reverse()];
    }
    result.push(array[i]);
  }

  return [null, result.reverse()];
}

function decomposeChanges<K, V>(
  changes: ReactiveValue<MapCommand<K, V>[]>,
): [ReactiveValue<boolean>, ReactiveValue<MapCommand<K, V>[]>] {
  let result = changes.map((changes) =>
    takeRightWhile(changes, (change) => change.type !== "clear"),
  );
  return [result.map((x) => x[0] !== null), result.map((x) => x[1])];
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
  const yValueOps = operationsProxy({} as Operations<Y>);
  const yMapOps = new MapOperations<K, Y>(yValueOps);

  const [cleared, lastChanges] = decomposeChanges(
    map.changes.map((changes) => changes ?? []),
  );
  const newChanges = lastChanges as ReactiveValue<
    Exclude<MapCommand<K, X>, { type: "clear" }>[]
  >;

  type Add = Extract<MapCommand<K, X>, { type: "add" }>;
  type Delete = Extract<MapCommand<K, X>, { type: "delete" }>;
  type Update = Extract<MapCommand<K, X>, { type: "update" }>;
  const keyState = newChanges.map((cmds) => {
    let grouped = IMap<K, MapCommand<K, X>[]>();
    for (const cmd of cmds) {
      const existing = grouped.get(cmd.key);
      if (existing) {
        grouped = grouped.set(cmd.key, [...existing, cmd]);
      } else {
        grouped = grouped.set(cmd.key, [cmd]);
      }
    }

    let result = IMap<K, [Add | Delete | null, Changes<X>]>();
    for (const [key, keyCmds] of grouped) {
      const [structural, updates] = takeRightWhile(
        keyCmds,
        (c) => c.type === "update",
      );
      const merged = (updates as Update[]).reduce(
        (acc: Changes<X>, u) => valueOpsBase.mergeCommands(acc, u.command),
        null as Changes<X>,
      );
      result = result.set(key, [structural as Add | Delete | null, merged]);
    }
    return result;
  });

  const groupedChanges = groupBy(
    keyState.map((state) =>
      [...state.entries()].map(([key, [structural, changes]]) => ({
        key,
        structural,
        changes,
      })),
    ),
    (entry) => entry.key,
    (entry) => ({ structural: entry.structural, changes: entry.changes }),
  );

  const createReactive = (key: K, initialValue: X): Reactive<IMap<K, Y>> => {
    const itemChanges = groupedChanges.select(key).map((entries) => {
      if (entries.length === 0) return null as Changes<X>;
      const { structural, changes } = entries[0];
      if (structural !== null && structural.type === "add") {
        const replace = valueOpsBase.replaceCommand(structural.value);
        return valueOpsBase.mergeCommands(replace, changes);
      }
      return changes;
    });
    const rx = Reactive.create(
      graph,
      valueOperations,
      itemChanges,
      initialValue,
    );
    const ry = f(rx, key);
    yValueOps.setTarget(ry.operations);
    return singletonMap(graph, key, ry);
  };

  // TODO: Order reactives by the key hashcode given by hash from immutable.
  const mergeMonoid: Monoid<Reactive<IMap<K, Y>>> = {
    empty: emptyReactiveMap(graph, yMapOps),
    combine: (a, b) => unsafeMergeMap(graph, a, b, yMapOps),
  };

  const tree = new TwoThreeTree<K, Reactive<IMap<K, Y>>, Reactive<IMap<K, Y>>>(
    mergeMonoid,
    (v) => v,
  );

  for (const [key, value] of map.snapshot.entries()) {
    tree.insert(key, createReactive(key, value), () => false);
  }

  const treeState = cleared
    .zip(keyState, (cleared, keys) => [cleared, keys] as const)
    .accumulate([tree], ([tree], [cleared, keys]) => {
      if (cleared) {
        for (const { id } of [...tree]) {
          tree.remove(id);
        }
      }

      for (const [key, [structural, changes]] of keys) {
        if (structural !== null && structural.type === "delete") {
          tree.remove(key);
        } else if (structural !== null && structural.type === "add") {
          tree.remove(key);
          const newReactive = createReactive(key, structural.value);
          tree.insert(key, newReactive, () => false);
        }
      }

      return [tree];
    })
    .map(([tree]) => tree.summary);

  return joinReactive(treeState);
}
