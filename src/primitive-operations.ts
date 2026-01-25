import { Operations } from "./operations.js";

export class PrimitiveOperations<T extends NonNullable<unknown>>
  implements Operations<T>
{
  constructor() {}

  apply(state: T, command: unknown): T {
    if (command !== null) {
      return command as T;
    } else {
      return state;
    }
  }

  emptyCommand(): unknown {
    return null;
  }

  isEmpty(command: unknown): boolean {
    return command === null;
  }

  mergeCommands(firstCommand: unknown, secondCommand: unknown): unknown {
    return secondCommand;
  }
}
