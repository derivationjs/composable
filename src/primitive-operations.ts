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

  mergeCommands(firstCommand: T | null, secondCommand: T | null): T | null {
    if (secondCommand === null) {
      return firstCommand;
    } else {
      return secondCommand;
    }
  }

  replaceCommand(value: T): T | null {
    return value;
  }
}
