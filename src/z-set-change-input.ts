import { Graph, ReactiveValue } from "derivation";
import { ZSet } from "./z-set.js";

export class ZSetChangeInput<T> extends ReactiveValue<ZSet<T>> {
  private current = new ZSet<T>();
  private pending = new ZSet<T>();

  constructor(public readonly graph: Graph) {
    super();
    graph.addValue(this);
  }

  add(item: T, weight = 1): void {
    this.pending = this.pending.add(item, weight);
    this.graph.markDirtyNextStep(this);
  }

  push(set: ZSet<T>): void {
    this.pending = this.pending.union(set);
    this.graph.markDirtyNextStep(this);
  }

  step(): void {
    this.current = this.pending;
    this.pending = new ZSet<T>();
    if (!this.current.isEmpty()) {
      this.invalidateDependents();
    }
    this.graph.markDirtyNextStep(this);
  }

  get value(): ZSet<T> {
    return this.current;
  }
}
