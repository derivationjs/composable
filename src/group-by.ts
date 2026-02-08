import { Graph, ReactiveValue } from "derivation";
import { Map as IMap } from "immutable";
import { WeakCache } from "./weak-cache.js";

class SelectStream<V> extends ReactiveValue<V[]> {
  private _value: V[];

  constructor(public readonly graph: Graph) {
    super();
    this._value = [];
    graph.addValue(this);
  }

  step(): void {
    this.invalidateDependents();
  }

  updateValue(newValue: V[]): void {
    this._value = newValue;
  }

  get value(): V[] {
    return this._value;
  }
}

class GroupByStream<T, K, V> extends ReactiveValue<IMap<K, V[]>> {
  private _value: IMap<K, V[]>;
  private readonly cache: WeakCache<K, SelectStream<V>>;

  constructor(
    private readonly source: ReactiveValue<T[]>,
    private readonly getKey: (event: T) => K,
    private readonly getValue: (event: T) => V,
    public readonly graph: Graph,
  ) {
    super();
    this._value = IMap();
    this.cache = new WeakCache();
    source.addDependent(this);
    graph.addValue(this);
  }

  step(): void {
    const events = this.source.value;

    let grouped = IMap<K, V[]>();
    for (const event of events) {
      const key = this.getKey(event);
      const value = this.getValue(event);
      const existing = grouped.get(key);
      if (existing) {
        grouped = grouped.set(key, [...existing, value]);
      } else {
        grouped = grouped.set(key, [value]);
      }
    }

    // Update cached SelectStreams for current keys
    for (const [key, values] of grouped) {
      const selectStream = this.cache.get(key);
      if (selectStream) {
        selectStream.updateValue(values);
        this.graph.markDirty(selectStream);
      }
    }

    // Clear stale SelectStreams that are no longer in the grouping
    for (const key of this._value.keys()) {
      if (!grouped.has(key)) {
        const selectStream = this.cache.get(key);
        if (selectStream) {
          selectStream.updateValue([]);
          this.graph.markDirty(selectStream);
        }
      }
    }

    this._value = grouped;
    this.invalidateDependents();
  }

  select(key: K): ReactiveValue<V[]> {
    let selectStream = this.cache.get(key);
    if (!selectStream) {
      selectStream = new SelectStream<V>(this.graph);
      selectStream.ensureHeight(this.height + 1);
      selectStream.updateValue(this._value.get(key) ?? []);
      this.cache.set(key, selectStream);
    }
    return selectStream;
  }

  ensureHeight(minHeight: number): void {
    super.ensureHeight(minHeight);
    for (const [_, stream] of this.cache) {
      stream.ensureHeight(minHeight + 1);
    }
  }

  get value(): IMap<K, V[]> {
    return this._value;
  }
}

export function groupBy<T, K, V>(
  source: ReactiveValue<T[]>,
  getKey: (event: T) => K,
  getValue: (event: T) => V,
): GroupByStream<T, K, V> {
  const graph = source.graph;
  return new GroupByStream(source, getKey, getValue, graph);
}
