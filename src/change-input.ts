import { Graph, ReactiveValue } from "derivation";
import { InternalReactiveValue } from "derivation/internal";
import { type Changes, type Operations, asBase } from "./operations.js";

class ChangeInputNode<T> extends InternalReactiveValue<Changes<T>> {
  private current: Changes<T>;
  private pending: Changes<T>;
  private readonly ops;
  readonly graph: Graph;

  constructor(graph: Graph, operations: Operations<T>) {
    super();
    this.graph = graph;
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

export class ChangeInput<T> extends ReactiveValue<Changes<T>> {
  private readonly inputNode: ChangeInputNode<T>;

  constructor(graph: Graph, operations: Operations<T>) {
    const inputNode = new ChangeInputNode(graph, operations);
    super(inputNode);
    this.inputNode = inputNode;
  }

  push(command: Changes<T>): void {
    this.inputNode.push(command);
  }
}
