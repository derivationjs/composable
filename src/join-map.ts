import { Map as IMap, is } from "immutable";
import { Graph } from "derivation";
import { Reactive } from "./reactive.js";
import { MapOperations, MapCommand } from "./map-operations.js";
import { OperationsBase, Operations, Changes, asBase } from "./operations.js";
import { Tuple } from "./tuple.js";
import { TupleOperations } from "./tuple-operations.js";

/**
 * Compute the cartesian product of two IMaps.
 * For each (id1, v1) in left and (id2, v2) in right,
 * produces (Tuple([id1, id2]), Tuple([v1, v2])).
 */
function productMap<ID1, ID2, V1, V2>(
  left: IMap<ID1, V1>,
  right: IMap<ID2, V2>,
): IMap<Tuple<[ID1, ID2]>, Tuple<[V1, V2]>> {
  let result = IMap<Tuple<[ID1, ID2]>, Tuple<[V1, V2]>>();
  for (const [id1, v1] of left) {
    for (const [id2, v2] of right) {
      result = result.set(Tuple(id1, id2), Tuple(v1, v2));
    }
  }
  return result;
}

/**
 * Extract the inner commands affecting a specific outer key.
 * Returns null if the key was fully replaced (delete+add, clear, etc.).
 */
function extractInnerCmds<K, ID, V>(
  outerCmds: MapCommand<K, IMap<ID, V>>[],
  key: K,
): MapCommand<ID, V>[] | null {
  const result: MapCommand<ID, V>[] = [];
  for (const cmd of outerCmds) {
    if (cmd.type === "clear") return null;
    if ((cmd.type === "delete" || cmd.type === "add") && is(cmd.key, key))
      return null;
    if (cmd.type === "update" && is(cmd.key, key)) {
      const inner = cmd.command as MapCommand<ID, V>[] | null;
      if (inner === null) continue;
      if (inner.some((c) => c.type === "clear")) return null;
      result.push(...inner);
    }
  }
  return result;
}

/**
 * Cross one side's inner commands with the other side's map to produce product-level commands.
 * pairKey/pairVal handle the left-vs-right tuple ordering.
 */
function crossCommands<CK, CV, OK, OV, PK, PV>(
  cmds: MapCommand<CK, CV>[],
  other: IMap<OK, OV>,
  out: MapCommand<PK, PV>[],
  pairKey: (ck: CK, ok: OK) => PK,
  pairVal: (cv: CV, ov: OV) => PV,
  wrapCmd: (cmd: Changes<CV>) => Changes<PV>,
): void {
  for (const cmd of cmds) {
    if (cmd.type === "add") {
      for (const [ok, ov] of other)
        out.push({
          type: "add",
          key: pairKey(cmd.key, ok),
          value: pairVal(cmd.value, ov),
        });
    } else if (cmd.type === "delete") {
      for (const [ok] of other)
        out.push({ type: "delete", key: pairKey(cmd.key, ok) });
    } else if (cmd.type === "update") {
      for (const [ok] of other)
        out.push({
          type: "update",
          key: pairKey(cmd.key, ok),
          command: wrapCmd(cmd.command),
        });
    }
  }
}

/**
 * Extract affected keys from a list of MapCommands.
 * For 'clear', all keys in the previous state are affected.
 */
function getAffectedKeys<K, V>(
  commands: MapCommand<K, V>[],
  prevState: IMap<K, V>,
): Set<K> {
  const keys = new Set<K>();
  for (const cmd of commands) {
    switch (cmd.type) {
      case "add":
      case "update":
      case "delete":
        keys.add(cmd.key);
        break;
      case "clear":
        for (const [key] of prevState) {
          keys.add(key);
        }
        break;
    }
  }
  return keys;
}

/**
 * Joins two reactive maps by key, producing a cartesian product of inner maps
 * for each matching key.
 *
 * For each key K present in both left and right, the output contains an entry
 * mapping K to the cartesian product of left[K] × right[K], where each pair
 * (id1, id2) maps to Tuple([v1, v2]).
 */
export function joinMap<K, ID1, ID2, V1, V2>(
  graph: Graph,
  left: Reactive<IMap<K, IMap<ID1, V1>>>,
  right: Reactive<IMap<K, IMap<ID2, V2>>>,
): Reactive<IMap<K, IMap<Tuple<[ID1, ID2]>, Tuple<[V1, V2]>>>> {
  type InnerMap = IMap<Tuple<[ID1, ID2]>, Tuple<[V1, V2]>>;
  type OuterMap = IMap<K, InnerMap>;

  const leftOps = asBase(left.operations) as MapOperations<K, IMap<ID1, V1>>;
  const rightOps = asBase(right.operations) as MapOperations<K, IMap<ID2, V2>>;
  const leftInnerOps = leftOps.valueOperations as MapOperations<ID1, V1>;
  const rightInnerOps = rightOps.valueOperations as MapOperations<ID2, V2>;
  const v1Ops = asBase(leftInnerOps.valueOperations);
  const v2Ops = asBase(rightInnerOps.valueOperations);
  const tupleOps = new TupleOperations<[V1, V2]>(v1Ops, v2Ops);
  const innerMapOps = new MapOperations<Tuple<[ID1, ID2]>, Tuple<[V1, V2]>>(
    tupleOps,
  );
  const outerOps = new MapOperations<K, InnerMap>(
    innerMapOps as unknown as Operations<InnerMap>,
  );

  // Compute initial snapshot
  type LeftInner = IMap<K, IMap<ID1, V1>>;
  type RightInner = IMap<K, IMap<ID2, V2>>;
  const lInitial = left.previousSnapshot as unknown as LeftInner;
  const rInitial = right.previousSnapshot as unknown as RightInner;
  let initialSnapshot: OuterMap = IMap();
  for (const [key, lInner] of lInitial) {
    const rInner = rInitial.get(key);
    if (rInner !== undefined) {
      initialSnapshot = initialSnapshot.set(key, productMap(lInner, rInner));
    }
  }

  const changes = left.changes.zip3(
    left.previousMaterialized,
    right.changes,
    right.previousMaterialized,
    (lRawCmds, lRawPrev, rRawCmds, rRawPrev) => {
      const lCmds = (lRawCmds ?? []) as MapCommand<K, IMap<ID1, V1>>[];
      const lPrev = lRawPrev as IMap<K, IMap<ID1, V1>>;
      const rCmds = (rRawCmds ?? []) as MapCommand<K, IMap<ID2, V2>>[];
      const rPrev = rRawPrev as IMap<K, IMap<ID2, V2>>;

      // Compute current states by applying commands
      const lCurr = leftOps.apply(lPrev, lCmds);
      const rCurr = rightOps.apply(rPrev, rCmds);

      // Collect affected keys from both sides
      const affectedKeys = new Set<K>();
      for (const k of getAffectedKeys(lCmds, lPrev)) {
        affectedKeys.add(k);
      }
      for (const k of getAffectedKeys(rCmds, rPrev)) {
        affectedKeys.add(k);
      }

      const outerCmds: MapCommand<K, InnerMap>[] = [];

      for (const key of affectedKeys) {
        const oldLhas = lPrev.has(key);
        const oldRhas = rPrev.has(key);
        const newLhas = lCurr.has(key);
        const newRhas = rCurr.has(key);

        const hadOutput = oldLhas && oldRhas;
        const hasOutput = newLhas && newRhas;

        if (hadOutput && hasOutput) {
          const lInner = extractInnerCmds(lCmds, key);
          const rInner = extractInnerCmds(rCmds, key);
          const lCurrK = lCurr.get(key)!;
          const rCurrK = rCurr.get(key)!;
          const innerCmds: MapCommand<Tuple<[ID1, ID2]>, Tuple<[V1, V2]>>[] =
            [];

          if (lInner === null || rInner === null) {
            innerCmds.push({ type: "clear" });
            for (const [pk, pv] of productMap(lCurrK, rCurrK))
              innerCmds.push({ type: "add", key: pk, value: pv });
          } else {
            const emptyV1 = null as Changes<V1>;
            const emptyV2 = null as Changes<V2>;
            // Phase 1: left changes × old right
            crossCommands(
              lInner,
              rPrev.get(key)!,
              innerCmds,
              (a, b) => Tuple(a, b),
              (a, b) => Tuple(a, b),
              (cmd) => [cmd, emptyV2] as [Changes<V1>, Changes<V2>],
            );
            // Phase 2: new left × right changes
            crossCommands(
              rInner,
              lCurrK,
              innerCmds,
              (a, b) => Tuple(b, a),
              (a, b) => Tuple(b, a),
              (cmd) => [emptyV1, cmd] as [Changes<V1>, Changes<V2>],
            );
          }

          if (innerCmds.length > 0)
            outerCmds.push({ type: "update", key, command: innerCmds });
        } else if (hadOutput && !hasOutput) {
          // Key removed from output
          outerCmds.push({ type: "delete", key });
        } else if (!hadOutput && hasOutput) {
          // Key added to output
          outerCmds.push({
            type: "add",
            key,
            value: productMap(lCurr.get(key)!, rCurr.get(key)!),
          });
        }
        // !hadOutput && !hasOutput — no change in output
      }

      return outerCmds;
    },
  );

  return Reactive.create<IMap<K, IMap<Tuple<[ID1, ID2]>, Tuple<[V1, V2]>>>>(
    graph,
    outerOps,
    changes,
    initialSnapshot,
  );
}
