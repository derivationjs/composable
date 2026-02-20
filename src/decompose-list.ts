import { List, Map as IMap } from "immutable";
import { Graph } from "derivation";
import { Reactive } from "./reactive.js";
import { Cell } from "./cell.js";
import { CellOperations } from "./cell-operations.js";
import { ListCommand, ListOperations } from "./list-operations.js";
import { MapCommand, MapOperations } from "./map-operations.js";

export type ID = object;
const idOps = new CellOperations<ID>();
const idListOps = new ListOperations<Cell<ID>>(idOps);

export function decomposeList<T>(
  graph: Graph,
  source: Reactive<List<T>>,
): [Reactive<List<Cell<ID>>>, Reactive<IMap<ID, T>>] {
  const valueOps = source.operations.itemOperations;
  const mapOps = new MapOperations<ID, T>(valueOps);

  // Initialize IDs and build initial map
  let initialIds = List<Cell<ID>>();
  let initialMap = IMap<ID, T>();

  source.previousSnapshot.forEach((x) => {
    const id: ID = {};
    initialIds = initialIds.push(new Cell(id));
    initialMap = initialMap.set(id, x);
  });

  const accumulated = source.changes.accumulate(
    {
      ids: initialIds,
      idCmds: [] as ListCommand<Cell<ID>>[],
      mapCmds: [] as MapCommand<ID, T>[],
    },
    (state, rawCommands) => {
      if (rawCommands === null)
        return {
          ids: state.ids,
          idCmds: [] as ListCommand<Cell<ID>>[],
          mapCmds: [] as MapCommand<ID, T>[],
        };
      const commands = rawCommands as ListCommand<T>[];
      let ids = state.ids;
      const idCmds: ListCommand<Cell<ID>>[] = [];
      const mapCmds: MapCommand<ID, T>[] = [];

      for (const cmd of commands) {
        switch (cmd.type) {
          case "insert": {
            const id: ID = {};
            const cellId = new Cell(id);
            ids = ids.insert(cmd.index, cellId);
            idCmds.push({ type: "insert", index: cmd.index, value: cellId });
            mapCmds.push({ type: "add", key: id, value: cmd.value });
            break;
          }
          case "update": {
            const cellId = ids.get(cmd.index);
            if (cellId) {
              mapCmds.push({
                type: "update",
                key: cellId.value,
                command: cmd.command,
              });
            }
            break;
          }
          case "remove": {
            const cellId = ids.get(cmd.index);
            ids = ids.remove(cmd.index);
            idCmds.push({ type: "remove", index: cmd.index });
            if (cellId) {
              mapCmds.push({ type: "delete", key: cellId.value });
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
  const idList = Reactive.create<List<Cell<ID>>>(
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
