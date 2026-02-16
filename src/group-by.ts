import { Graph, ReactiveValue } from "derivation";
import { InternalReactiveValue } from "derivation/internal";
import { Map as IMap } from "immutable";
import { WeakCache } from "./weak-cache.js";

class SelectNode<K, V> extends InternalReactiveValue<V[]> {
  private _value: V[];
  readonly graph: Graph;
  private readonly groupBy: InternalReactiveValue<IMap<K, V[]>>;
  private readonly key: K;

  constructor(
    graph: Graph,
    groupBy: InternalReactiveValue<IMap<K, V[]>>,
    key: K,
  ) {
    super();
    this.graph = graph;
    this.groupBy = this.trackInput(groupBy);
    this.key = key;
    this._value = this.groupBy.value.get(this.key) ?? [];
    graph.addValue(this);
  }

  step(): void {
    const nextValue = this.groupBy.value.get(this.key) ?? [];
    if (nextValue !== this._value) {
      this._value = nextValue;
      this.invalidateDependents();
    }
  }

  get value(): V[] {
    return this._value;
  }
}

class GroupByNode<T, K, V> extends InternalReactiveValue<IMap<K, V[]>> {
  private _value: IMap<K, V[]>;
  readonly graph: Graph;
  private readonly source: InternalReactiveValue<T[]>;
  private readonly selectNodes: WeakCache<K, SelectNode<K, V>>;

  constructor(
    source: ReactiveValue<T[]>,
    private readonly getKey: (event: T) => K,
    private readonly getValue: (event: T) => V,
    graph: Graph,
  ) {
    super();
    this.graph = graph;
    this.source = source.resolve((sourceNode) => this.trackInput(sourceNode));
    this._value = IMap();
    this.selectNodes = new WeakCache();
    graph.addValue(this);
    this.step();
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

    if (!this._value.equals(grouped)) {
      this._value = grouped;
      this.invalidateDependents();
    }
  }

  selectNode(key: K): SelectNode<K, V> {
    let node = this.selectNodes.get(key);
    if (node === undefined || node.isDisposed) {
      node = new SelectNode(this.graph, this, key);
      this.selectNodes.set(key, node);
    }
    return node;
  }

  get value(): IMap<K, V[]> {
    return this._value;
  }
}

class GroupByStream<T, K, V> extends ReactiveValue<IMap<K, V[]>> {
  private readonly groupNode: GroupByNode<T, K, V>;
  private readonly selectWrappers: WeakCache<K, ReactiveValue<V[]>>;

  constructor(
    source: ReactiveValue<T[]>,
    getKey: (event: T) => K,
    getValue: (event: T) => V,
    graph: Graph,
  ) {
    const groupNode = new GroupByNode(source, getKey, getValue, graph);
    super(groupNode);
    this.groupNode = groupNode;
    this.selectWrappers = new WeakCache();
  }

  select(key: K): ReactiveValue<V[]> {
    let wrapper = this.selectWrappers.get(key);
    if (wrapper === undefined || wrapper.isReleased) {
      const node = this.groupNode.selectNode(key);
      wrapper = ReactiveValue.fromNode(node);
      this.selectWrappers.set(key, wrapper);
    }
    return wrapper;
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
