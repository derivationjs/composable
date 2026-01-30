import { Graph, ReactiveValue } from "derivation";
import { type Changes, type Operations, asBase } from "./operations.js";

export class ChangeInput<T> extends ReactiveValue<Changes<T>> {
  private current: Changes<T>;
  private pending: Changes<T>;
  private readonly ops;

  constructor(public readonly graph: Graph, operations: Operations<T>) {
    super();
    this.ops = asBase(operations);
    this.current = this.ops.emptyCommand();
    this.pending = this.ops.emptyCommand();
    graph.addValue(this);
  }

  push(command: Changes<T>): void {
    this.pending = this.ops.mergeCommands(this.pending, command);
    this.graph.markDirtyNextStep(this);
  }

  step(): void {
    this.current = this.pending;
    this.pending = this.ops.emptyCommand();
    if (!this.ops.isEmpty(this.current)) {
      this.invalidateDependents();
    }
    this.graph.markDirtyNextStep(this);
  }

  get value(): Changes<T> {
    return this.current;
  }
}
