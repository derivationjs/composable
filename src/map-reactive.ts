import { Map as IMap } from "immutable";
import { Graph, ReactiveValue } from "derivation";
import { Reactive } from "./reactive.js";
import { Operations, asBase, Changes } from "./operations.js";
import { MapCommand, MapOperations } from "./map-operations.js";
import { operationsProxy } from "./operations-proxy.js";
import { groupBy } from "./group-by.js";
import { PrimitiveOperations } from "./primitive-operations.js";
import { sequenceMap } from "./sequence-map.js";

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
  const result = changes.map((changeSet) =>
    takeRightWhile(changeSet, (change) => change.type !== "clear"),
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

  const yValueOps = operationsProxy({} as Operations<Y>);
  const createReactive = (key: K, initialValue: X): Reactive<Y> => {
    const itemChanges = groupedChanges.select(key).map((entries) => {
      if (entries.length === 0) return null as Changes<X>;
      return entries[0].changes;
    });
    const rx = Reactive.create(
      graph,
      valueOperations,
      itemChanges,
      initialValue,
    );
    const ry = f(rx, key);
    yValueOps.setTarget(ry.operations);
    return ry;
  };

  let current = IMap<K, Reactive<Y>>();
  for (const [key, value] of map.previousSnapshot.entries()) {
    current = current.set(key, createReactive(key, value));
  }

  const reactiveValueOps = new PrimitiveOperations<Reactive<Y>>();
  const reactiveMapOps = new MapOperations<K, Reactive<Y>>(reactiveValueOps);

  const yMapChanges = cleared
    .zip(keyState, (wasCleared, keys) => [wasCleared, keys] as const)
    .map(([wasCleared, keys]) => {
      let commands: MapCommand<K, Reactive<Y>>[] = [];

      if (wasCleared) {
        current = IMap<K, Reactive<Y>>();
        commands = [{ type: "clear" }];
      }

      for (const [key, [structural]] of keys) {
        if (structural !== null && structural.type === "delete") {
          if (current.has(key)) {
            current = current.remove(key);
          }
          commands.push({ type: "delete", key });
        } else if (structural !== null && structural.type === "add") {
          const nextReactive = createReactive(key, structural.value);
          current = current.set(key, nextReactive);
          commands.push({ type: "add", key, value: nextReactive });
        }
      }

      return commands.length === 0 ? null : commands;
    });

  const mappedReactives = Reactive.create<IMap<K, Reactive<Y>>>(
    graph,
    reactiveMapOps,
    yMapChanges,
    current,
  );

  return sequenceMap(graph, mappedReactives);
}
