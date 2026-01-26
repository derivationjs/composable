import { Graph, ReactiveValue } from "derivation";
import { ZMap } from "./z-map.js";

export class ZMapChangeInput<K, V> extends ReactiveValue<ZMap<K, V>> {
  private current = new ZMap<K, V>();
  private pending = new ZMap<K, V>();

  constructor(public readonly graph: Graph) {
    super();
    graph.addValue(this);
  }

  add(k1: K, k2: V, weight = 1): void {
    this.pending = this.pending.add(k1, k2, weight);
    this.graph.markDirtyNextStep(this);
  }

  push(set: ZMap<K, V>): void {
    this.pending = this.pending.union(set);
    this.graph.markDirtyNextStep(this);
  }

  step(): void {
    this.current = this.pending;
    this.pending = new ZMap<K, V>();
    if (!this.current.isEmpty()) {
      this.invalidateDependents();
    }
    this.graph.markDirtyNextStep(this);
  }

  get value(): ZMap<K, V> {
    return this.current;
  }
}
