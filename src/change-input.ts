import { Graph, ReactiveValue } from "derivation";
import { type Changes, type Operations, asBase } from "./operations.js";

export class ChangeInput<T> extends ReactiveValue<Changes<T>> {
  private current: Changes<T>;
  private pending: Changes<T>;
  private readonly ops;

  constructor(public readonly graph: Graph, operations: Operations<T>) {
    super();
    this.ops = asBase(operations);
    this.current = null as Changes<T>;
    this.pending = null as Changes<T>;
    graph.addValue(this);
  }

  push(command: Changes<T>): void {
    this.pending = this.ops.mergeCommands(this.pending, command);
    this.graph.markDirtyNextStep(this);
  }

  step(): void {
    this.current = this.pending;
    this.pending = null as Changes<T>;
    if (this.current !== null) {
      this.invalidateDependents();
    }
    this.graph.markDirtyNextStep(this);
  }

  get value(): Changes<T> {
    return this.current;
  }
}
