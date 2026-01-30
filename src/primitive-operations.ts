import { OperationsBase } from "./operations.js";

export class PrimitiveOperations<T extends NonNullable<unknown>>
  implements OperationsBase<T, T | null>
{
  constructor() {}

  apply(state: T, command: T | null): T {
    if (command !== null) {
      return command;
    } else {
      return state;
    }
  }

  emptyCommand(): T | null {
    return null;
  }

  isEmpty(command: T | null): boolean {
    return command === null;
  }

  mergeCommands(firstCommand: T | null, secondCommand: T | null): T | null {
    return secondCommand;
  }

  replaceCommand(value: T): T | null {
    return value;
  }
}
