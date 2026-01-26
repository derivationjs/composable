import { describe, it, expect } from "vitest";
import { Set as ISet } from "immutable";
import { SetOperations, SetCommand } from "../set-operations.js";

describe("SetOperations", () => {
  const ops = new SetOperations<number>();

  it("should start with an empty set", () => {
    const state = ISet<number>();
    expect(state.size).toBe(0);
  });

  it("should add elements", () => {
    const state = ISet<number>();
    const commands: SetCommand<number>[] = [
      { type: "add", value: 1 },
      { type: "add", value: 2 },
      { type: "add", value: 3 },
    ];

    const newState = ops.apply(state, commands);
    expect(newState.size).toBe(3);
    expect(newState.has(1)).toBe(true);
    expect(newState.has(2)).toBe(true);
    expect(newState.has(3)).toBe(true);
  });

  it("should not add duplicate elements", () => {
    const state = ISet([1, 2, 3]);
    const commands: SetCommand<number>[] = [
      { type: "add", value: 2 },
      { type: "add", value: 4 },
    ];

    const newState = ops.apply(state, commands);
    expect(newState.size).toBe(4);
    expect(newState.toArray().sort()).toEqual([1, 2, 3, 4]);
  });

  it("should delete elements", () => {
    const state = ISet([1, 2, 3]);
    const commands: SetCommand<number>[] = [{ type: "delete", value: 2 }];

    const newState = ops.apply(state, commands);
    expect(newState.size).toBe(2);
    expect(newState.has(1)).toBe(true);
    expect(newState.has(2)).toBe(false);
    expect(newState.has(3)).toBe(true);
  });

  it("should handle delete of non-existent element", () => {
    const state = ISet([1, 2, 3]);
    const commands: SetCommand<number>[] = [{ type: "delete", value: 99 }];

    const newState = ops.apply(state, commands);
    expect(newState.size).toBe(3);
    expect(newState.toArray().sort()).toEqual([1, 2, 3]);
  });

  it("should clear the set", () => {
    const state = ISet([1, 2, 3]);
    const commands: SetCommand<number>[] = [{ type: "clear" }];

    const newState = ops.apply(state, commands);
    expect(newState.size).toBe(0);
  });

  it("should handle multiple commands", () => {
    const state = ISet([1, 2]);
    const commands: SetCommand<number>[] = [
      { type: "add", value: 3 },
      { type: "delete", value: 1 },
      { type: "add", value: 4 },
    ];

    const newState = ops.apply(state, commands);
    expect(newState.size).toBe(3);
    expect(newState.toArray().sort()).toEqual([2, 3, 4]);
  });

  it("should have an empty command", () => {
    const cmd = ops.emptyCommand();
    expect(ops.isEmpty(cmd)).toBe(true);
  });

  it("should check if command is empty", () => {
    expect(ops.isEmpty([])).toBe(true);
    expect(ops.isEmpty([{ type: "add", value: 1 }])).toBe(false);
  });

  it("should merge commands", () => {
    const cmd1: SetCommand<number>[] = [{ type: "add", value: 1 }];
    const cmd2: SetCommand<number>[] = [{ type: "add", value: 2 }];

    const merged = ops.mergeCommands(cmd1, cmd2) as SetCommand<number>[];
    expect(merged.length).toBe(2);
    expect(merged[0]).toEqual({ type: "add", value: 1 });
    expect(merged[1]).toEqual({ type: "add", value: 2 });
  });
});
