import { describe, it, expect } from "vitest";
import { IndexedList } from "@derivation/indexed-list";
import { IndexedListOperations } from "../indexed-list-operations.js";
import { type ListCommand } from "../list-operations.js";

const values = (list: IndexedList<bigint, bigint>) =>
  Array.from({ length: Number(list.size()) }, (_, i) => list.valueAt(i));

describe("IndexedListOperations", () => {
  it("applies ListCommand semantics", () => {
    const ops = new IndexedListOperations<bigint, bigint>(null as never);
    let state = IndexedList.create();

    state = ops.apply(
      state,
      [
        { type: "insert", index: 0, value: 1n },
        { type: "insert", index: 1, value: 2n },
        { type: "insert", index: 1, value: 9n },
      ] satisfies ListCommand<bigint>[],
    );

    expect(state.size()).toBe(3n);
    expect(values(state)).toEqual([1n, 9n, 2n]);

    state = ops.apply(state, [
      { type: "move", from: 2, to: 0 },
      { type: "remove", index: 1 },
    ]);

    expect(values(state)).toEqual([2n, 9n]);
  });

  it("replaceCommand emits standard list commands", () => {
    const ops = new IndexedListOperations<bigint, bigint>(null as never);
    const original = IndexedList.create([1n, 2n, 3n]);
    const replacement = IndexedList.create([10n, 20n]);

    const cmds = ops.replaceCommand(replacement);
    const next = ops.apply(original, cmds);

    expect(cmds[0]).toEqual({ type: "clear" });
    expect(values(next)).toEqual([10n, 20n]);
  });
});
