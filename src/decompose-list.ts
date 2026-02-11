import { List, Map as IMap } from "immutable";
import { Graph } from "derivation";
import { Reactive } from "./reactive.js";
import { ListCommand, ListOperations } from "./list-operations.js";
import { MapCommand, MapOperations } from "./map-operations.js";
import { PrimitiveOperations } from "./primitive-operations.js";

export type ID = object;
const idOps = new PrimitiveOperations<ID>();
const idListOps = new ListOperations(idOps);

export function decomposeList<T>(
  graph: Graph,
  source: Reactive<List<T>>,
): [Reactive<List<ID>>, Reactive<IMap<ID, T>>] {
  const valueOps = source.operations.itemOperations;
  const mapOps = new MapOperations<ID, T>(valueOps);

  // Initialize IDs and build initial map
  let initialIds = List<ID>();
  let initialMap = IMap<ID, T>();

  source.previousSnapshot.forEach((x) => {
    const id: ID = {};
    initialIds = initialIds.push(id);
    initialMap = initialMap.set(id, x);
  });

  const accumulated = source.changes.accumulate(
    {
      ids: initialIds,
      idCmds: [] as ListCommand<ID>[],
      mapCmds: [] as MapCommand<ID, T>[],
    },
    (state, rawCommands) => {
      if (rawCommands === null)
        return {
          ids: state.ids,
          idCmds: [] as ListCommand<ID>[],
          mapCmds: [] as MapCommand<ID, T>[],
        };
      const commands = rawCommands as ListCommand<T>[];
      let ids = state.ids;
      const idCmds: ListCommand<ID>[] = [];
      const mapCmds: MapCommand<ID, T>[] = [];

      for (const cmd of commands) {
        switch (cmd.type) {
          case "insert": {
            const id: ID = {};
            ids = ids.insert(cmd.index, id);
            idCmds.push({ type: "insert", index: cmd.index, value: id });
            mapCmds.push({ type: "add", key: id, value: cmd.value });
            break;
          }
          case "update": {
            const id = ids.get(cmd.index);
            if (id) {
              mapCmds.push({ type: "update", key: id, command: cmd.command });
            }
            break;
          }
          case "remove": {
            const id = ids.get(cmd.index);
            ids = ids.remove(cmd.index);
            idCmds.push({ type: "remove", index: cmd.index });
            if (id) {
              mapCmds.push({ type: "delete", key: id });
            }
            break;
          }
          case "move": {
            const id = ids.get(cmd.from);
            if (id) {
              ids = ids.remove(cmd.from).insert(cmd.to, id);
              idCmds.push({ type: "move", from: cmd.from, to: cmd.to });
            }
            break;
          }
          case "clear": {
            ids = List();
            idCmds.push({ type: "clear" });
            mapCmds.push({ type: "clear" });
            break;
          }
        }
      }

      return { ids, idCmds, mapCmds };
    },
  );

  const idChanges = accumulated.map((s) => s.idCmds);
  const idList = Reactive.create<List<ID>>(
    graph,
    idListOps,
    idChanges,
    initialIds,
  );

  const mapChanges = accumulated.map((s) => s.mapCmds);
  const map = Reactive.create<IMap<ID, T>>(
    graph,
    mapOps,
    mapChanges,
    initialMap,
  );

  return [idList, map];
}
