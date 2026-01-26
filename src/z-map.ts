import { ZSet } from "./z-set.js";
import { Map as IMap, isMap } from "immutable";
import { Tuple } from "./tuple.js";

export type ZMapEntry<K, V> = readonly [k1: K, k2: V, weight: number];

export class ZMap<K, V> {
  private readonly entries: IMap<K, ZSet<V>>;

  constructor(entries?: IMap<K, ZSet<V>> | Iterable<readonly [K, ZSet<V>]>) {
    if (entries === undefined) {
      this.entries = IMap<K, ZSet<V>>();
    } else if (isMap(entries)) {
      this.entries = entries as IMap<K, ZSet<V>>;
    } else {
      this.entries = IMap<K, ZSet<V>>(entries);
    }
  }

  isEmpty(): boolean {
    return this.entries.size === 0;
  }

  get length(): number {
    let count = 0;
    for (const [, zset] of this.entries) {
      count += zset.length;
    }
    return count;
  }

  *getEntries(): IterableIterator<ZMapEntry<K, V>> {
    for (const [k1, zset] of this.entries) {
      for (const [k2, w] of zset.getEntries()) {
        yield [k1, k2, w] as const;
      }
    }
  }

  get(k1: K): ZSet<V> {
    return this.entries.get(k1) ?? new ZSet<V>();
  }

  getValue(k1: K, k2: V): number {
    return this.get(k1).get(k2);
  }

  addSet(k1: K, zset: ZSet<V>): ZMap<K, V> {
    if (zset.isEmpty()) return this;

    const existing = this.entries.get(k1);
    const merged = existing ? zset.union(existing) : zset;

    if (merged.isEmpty()) {
      const next = this.entries.remove(k1);
      return next === this.entries ? this : new ZMap(next);
    } else {
      const next = this.entries.set(k1, merged);
      return next === this.entries ? this : new ZMap(next);
    }
  }

  add(k1: K, k2: V, weight = 1): ZMap<K, V> {
    if (weight === 0) return this;

    let result = this.entries;
    const current = result.get(k1) ?? new ZSet();
    const updated = current.add(k2, weight);

    if (updated.isEmpty()) result = result.remove(k1);
    else result = result.set(k1, updated);

    return result === this.entries ? this : new ZMap(result);
  }

  remove(k1: K, k2: V, weight = 1): ZMap<K, V> {
    return this.add(k1, k2, -weight);
  }

  union(other: ZMap<K, V>): ZMap<K, V> {
    if (other.entries.size === 0) return this;

    let result = this.entries;
    for (const [k1, k2, w] of other.getEntries()) {
      if (w === 0) continue;

      const row = result.get(k1) ?? new ZSet<V>();
      const updated = row.add(k2, w);

      if (updated.isEmpty()) result = result.remove(k1);
      else result = result.set(k1, updated);
    }

    return result === this.entries ? this : new ZMap(result);
  }

  intersection(other: ZMap<K, V>): ZMap<K, V> {
    let result = IMap<K, ZSet<V>>();

    for (const [k, left] of this.entries) {
      const right = other.entries.get(k);
      if (right) {
        const intersected = left.intersection(right);
        if (!intersected.isEmpty()) {
          result = result.set(k, intersected);
        }
      }
    }

    return new ZMap(result);
  }

  difference(other: ZMap<K, V>): ZMap<K, V> {
    if (other.entries.size === 0) return this;

    let result = this.entries;
    for (const [k1, k2, w] of other.getEntries()) {
      if (w === 0) continue;

      const row = result.get(k1) ?? new ZSet<V>();
      const updated = row.add(k2, -w);

      if (updated.isEmpty()) result = result.remove(k1);
      else result = result.set(k1, updated);
    }

    return result === this.entries ? this : new ZMap(result);
  }

  filter(pred: (k: K, v: V) => boolean): ZMap<K, V> {
    let result = IMap<K, ZSet<V>>();
    for (const [k, zset] of this.entries) {
      const filtered = zset.filter((v) => pred(k, v));
      if (!filtered.isEmpty()) {
        result = result.set(k, filtered);
      }
    }
    return new ZMap(result);
  }

  join<V1>(other: ZMap<K, V1>): ZMap<K, Tuple<[V, V1]>> {
    let result = IMap<K, ZSet<Tuple<[V, V1]>>>();

    for (const [k, left] of this.entries) {
      const right = other.entries.get(k);
      if (right) {
        const prod = left.product(right);
        if (!prod.isEmpty()) result = result.set(k, prod);
      }
    }

    return new ZMap(result);
  }

  mapValues<V1>(func: (v: V) => V1): ZMap<K, V1> {
    let result = IMap<K, ZSet<V1>>();
    for (const [k, zset] of this.entries) {
      result = result.set(k, zset.map(func));
    }
    return new ZMap(result);
  }

  flatten(): ZSet<V> {
    let acc = new ZSet<V>();
    for (const [, row] of this.entries) {
      acc = acc.union(row);
    }
    return acc;
  }

  toArray(): ZMapEntry<K, V>[] {
    return [...this.getEntries()];
  }
}
