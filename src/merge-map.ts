import { Map as IMap, is } from "immutable";
import { Graph } from "derivation";
import { Reactive } from "./reactive.js";
import { MapOperations, MapCommand } from "./map-operations.js";
import { asBase, Changes } from "./operations.js";

function getAffectedKeys<K, V>(
  commands: MapCommand<K, V>[],
  prevState: IMap<K, V>,
): IMap<K, true> {
  let keys = IMap<K, true>();

  for (const command of commands) {
    switch (command.type) {
      case "add":
      case "update":
      case "delete":
        keys = keys.set(command.key, true);
        break;
      case "clear":
        for (const [key] of prevState) {
          keys = keys.set(key, true);
        }
        break;
    }
  }

  return keys;
}

function extractVisibleUpdate<K, V>(
  commands: MapCommand<K, V>[],
  key: K,
  valueOps: { mergeCommands: (a: Changes<V>, b: Changes<V>) => Changes<V> },
): Changes<V> | "replace" {
  let merged = null as Changes<V>;

  for (const command of commands) {
    if (command.type === "clear") {
      return "replace";
    }

    if (!is(command.key, key)) {
      continue;
    }

    if (command.type === "add" || command.type === "delete") {
      return "replace";
    }

    merged = valueOps.mergeCommands(merged, command.command);
  }

  return merged;
}

export function mergeMap<K, V>(
  graph: Graph,
  left: Reactive<IMap<K, V>>,
  right: Reactive<IMap<K, V>>,
): Reactive<IMap<K, V>> {
  const operations = new MapOperations<K, V>(left.operations.valueOperations);
  const initialSnapshot = left.previousSnapshot.merge(right.previousSnapshot);
  const leftOps = asBase<IMap<K, V>>(left.operations);
  const rightOps = asBase<IMap<K, V>>(right.operations);
  const valueOps = asBase<V>(left.operations.valueOperations);

  const changes = left.changes.zip3(
    left.previousMaterialized,
    right.changes,
    right.previousMaterialized,
    (leftRaw, leftPrevRaw, rightRaw, rightPrevRaw) => {
      const leftPrev = leftPrevRaw as IMap<K, V>;
      const rightPrev = rightPrevRaw as IMap<K, V>;
      const leftCmds = (leftRaw ?? []) as MapCommand<K, V>[];
      const rightCmds = (rightRaw ?? []) as MapCommand<K, V>[];
      const leftCurr = leftOps.apply(leftPrev, leftRaw);
      const rightCurr = rightOps.apply(rightPrev, rightRaw);

      let affectedKeys = getAffectedKeys(leftCmds, leftPrev);
      for (const [key] of getAffectedKeys(rightCmds, rightPrev)) {
        affectedKeys = affectedKeys.set(key, true);
      }

      const output: MapCommand<K, V>[] = [];

      for (const [key] of affectedKeys) {
        const prevHasRight = rightPrev.has(key);
        const prevHasLeft = leftPrev.has(key);
        const currHasRight = rightCurr.has(key);
        const currHasLeft = leftCurr.has(key);

        const prevHasValue = prevHasRight || prevHasLeft;
        const currHasValue = currHasRight || currHasLeft;

        if (!prevHasValue && !currHasValue) {
          continue;
        }

        if (!prevHasValue) {
          output.push({
            type: "add",
            key,
            value: (currHasRight ? rightCurr.get(key) : leftCurr.get(key))!,
          });
          continue;
        }

        if (!currHasValue) {
          output.push({ type: "delete", key });
          continue;
        }

        const prevValue = (prevHasRight ? rightPrev.get(key) : leftPrev.get(key))!;
        const currValue = (currHasRight ? rightCurr.get(key) : leftCurr.get(key))!;

        if (is(prevValue, currValue)) {
          continue;
        }

        const prevSource = prevHasRight ? "right" : "left";
        const currSource = currHasRight ? "right" : "left";

        if (prevSource === currSource) {
          const update =
            currSource === "right"
              ? extractVisibleUpdate(rightCmds, key, valueOps)
              : extractVisibleUpdate(leftCmds, key, valueOps);

          output.push({
            type: "update",
            key,
            command:
              update === null || update === "replace"
                ? valueOps.replaceCommand(currValue)
                : update,
          });
          continue;
        }

        output.push({
          type: "update",
          key,
          command: valueOps.replaceCommand(currValue),
        });
      }

      return output.length === 0 ? null : output;
    },
  );

  return Reactive.create<IMap<K, V>>(graph, operations, changes, initialSnapshot);
}
