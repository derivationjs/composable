import { describe, expect, it } from "vitest";
import { Map as IMap } from "immutable";
import { MapOperations, type MapCommand } from "../map-operations.js";
import type { OperationsBase } from "../operations.js";

const optionalNumberOps: OperationsBase<
  number | undefined,
  number | undefined | null
> = {
  apply: (state, command) => (command === null ? state : command),
  mergeCommands: (first, second) => (second === null ? first : second),
  replaceCommand: (value) => value,
};

describe("MapOperations", () => {
  it("updates keys whose current value is undefined", () => {
    const ops = new MapOperations<string, number | undefined>(
      optionalNumberOps as never,
    );
    const commands = [
      { type: "update", key: "a", command: 1 },
    ] as unknown as MapCommand<string, number | undefined>[];

    const next = ops.apply(IMap<string, number | undefined>({ a: undefined }), commands);

    expect(next.has("a")).toBe(true);
    expect(next.get("a")).toBe(1);
  });
});
