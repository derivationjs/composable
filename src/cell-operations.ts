import { OperationsBase } from "./operations.js";
import { Cell } from "./cell.js";

export class CellOperations<T extends NonNullable<unknown>>
  implements OperationsBase<Cell<T>, T | null>
{
  constructor() {}

  apply(state: Cell<T>, command: T | null): Cell<T> {
    if (command !== null) {
      return state.set(command);
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

  replaceCommand(value: Cell<T>): T | null {
    return value.value;
  }
}
