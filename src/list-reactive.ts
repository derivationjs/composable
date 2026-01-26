import { List } from "immutable";
import { Graph, ReactiveValue, constantValue } from "derivation";
import { Reactive } from "./reactive.js";
import { Operations, asBase } from "./operations.js";
import { ListCommand, ListOperations } from "./list-operations.js";
import { tagWithIds, ID } from "./tag-with-ids.js";
import { groupBy } from "./group-by.js";

/**
 * Converts a List of reactive values into a reactive List.
 *
 * This "sequences" the reactive values - whenever any of the inner
 * reactive values change, the outer reactive list updates.
 */
export function sequenceList<X>(
  graph: Graph,
  list: List<ReactiveValue<X>>,
): ReactiveValue<List<X>> {
  return list.reduce(
    (acc: ReactiveValue<List<X>>, rv: ReactiveValue<X>) => {
      return acc.zip(rv, (list, x) => list.push(x));
    },
    constantValue(graph, List()),
  );
}

export function mapList<X, Y>(
  graph: Graph,
  list: Reactive<List<X>>,
  f: (x: Reactive<X>) => Reactive<Y>,
): Reactive<List<Y>> {
  // Extract X operations from the list's operations
  const operations = list.operations.itemOperations;
  const { structure, updates, initialValues } = tagWithIds(list);

  // Group updates by ID
  const groupedUpdates = groupBy(
    updates,
    (u) => u.id,
    (u) => u.command,
  );

  // Map to store Reactive<Y> for each ID
  const yReactives = new Map<ID, Reactive<Y>>();

  // Create ListOperations with undefined - we'll populate it lazily from first Y reactive
  const yListOps = new ListOperations<Y>(undefined as unknown as Operations<Y>);

  // Helper to get or create Reactive<Y> for an ID
  function getOrCreateY(id: ID): Reactive<Y> {
    let ry = yReactives.get(id);
    if (!ry) {
      const initialValue = initialValues.get(id)!;
      const itemChanges = groupedUpdates.select(id).map((cmds) =>
        cmds.reduce(
          (acc, cmd) => asBase(operations).mergeCommands(acc, cmd),
          asBase(operations).emptyCommand(),
        ),
      );
      const rx = Reactive.create(graph, operations, itemChanges, initialValue);
      ry = f(rx);
      // Capture Y operations from the first reactive we create
      yListOps.unsafeUpdateItemOperations(ry.operations);
      yReactives.set(id, ry);
    }
    return ry;
  }

  // Create Reactive<Y> for all initial IDs
  for (const id of structure.snapshot) {
    getOrCreateY(id);
  }

  // Transform structure changes to Y changes
  const structuralYChanges: ReactiveValue<ListCommand<Y>[]> = structure.changes.map((rawCmds) => {
    const idCmds = rawCmds as ListCommand<ID>[];
    const yCmds: ListCommand<Y>[] = [];

    for (const cmd of idCmds) {
      switch (cmd.type) {
        case "insert": {
          const ry = getOrCreateY(cmd.value);
          yCmds.push({ type: "insert", index: cmd.index, value: ry.snapshot });
          break;
        }
        case "remove": {
          yCmds.push({ type: "remove", index: cmd.index });
          break;
        }
        case "move": {
          yCmds.push({ type: "move", from: cmd.from, to: cmd.to });
          break;
        }
        case "clear": {
          yCmds.push({ type: "clear" });
          break;
        }
      }
    }

    return yCmds;
  });

  // Convert item updates to list update commands
  const itemYChanges: ReactiveValue<ListCommand<Y>[]> = updates.map((upds) => {
    const yCmds: ListCommand<Y>[] = [];
    const currentIds = structure.snapshot;

    for (const upd of upds) {
      const index = currentIds.indexOf(upd.id);
      if (index >= 0) {
        const ry = yReactives.get(upd.id);
        if (ry) {
          yCmds.push({ type: "update", index, command: ry.changes.value });
        }
      }
    }

    return yCmds;
  });

  // Combine structural and item changes
  const yChanges: ReactiveValue<ListCommand<Y>[]> = structuralYChanges.zip(
    itemYChanges,
    (structural, item) => [...structural, ...item],
  );

  // Build initial Y list
  const initialYList = List(
    structure.snapshot.map((id) => yReactives.get(id)!.snapshot).toArray()
  );

  return Reactive.create(graph, yListOps, yChanges, initialYList);
}
