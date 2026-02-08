export class WeakCache<K, V extends object> {
  private readonly map: Map<K, WeakRef<V>>;
  private readonly registry: FinalizationRegistry<K>;

  constructor() {
    this.map = new Map();
    this.registry = new FinalizationRegistry((key: K) => {
      this.map.delete(key);
    });
  }

  get(key: K): V | undefined {
    const ref = this.map.get(key);
    return ref?.deref();
  }

  set(key: K, value: V): void {
    const existing = this.map.get(key);
    if (existing) {
      this.registry.unregister(existing);
    }
    const ref = new WeakRef(value);
    this.map.set(key, ref);
    this.registry.register(value, key, ref);
  }

  has(key: K): boolean {
    const ref = this.map.get(key);
    return ref?.deref() !== undefined;
  }

  delete(key: K): boolean {
    const ref = this.map.get(key);
    if (ref) {
      this.registry.unregister(ref);
      return this.map.delete(key);
    }
    return false;
  }

  *[Symbol.iterator](): IterableIterator<[K, V]> {
    for (const [key, ref] of this.map) {
      const value = ref.deref();
      if (value !== undefined) {
        yield [key, value];
      }
    }
  }
}
