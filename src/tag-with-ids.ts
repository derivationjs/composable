import { List } from "immutable";
import { ReactiveValue } from "derivation";
import { Reactive } from "./reactive.js";
import { ListCommand, ListOperations } from "./list-operations.js";
import { Operations } from "./operations.js";

export type ID = object;

export interface TaggedChanges<X> {
  structure: Reactive<List<ID>>;
  updates: ReactiveValue<{ id: ID; command: unknown }[]>;
  initialValues: Map<ID, X>;
}

// Trivial operations for ID - IDs never change
const idOps: Operations<ID> = {
  emptyCommand: () => null,
  isEmpty: (cmd) => cmd === null,
  mergeCommands: (_a, b) => b,
  apply: (state, _cmd) => state,
};

const idListOps = new ListOperations(idOps);

export function tagWithIds<X>(
  list: Reactive<List<X>>,
): TaggedChanges<X> {
  const graph = list.materialized.graph;

  // Initialize IDs and capture initial values
  const initialValues = new Map<ID, X>();
  const initialIds = List<ID>(
    list.materialized.value.map((x) => {
      const id: ID = {};
      initialValues.set(id, x);
      return id;
    })
  );

  const accumulated = list.changes.accumulate(
    { ids: initialIds, structuralCmds: [] as ListCommand<ID>[], updates: [] as { id: ID; command: unknown }[] },
    (state, rawCommands) => {
      const commands = rawCommands as ListCommand<X>[];
      let ids = state.ids;
      const structuralCmds: ListCommand<ID>[] = [];
      const updates: { id: ID; command: unknown }[] = [];

      for (const cmd of commands) {
        switch (cmd.type) {
          case "insert": {
            const id: ID = {};
            ids = ids.insert(cmd.index, id);
            initialValues.set(id, cmd.value);
            structuralCmds.push({ type: "insert", index: cmd.index, value: id });
            break;
          }
          case "update": {
            const id = ids.get(cmd.index);
            if (id) updates.push({ id, command: cmd.command });
            break;
          }
          case "remove": {
            ids = ids.remove(cmd.index);
            structuralCmds.push({ type: "remove", index: cmd.index });
            break;
          }
          case "move": {
            const id = ids.get(cmd.from);
            if (id) {
              ids = ids.remove(cmd.from).insert(cmd.to, id);
              structuralCmds.push({ type: "move", from: cmd.from, to: cmd.to });
            }
            break;
          }
          case "clear": {
            ids = List();
            structuralCmds.push({ type: "clear" });
            break;
          }
        }
      }

      return { ids, structuralCmds, updates };
    }
  );

  const structuralChanges = accumulated.map(s => s.structuralCmds);
  const structure = Reactive.create(graph, idListOps, structuralChanges, initialIds);

  return {
    structure,
    updates: accumulated.map(s => s.updates),
    initialValues,
  };
}
