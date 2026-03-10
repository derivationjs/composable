import { Map as IMap, is } from "immutable";
import { Graph } from "derivation";
import { Reactive } from "./reactive.js";
import { Cell } from "./cell.js";
import { Changes, Operations } from "./operations.js";
import { MapCommand, MapOperations } from "./map-operations.js";
import { mapMap } from "./map-reactive.js";

/**
 * Mutable tracker for group membership.
 * Tracks which group (key) each ID belongs to and the size of each group.
 * Produces incremental outer map commands when entries are added/removed/moved.
 */
class GroupTracker<ID, T, K extends NonNullable<unknown>> {
  private idToKey = new Map<ID, K>();
  private groupSizes = IMap<K, number>();

  addToGroup(id: ID, key: K, value: T): MapCommand<K, IMap<ID, T>> {
    this.idToKey.set(id, key);
    const size = this.groupSizes.get(key) ?? 0;
    this.groupSizes = this.groupSizes.set(key, size + 1);
    if (size === 0) {
      return { type: "add", key, value: IMap<ID, T>([[id, value]]) };
    }
    return {
      type: "update",
      key,
      command: [{ type: "add", key: id, value }],
    };
  }

  removeFromGroup(id: ID): MapCommand<K, IMap<ID, T>> {
    const key = this.idToKey.get(id)!;
    this.idToKey.delete(id);
    const size = this.groupSizes.get(key)!;
    if (size === 1) {
      this.groupSizes = this.groupSizes.delete(key);
      return { type: "delete", key };
    }
    this.groupSizes = this.groupSizes.set(key, size - 1);
    return {
      type: "update",
      key,
      command: [{ type: "delete", key: id }],
    };
  }

  updateInGroup(id: ID, command: Changes<T>): MapCommand<K, IMap<ID, T>> {
    const key = this.idToKey.get(id)!;
    return {
      type: "update",
      key,
      command: [{ type: "update", key: id, command }],
    };
  }

  getKey(id: ID): K | undefined {
    return this.idToKey.get(id);
  }

  clear(): void {
    this.idToKey.clear();
    this.groupSizes = IMap();
  }
}

/**
 * Groups a Reactive<Map<ID, T>> into a Reactive<Map<K, Map<ID, T>>> based on a key function.
 *
 * Items are grouped by the key returned by the key function applied to each entry's
 * reactive value. When an item's key changes, it moves from one group to another.
 * Groups are created/deleted as needed.
 */
export function groupByMap<ID, T, K extends NonNullable<unknown>>(
  graph: Graph,
  source: Reactive<IMap<ID, T>>,
  f: (x: Reactive<T>) => Reactive<Cell<K>>,
): Reactive<IMap<K, IMap<ID, T>>> {
  const keys = mapMap(graph, source, f);

  const innerMapOps = new MapOperations<ID, T>(source.operations.valueOperations);
  const outerMapOps = new MapOperations<K, IMap<ID, T>>(
    innerMapOps as unknown as Operations<IMap<ID, T>>,
  );

  const tracker = new GroupTracker<ID, T, K>();
  let initialGroups = IMap<K, IMap<ID, T>>();
  for (const [id, value] of source.previousSnapshot) {
    const keyCell = keys.previousSnapshot.get(id);
    if (!keyCell) continue;
    tracker.addToGroup(id, keyCell.value, value);
    const existing = initialGroups.get(keyCell.value) ?? IMap<ID, T>();
    initialGroups = initialGroups.set(keyCell.value, existing.set(id, value));
  }

  const allChanges = source.changes
    .zip(keys.changes, (cmds, keyCmds) => ({ cmds, keyCmds }))
    .zip(keys.materialized, ({ cmds, keyCmds }, keysMat) => ({
      cmds,
      keyCmds,
      keysMat,
    }))
    .zip(source.materialized, ({ cmds, keyCmds, keysMat }, srcMat) => {
      const srcCommands = (cmds ?? []) as MapCommand<ID, T>[];
      const keyCommands = (keyCmds ?? []) as MapCommand<ID, Cell<K>>[];
      const outputCmds: MapCommand<K, IMap<ID, T>>[] = [];
      const processedIds = new Set<ID>();

      for (const cmd of srcCommands) {
        switch (cmd.type) {
          case "clear": {
            tracker.clear();
            outputCmds.push({ type: "clear" });
            break;
          }
          case "add": {
            processedIds.add(cmd.key);
            const keyCell = keysMat.get(cmd.key);
            if (!keyCell) break; // transient: removed later in this batch
            outputCmds.push(tracker.addToGroup(cmd.key, keyCell.value, cmd.value));
            break;
          }
          case "delete": {
            processedIds.add(cmd.key);
            if (tracker.getKey(cmd.key) === undefined) break; // transient: never added
            outputCmds.push(tracker.removeFromGroup(cmd.key));
            break;
          }
          case "update": {
            processedIds.add(cmd.key);
            const oldKey = tracker.getKey(cmd.key);
            if (oldKey === undefined) break; // transient: never added
            const newKey = keysMat.get(cmd.key)!.value;

            if (!is(oldKey, newKey)) {
              const currentValue = srcMat.get(cmd.key)!;
              outputCmds.push(tracker.removeFromGroup(cmd.key));
              outputCmds.push(tracker.addToGroup(cmd.key, newKey, currentValue));
            } else {
              outputCmds.push(tracker.updateInGroup(cmd.key, cmd.command));
            }
            break;
          }
        }
      }

      // Process key-only changes (not driven by source updates)
      for (const cmd of keyCommands) {
        if (cmd.type === "update" && cmd.command !== null && !processedIds.has(cmd.key)) {
          const oldKey = tracker.getKey(cmd.key);
          const newKey = cmd.command as K;
          if (oldKey !== undefined && !is(oldKey, newKey)) {
            const currentValue = srcMat.get(cmd.key)!;
            outputCmds.push(tracker.removeFromGroup(cmd.key));
            outputCmds.push(tracker.addToGroup(cmd.key, newKey, currentValue));
          }
        }
      }

      return outputCmds.length === 0 ? null : outputCmds;
    });

  return Reactive.create<IMap<K, IMap<ID, T>>>(
    graph,
    outerMapOps,
    allChanges,
    initialGroups,
  );
}
