import { Map as IMap } from "immutable";
import { Graph } from "derivation";
import { Reactive } from "./reactive.js";
import { Cell } from "./cell.js";
import { Changes } from "./operations.js";
import { mapMap } from "./map-reactive.js";
import { MapCommand, MapOperations } from "./map-operations.js";

export function filterMap<K, V>(
  graph: Graph,
  source: Reactive<IMap<K, V>>,
  predicate: (value: Reactive<V>, key: K) => Reactive<Cell<boolean>>,
): Reactive<IMap<K, V>> {
  const selected = mapMap(graph, source, predicate);
  const operations = new MapOperations<K, V>(source.operations.valueOperations);

  // Build initial filtered snapshot
  let initialFiltered = IMap<K, V>();
  const selectedKeys = new Set<K>();
  for (const [key, value] of source.previousSnapshot) {
    if (selected.previousSnapshot.get(key)?.value === true) {
      initialFiltered = initialFiltered.set(key, value);
      selectedKeys.add(key);
    }
  }

  const allChanges = source.changes
    .zip(selected.changes, (srcCmds, selCmds) => ({ srcCmds, selCmds }))
    .zip(selected.materialized, ({ srcCmds, selCmds }, selMat) => ({
      srcCmds,
      selCmds,
      selMat,
    }))
    .zip(source.materialized, ({ srcCmds, selCmds, selMat }, srcMat) => {
      const sourceCommands = (srcCmds ?? []) as MapCommand<K, V>[];
      const selectionCommands = (selCmds ?? []) as MapCommand<K, Cell<boolean>>[];
      const outputCmds: MapCommand<K, V>[] = [];
      const processedKeys = new Set<K>();

      for (const cmd of sourceCommands) {
        switch (cmd.type) {
          case "clear": {
            const hadEntries = selectedKeys.size > 0;
            selectedKeys.clear();
            if (hadEntries) {
              outputCmds.push({ type: "clear" });
            }
            break;
          }
          case "add": {
            processedKeys.add(cmd.key);
            const isSelected = selMat.get(cmd.key)?.value === true;
            if (isSelected) {
              selectedKeys.add(cmd.key);
              outputCmds.push({ type: "add", key: cmd.key, value: cmd.value });
            }
            break;
          }
          case "delete": {
            processedKeys.add(cmd.key);
            if (selectedKeys.has(cmd.key)) {
              selectedKeys.delete(cmd.key);
              outputCmds.push({ type: "delete", key: cmd.key });
            }
            break;
          }
          case "update": {
            processedKeys.add(cmd.key);
            const wasSelected = selectedKeys.has(cmd.key);
            const nowSelected = selMat.get(cmd.key)?.value === true;

            if (wasSelected && nowSelected) {
              selectedKeys.add(cmd.key);
              outputCmds.push({ type: "update", key: cmd.key, command: cmd.command as Changes<V> });
            } else if (wasSelected && !nowSelected) {
              selectedKeys.delete(cmd.key);
              outputCmds.push({ type: "delete", key: cmd.key });
            } else if (!wasSelected && nowSelected) {
              selectedKeys.add(cmd.key);
              const currentValue = srcMat.get(cmd.key)!;
              outputCmds.push({ type: "add", key: cmd.key, value: currentValue });
            }
            // !wasSelected && !nowSelected → no output
            break;
          }
        }
      }

      // Process selection-only changes (predicate flipped without source update)
      for (const cmd of selectionCommands) {
        if (cmd.type === "update" && cmd.command !== null && !processedKeys.has(cmd.key)) {
          const nowSelected = cmd.command as boolean;
          const wasSelected = selectedKeys.has(cmd.key);

          if (!wasSelected && nowSelected) {
            selectedKeys.add(cmd.key);
            const currentValue = srcMat.get(cmd.key);
            if (currentValue !== undefined) {
              outputCmds.push({ type: "add", key: cmd.key, value: currentValue });
            }
          } else if (wasSelected && !nowSelected) {
            selectedKeys.delete(cmd.key);
            outputCmds.push({ type: "delete", key: cmd.key });
          }
        }
      }

      return outputCmds.length === 0 ? null : outputCmds;
    });

  return Reactive.create<IMap<K, V>>(
    graph,
    operations,
    allChanges,
    initialFiltered,
  );
}
