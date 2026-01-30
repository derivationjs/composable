import { Map as IMap } from "immutable";
import { Graph } from "derivation";
import { Reactive } from "./reactive.js";
import { Operations, Primitive, asBase } from "./operations.js";
import { groupBy } from "./group-by.js";
import { MapCommand, MapOperations } from "./map-operations.js";

/**
 * Groups a Reactive<Map<ID, T>> into a Reactive<Map<K, Map<ID, T>>> based on a key function.
 *
 * Items are grouped by the key returned by the key function applied to each entry's
 * reactive value. When an item's key changes, it moves from one group to another.
 * Groups are created/deleted as needed.
 */
export function groupByMap<ID, T, K>(
  graph: Graph,
  source: Reactive<IMap<ID, T>>,
  f: (x: Reactive<T>) => Reactive<K>,
  ..._check: [Primitive<K>] extends [never]
    ? [error: "K must be a primitive type, not a collection"]
    : []
): Reactive<IMap<K, IMap<ID, T>>> {
  const valueOperations = source.operations.valueOperations;

  // Group update commands by key (ID)
  const groupedUpdates = groupBy(
    source.changes.map((cmds) => {
      const commands = cmds as MapCommand<ID, T>[];
      return commands
        .filter(
          (cmd): cmd is MapCommand<ID, T> & { type: "update" } =>
            cmd.type === "update",
        )
        .map((cmd) => ({ key: cmd.key, command: cmd.command }));
    }),
    (u) => u.key,
    (u) => u.command,
  );

  // Per-ID reactive state
  const itemReactives = new Map<ID, Reactive<T>>();
  const keyReactives = new Map<ID, Reactive<K>>();

  // Mutable tracking state
  const currentKeys = new Map<ID, K>();
  const groupSets = new Map<K, Set<ID>>();

  function getOrCreateReactives(
    id: ID,
    initialValue: T,
  ): { rx: Reactive<T>; keyRx: Reactive<K> } {
    let rx = itemReactives.get(id);
    let keyRx = keyReactives.get(id);

    if (!rx || !keyRx) {
      const itemChanges = groupedUpdates
        .select(id)
        .map((cmds) =>
          cmds.reduce(
            (acc, cmd) => asBase(valueOperations).mergeCommands(acc, cmd),
            asBase(valueOperations).emptyCommand(),
          ),
        );
      rx = Reactive.create(graph, valueOperations, itemChanges, initialValue);
      keyRx = f(rx);

      itemReactives.set(id, rx);
      keyReactives.set(id, keyRx);
    }

    return { rx: rx!, keyRx: keyRx! };
  }

  function addToGroup(key: K, id: ID): void {
    let set = groupSets.get(key);
    if (!set) {
      set = new Set();
      groupSets.set(key, set);
    }
    set.add(id);
  }

  function removeFromGroup(key: K, id: ID): boolean {
    const set = groupSets.get(key);
    if (!set) return true;
    set.delete(id);
    if (set.size === 0) {
      groupSets.delete(key);
      return true; // group is now empty
    }
    return false;
  }

  // Initialize reactives for all initial entries and build initial groups
  const initialGroups = IMap<K, IMap<ID, T>>().withMutations((map) => {
    for (const [id, value] of source.snapshot) {
      const { rx, keyRx } = getOrCreateReactives(id, value);
      const key = keyRx.snapshot;
      currentKeys.set(id, key);
      addToGroup(key, id);

      const existing = map.get(key) || IMap<ID, T>();
      map.set(key, existing.set(id, rx.snapshot));
    }
  });

  const innerMapOps = new MapOperations<ID, T>(valueOperations);
  const outerMapOps = new MapOperations<K, IMap<ID, T>>(
    innerMapOps as unknown as Operations<IMap<ID, T>>,
  );

  const allChanges = source.changes
    .zip(groupedUpdates, (srcCmds, _grouped) => ({
      srcCmds: srcCmds as MapCommand<ID, T>[],
    }))
    .accumulate<{
      currentKeys: Map<ID, K>;
      groupSets: Map<K, Set<ID>>;
      commands: MapCommand<K, IMap<ID, T>>[];
    }>(
      {
        currentKeys,
        groupSets,
        commands: [],
      },
      (state, { srcCmds }) => {
        const mapCmds: MapCommand<K, IMap<ID, T>>[] = [];
        const currentKeys = state.currentKeys;
        const groupSets = state.groupSets;

        for (const cmd of srcCmds) {
          switch (cmd.type) {
            case "add": {
              const id = cmd.key;
              const { rx, keyRx } = getOrCreateReactives(id, cmd.value);
              const key = keyRx.snapshot;
              currentKeys.set(id, key);

              const existingSet = groupSets.get(key);
              const isNewGroup = !existingSet || existingSet.size === 0;
              addToGroup(key, id);

              if (isNewGroup) {
                mapCmds.push({
                  type: "add",
                  key,
                  value: IMap<ID, T>([[id, rx.snapshot]]),
                });
              } else {
                const innerCmd: MapCommand<ID, T>[] = [
                  { type: "add", key: id, value: rx.snapshot },
                ];
                mapCmds.push({ type: "update", key, command: innerCmd });
              }
              break;
            }
            case "update": {
              const id = cmd.key;
              const keyRx = keyReactives.get(id);
              const rx = itemReactives.get(id);
              if (!keyRx || !rx) break;

              const oldKey = currentKeys.get(id);
              const newKey = keyRx.snapshot;

              if (oldKey === newKey) {
                // Same group — propagate inner update
                if (newKey !== undefined) {
                  const innerCmd: MapCommand<ID, T>[] = [
                    { type: "update", key: id, command: rx.changes.value },
                  ];
                  mapCmds.push({
                    type: "update",
                    key: newKey,
                    command: innerCmd,
                  });
                }
              } else {
                // Key changed — move between groups
                if (oldKey !== undefined) {
                  const groupEmpty = removeFromGroup(oldKey, id);
                  if (groupEmpty) {
                    mapCmds.push({ type: "delete", key: oldKey });
                  } else {
                    const innerCmd: MapCommand<ID, T>[] = [
                      { type: "delete", key: id },
                    ];
                    mapCmds.push({
                      type: "update",
                      key: oldKey,
                      command: innerCmd,
                    });
                  }
                }

                const existingSet = groupSets.get(newKey);
                const isNewGroup = !existingSet || existingSet.size === 0;
                addToGroup(newKey, id);
                currentKeys.set(id, newKey);

                if (isNewGroup) {
                  mapCmds.push({
                    type: "add",
                    key: newKey,
                    value: IMap<ID, T>([[id, rx.snapshot]]),
                  });
                } else {
                  const innerCmd: MapCommand<ID, T>[] = [
                    { type: "add", key: id, value: rx.snapshot },
                  ];
                  mapCmds.push({
                    type: "update",
                    key: newKey,
                    command: innerCmd,
                  });
                }
              }
              break;
            }
            case "delete": {
              const id = cmd.key;
              const oldKey = currentKeys.get(id);
              if (oldKey === undefined) break;

              currentKeys.delete(id);
              const groupEmpty = removeFromGroup(oldKey, id);

              if (groupEmpty) {
                mapCmds.push({ type: "delete", key: oldKey });
              } else {
                const innerCmd: MapCommand<ID, T>[] = [
                  { type: "delete", key: id },
                ];
                mapCmds.push({
                  type: "update",
                  key: oldKey,
                  command: innerCmd,
                });
              }
              break;
            }
            case "clear": {
              mapCmds.push({ type: "clear" });
              currentKeys.clear();
              groupSets.clear();
              break;
            }
          }
        }

        return {
          currentKeys,
          groupSets,
          commands: mapCmds,
        };
      },
    )
    .map((state) => state.commands);

  return Reactive.create<IMap<K, IMap<ID, T>>>(
    graph,
    outerMapOps,
    allChanges,
    initialGroups,
  );
}
