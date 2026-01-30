import { List, Map as IMap } from "immutable";
import { Graph } from "derivation";
import { Reactive } from "./reactive.js";
import { Operations, asBase } from "./operations.js";
import { decomposeList, ID } from "./decompose-list.js";
import { groupBy } from "./group-by.js";
import { MapCommand, MapOperations } from "./map-operations.js";
import { ListCommand, ListOperations } from "./list-operations.js";

/**
 * Groups a Reactive<List<X>> into a Reactive<Map<K, List<X>>> based on a key function.
 *
 * Items are grouped by the key returned by the key function. When an item's key changes,
 * it moves from one group to another. Groups are created/deleted as needed.
 */
export function groupByList<X, K>(
  graph: Graph,
  list: Reactive<List<X>>,
  keyFn: (x: Reactive<X>) => Reactive<K>,
): Reactive<IMap<K, List<X>>> {
  // Extract X operations from the list's operations
  const operations = list.operations.itemOperations;
  const [structure, decomposedMap] = decomposeList(graph, list);

  // Extract per-item update events from map changes
  const updateEvents = decomposedMap.changes.map((rawCmds) => {
    const cmds = rawCmds as MapCommand<ID, X>[];
    return cmds
      .filter(
        (c): c is Extract<MapCommand<ID, X>, { type: "update" }> =>
          c.type === "update",
      )
      .map((c) => ({ id: c.key, command: c.command }));
  });

  // Group updates by ID
  const groupedUpdates = groupBy(
    updateEvents,
    (u) => u.id,
    (u) => u.command,
  );

  // Map to store reactive state for each ID (persists across updates)
  const itemReactives = new Map<ID, Reactive<X>>();
  const keyReactives = new Map<ID, Reactive<K>>();

  // Mutable state for initialization (will be copied into accumulate)
  const currentKeys = new Map<ID, K>(); // Track current key for each ID
  const groupLists = new Map<K, List<ID>>(); // Track IDs in each group

  // Helper to get or create reactive state for an ID
  function getOrCreateReactives(id: ID): {
    rx: Reactive<X>;
    keyRx: Reactive<K>;
  } {
    let rx = itemReactives.get(id);
    let keyRx = keyReactives.get(id);

    if (!rx || !keyRx) {
      const initialValue = decomposedMap.snapshot.get(id)!;
      const itemChanges = groupedUpdates
        .select(id)
        .map((cmds) =>
          cmds.reduce(
            (acc, cmd) => asBase(operations).mergeCommands(acc, cmd),
            asBase(operations).emptyCommand(),
          ),
        );
      rx = Reactive.create(graph, operations, itemChanges, initialValue);
      keyRx = keyFn(rx);

      itemReactives.set(id, rx);
      keyReactives.set(id, keyRx);
    }

    return { rx: rx!, keyRx: keyRx! };
  }

  // Initialize reactives for all initial IDs and build initial groups
  const initialGroups = IMap<K, List<X>>().withMutations((map) => {
    for (const id of structure.snapshot) {
      const { rx, keyRx } = getOrCreateReactives(id);
      const key = keyRx.snapshot;
      currentKeys.set(id, key);

      const existingIdList = groupLists.get(key) || List<ID>();
      groupLists.set(key, existingIdList.push(id));

      const existingList = map.get(key) || List<X>();
      map.set(key, existingList.push(rx.snapshot));
    }
  });

  const allChanges = structure.changes
    .zip(updateEvents, (structCmds, upds) => ({
      structCmds: structCmds as ListCommand<ID>[],
      upds,
    }))
    .accumulate<{
      groupLists: Map<K, List<ID>>;
      currentKeys: Map<ID, K>;
      currentIds: List<ID>;
      commands: MapCommand<K, List<X>>[];
    }>(
      {
        groupLists: new Map(groupLists),
        currentKeys: new Map(currentKeys),
        currentIds: structure.snapshot,
        commands: [],
      },
      (state, { structCmds, upds }) => {
        const mapCmds: MapCommand<K, List<X>>[] = [];
        const groupLists = state.groupLists;
        const currentKeys = state.currentKeys;
        let currentIds = state.currentIds;

        // Process structural changes
        for (const cmd of structCmds) {
          switch (cmd.type) {
            case "insert": {
              const id = cmd.value;
              const { rx, keyRx } = getOrCreateReactives(id);
              const key = keyRx.snapshot;
              currentKeys.set(id, key);
              currentIds = currentIds.insert(cmd.index, id);

              // Calculate position within group based on source order
              // Count how many items from this group appear before the inserted item in currentIds
              const groupIdList = groupLists.get(key) || List<ID>();
              let insertIndex = 0;
              for (let i = 0; i < currentIds.size; i++) {
                const currentId = currentIds.get(i);
                if (currentId === id) break;
                if (currentId) {
                  const currentIdKey = currentKeys.get(currentId);
                  if (currentIdKey !== undefined && currentIdKey === key) {
                    insertIndex++;
                  }
                }
              }

              // Add item to its group at the correct position
              groupLists.set(key, groupIdList.insert(insertIndex, id));

              if (groupIdList.size === 0) {
                // New group - use set
                mapCmds.push({ type: "add", key, value: List([rx.snapshot]) });
              } else {
                // Existing group - use update with insert command
                const listCmd: ListCommand<X>[] = [
                  { type: "insert", index: insertIndex, value: rx.snapshot },
                ];
                mapCmds.push({ type: "update", key, command: listCmd });
              }
              break;
            }
            case "remove": {
              const id = currentIds.get(cmd.index);
              if (!id) break;
              currentIds = currentIds.remove(cmd.index);

              const key = currentKeys.get(id);
              if (key !== undefined) {
                const rx = itemReactives.get(id);
                if (!rx) break;

                // Find index within group
                const groupIdList = groupLists.get(key);
                if (!groupIdList) break;

                const indexInGroup = groupIdList.indexOf(id);
                if (indexInGroup === -1) break;

                // Remove from group tracking
                const newGroupIdList = groupIdList.remove(indexInGroup);
                if (newGroupIdList.size === 0) {
                  groupLists.delete(key);
                  // Delete the entire group from the map
                  mapCmds.push({ type: "delete", key });
                } else {
                  groupLists.set(key, newGroupIdList);
                  const listCmd: ListCommand<X>[] = [
                    { type: "remove", index: indexInGroup },
                  ];
                  mapCmds.push({ type: "update", key, command: listCmd });
                }

                currentKeys.delete(id);
              }
              break;
            }
            case "move": {
              const id = currentIds.get(cmd.from);
              if (!id) break;

              const key = currentKeys.get(id);
              if (key === undefined) break;

              const groupIdList = groupLists.get(key);
              if (!groupIdList) break;

              // Find old position within group
              const oldGroupIndex = groupIdList.indexOf(id);
              if (oldGroupIndex === -1) break;

              // Update source list order
              currentIds = currentIds.remove(cmd.from).insert(cmd.to, id);

              // Calculate new position within group based on source order
              // Count how many items from this group appear before the moved item in currentIds
              let newGroupIndex = 0;
              for (let i = 0; i < currentIds.size; i++) {
                const currentId = currentIds.get(i);
                if (currentId === id) break;
                if (currentId) {
                  const currentIdKey = currentKeys.get(currentId);
                  if (currentIdKey !== undefined && currentIdKey === key) {
                    newGroupIndex++;
                  }
                }
              }

              // Update group tracking
              const newGroupIdList = groupIdList
                .remove(oldGroupIndex)
                .insert(newGroupIndex, id);
              groupLists.set(key, newGroupIdList);

              // Emit move command if position changed within group
              if (oldGroupIndex !== newGroupIndex) {
                const listCmd: ListCommand<X>[] = [
                  { type: "move", from: oldGroupIndex, to: newGroupIndex },
                ];
                mapCmds.push({ type: "update", key, command: listCmd });
              }
              break;
            }
            case "clear": {
              mapCmds.push({ type: "clear" });
              currentKeys.clear();
              groupLists.clear();
              currentIds = List();
              break;
            }
          }
        }

        // Process key changes and item updates
        for (const upd of upds) {
          const keyRx = keyReactives.get(upd.id);
          if (!keyRx) continue;

          const oldKey = currentKeys.get(upd.id);
          const newKey = keyRx.snapshot;

          if (oldKey !== newKey) {
            // Item moved to a different group
            const rx = itemReactives.get(upd.id);
            if (!rx) continue;

            if (oldKey !== undefined) {
              // Remove from old group
              const oldGroupIdList = groupLists.get(oldKey);
              if (oldGroupIdList) {
                const indexInOldGroup = oldGroupIdList.indexOf(upd.id);
                if (indexInOldGroup !== -1) {
                  const newOldGroupIdList =
                    oldGroupIdList.remove(indexInOldGroup);
                  if (newOldGroupIdList.size === 0) {
                    groupLists.delete(oldKey);
                    mapCmds.push({ type: "delete", key: oldKey });
                  } else {
                    groupLists.set(oldKey, newOldGroupIdList);
                    const removeListCmd: ListCommand<X>[] = [
                      { type: "remove", index: indexInOldGroup },
                    ];
                    mapCmds.push({
                      type: "update",
                      key: oldKey,
                      command: removeListCmd,
                    });
                  }
                }
              }
            }

            // Add to new group at correct position based on source order
            const newGroupIdList = groupLists.get(newKey) || List<ID>();

            // Calculate position: count items from new group that appear before this item in source
            let insertIndex = 0;
            const itemSourceIndex = currentIds.indexOf(upd.id);
            for (let i = 0; i < itemSourceIndex; i++) {
              const currentId = currentIds.get(i);
              if (currentId) {
                const currentIdKey = currentKeys.get(currentId);
                if (currentIdKey !== undefined && currentIdKey === newKey) {
                  insertIndex++;
                }
              }
            }

            groupLists.set(newKey, newGroupIdList.insert(insertIndex, upd.id));

            if (newGroupIdList.size === 0) {
              // New group - use set
              mapCmds.push({
                type: "add",
                key: newKey,
                value: List([rx.snapshot]),
              });
            } else {
              // Existing group - use update with insert command
              const insertListCmd: ListCommand<X>[] = [
                { type: "insert", index: insertIndex, value: rx.snapshot },
              ];
              mapCmds.push({
                type: "update",
                key: newKey,
                command: insertListCmd,
              });
            }
            currentKeys.set(upd.id, newKey);
          } else if (newKey !== undefined) {
            // Item updated within same group
            const rx = itemReactives.get(upd.id);
            if (!rx) continue;

            const groupIdList = groupLists.get(newKey);
            if (!groupIdList) continue;

            const indexInGroup = groupIdList.indexOf(upd.id);
            if (indexInGroup === -1) continue;

            const updateListCmd: ListCommand<X>[] = [
              { type: "update", index: indexInGroup, command: upd.command },
            ];
            mapCmds.push({
              type: "update",
              key: newKey,
              command: updateListCmd,
            });
          }
        }

        return {
          groupLists,
          currentKeys,
          currentIds,
          commands: mapCmds,
        };
      },
    )
    .map((state) => state.commands);

  const listOps = new ListOperations(operations);
  const mapOps = new MapOperations<K, List<X>>(listOps);

  return Reactive.create<IMap<K, List<X>>>(
    graph,
    mapOps,
    allChanges,
    initialGroups,
  );
}
