import { Graph, ReactiveValue } from "derivation";
import type { LogCommand } from "./log-operations.js";

export class LogChangeInput<T> extends ReactiveValue<Array<LogCommand<T>>> {
  private current: Array<LogCommand<T>> = [];
  private pending: Array<LogCommand<T>> = [];

  constructor(public readonly graph: Graph) {
    super();
    graph.addValue(this);
  }

  push(item: T): void {
    this.pending.push({ type: "append", value: item });
    this.graph.markDirtyNextStep(this);
  }

  pushAll(items: Iterable<T>): void {
    for (const item of items) {
      this.pending.push({ type: "append", value: item });
    }
    if (this.pending.length > 0) {
      this.graph.markDirtyNextStep(this);
    }
  }

  step(): void {
    this.current = this.pending;
    this.pending = [];
    if (this.current.length > 0) {
      this.invalidateDependents();
    }
    this.graph.markDirtyNextStep(this);
  }

  get value(): Array<LogCommand<T>> {
    return this.current;
  }
}
