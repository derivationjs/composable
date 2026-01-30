import { Graph } from "derivation";
import { Log } from "./log.js";
import { LogOperations, type LogCommand } from "./log-operations.js";
import { ChangeInput } from "./change-input.js";

export class LogChangeInput<T> extends ChangeInput<Log<T>> {
  constructor(graph: Graph) {
    super(graph, new LogOperations<T>());
  }

  add(item: T): void {
    super.push([item]);
  }

  addAll(items: Iterable<T>): void {
    super.push([...items]);
  }

  override get value(): Array<LogCommand<T>> {
    return super.value as Array<LogCommand<T>>;
  }
}
