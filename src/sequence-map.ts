import { Map as IMap, hash } from "immutable";
import { Graph, ReactiveValue } from "derivation";
import { Reactive } from "./reactive.js";
import { Operations } from "./operations.js";
import { MapCommand, MapOperations } from "./map-operations.js";
import { operationsProxy } from "./operations-proxy.js";
import { TwoThreeTree, Monoid } from "./two-three-tree.js";
import { unsafeMergeMap, emptyReactiveMap } from "./unsafe-merge-map.js";
import { singletonMap } from "./singleton-map.js";

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

/**
 * Sequences a Reactive<Map<K, Reactive<V>>> into a Reactive<Map<K, V>>.
 *
 * As keys are added/removed from the outer map, their inner Reactive<V>
 * values are subscribed/unsubscribed. Value changes from inner reactives
 * flow through automatically.
 */
export function sequenceMap<K, V>(
  graph: Graph,
  map: Reactive<IMap<K, Reactive<V>>>,
): Reactive<IMap<K, V>> {
  type TreeValue = {
    reactiveMap: Reactive<IMap<K, V>>;
    keyHash: number;
  };

  type TreeSummary = {
    merged: Reactive<IMap<K, V>>;
    maxKey: number;
  };

  const yValueOps = operationsProxy({} as Operations<V>);
  const yMapOps = new MapOperations<K, V>(yValueOps);

  // Decompose changes: handle clear by splitting into [wasCleared, postClearChanges]
  const decomposed = map.changes
    .map((changes) => changes ?? [])
    .map((changes) =>
      takeRightWhile(changes, (change) => change.type !== "clear"),
    );
  const cleared = decomposed.map((x) => x[0] !== null);
  const lastChanges = decomposed.map((x) => x[1]) as ReactiveValue<
    Exclude<MapCommand<K, Reactive<V>>, { type: "clear" }>[]
  >;

  // Extract structural commands (add/delete/update) per key, last one wins
  type Add = Extract<MapCommand<K, Reactive<V>>, { type: "add" }>;
  type Delete = Extract<MapCommand<K, Reactive<V>>, { type: "delete" }>;
  type Update = Extract<MapCommand<K, Reactive<V>>, { type: "update" }>;

  const keyState = lastChanges.map((cmds) => {
    let grouped = IMap<K, (Add | Delete | Update)[]>();
    for (const cmd of cmds) {
      if (cmd.type === "add" || cmd.type === "delete" || cmd.type === "update") {
        const existing = grouped.get(cmd.key);
        if (existing) {
          grouped = grouped.set(cmd.key, [...existing, cmd]);
        } else {
          grouped = grouped.set(cmd.key, [cmd]);
        }
      }
    }

    let result = IMap<K, { structural: Add | Delete | null; update: Update | null }>();
    for (const [key, keyCmds] of grouped) {
      const [structural, updates] = takeRightWhile(
        keyCmds,
        (c) => c.type === "update",
      );
      const trailingUpdates = updates as Update[];
      const update =
        trailingUpdates.length > 0
          ? trailingUpdates[trailingUpdates.length - 1]
          : null;

      result = result.set(key, {
        structural: structural as Add | Delete | null,
        update,
      });
    }

    return result;
  });

  const wrapKey = (key: K, rx: Reactive<V>): TreeValue => {
    yValueOps.setTarget(rx.operations);
    return {
      reactiveMap: singletonMap(graph, key, rx),
      keyHash: hash(key),
    };
  };

  const mergeMonoid: Monoid<TreeSummary> = {
    empty: {
      merged: emptyReactiveMap(graph, yMapOps),
      maxKey: Number.NEGATIVE_INFINITY,
    },
    combine: (a, b) => ({
      merged: unsafeMergeMap(graph, a.merged, b.merged, yMapOps),
      maxKey: Math.max(a.maxKey, b.maxKey),
    }),
  };

  const tree = new TwoThreeTree<K, TreeValue, TreeSummary>(
    mergeMonoid,
    (v) => ({
      merged: v.reactiveMap,
      maxKey: v.keyHash,
    }),
  );

  const insertByHash = (key: K, rx: Reactive<V>): void => {
    const wrapped = wrapKey(key, rx);
    tree.insert(key, wrapped, (prefix) => prefix.maxKey >= wrapped.keyHash);
  };

  // Initialize tree from initial snapshot
  for (const [key, rx] of map.previousSnapshot.entries()) {
    insertByHash(key, rx);
  }

  // Process structural changes via accumulate
  const accState = cleared
    .zip(keyState, (cleared, keys) => [cleared, keys] as const)
    .accumulate(
      [tree, [] as Add[], [] as Delete[], false, new Set(map.previousSnapshot.keys())] as [
        typeof tree,
        Add[],
        Delete[],
        boolean,
        Set<K>,
      ],
      ([tree, , , , presentKeys], [cleared, keys]) => {
        const adds: Add[] = [];
        const deletes: Delete[] = [];

        if (cleared) {
          for (const id of presentKeys) {
            tree.remove(id);
          }
          presentKeys.clear();
        }

        for (const [key, state] of keys) {
          if (state.structural !== null && state.structural.type === "delete") {
            tree.remove(key);
            presentKeys.delete(key);
            deletes.push(state.structural);
            continue;
          }

          let nextReactive: Reactive<V> | null = null;
          if (state.structural !== null && state.structural.type === "add") {
            nextReactive = state.structural.value;
          } else if (
            state.update !== null &&
            state.update.command !== null &&
            presentKeys.has(key)
          ) {
            nextReactive = state.update.command as unknown as Reactive<V>;
          }

          if (nextReactive !== null) {
            tree.remove(key);
            insertByHash(key, nextReactive);
            presentKeys.add(key);
            adds.push({ type: "add", key, value: nextReactive });
          }
        }

        return [tree, adds, deletes, cleared, presentKeys] as [
          typeof tree,
          Add[],
          Delete[],
          boolean,
          Set<K>,
        ];
      },
    );

  // Read merged result — separate node ensures height > per-item reactives
  const treeState = accState.map(([tree]) => tree.summary.merged);
  const adds = accState.map(([, adds]) => adds);
  const deletes = accState.map(([, , deletes]) => deletes);
  const wasCleared = accState.map(([, , , cleared]) => cleared);

  const innerChanges = treeState.bind((r) => r.changes.clone());
  const treeMatSnapshot = treeState.bind((r) => r.materialized.clone());

  // Assemble output changes: structural (clear/delete/add) + inner value changes
  const changes = innerChanges.zip4(
    adds,
    deletes,
    wasCleared,
    treeMatSnapshot,
    (inner, adds, deletes, cleared, mat) => {
      const clearCmd: MapCommand<K, V>[] = cleared ? [{ type: "clear" }] : [];
      const structural: MapCommand<K, V>[] = [
        ...clearCmd,
        ...deletes.map(
          (d): MapCommand<K, V> => ({ type: "delete", key: d.key }),
        ),
        ...adds.map(
          (a): MapCommand<K, V> => ({
            type: "add",
            key: a.key,
            value: mat.get(a.key)!,
          }),
        ),
      ];
      if (structural.length === 0) return inner;
      return [...structural, ...(inner ?? [])];
    },
  );

  const initial = tree.summary.merged.previousSnapshot;
  return Reactive.create<IMap<K, V>>(graph, yMapOps, changes, initial);
}
