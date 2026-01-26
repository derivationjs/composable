import { ZMap } from "./z-map.js";
import { Map as IMap, isMap } from "immutable";
import { Tuple } from "./tuple.js";

export type ZSetEntry<T> = readonly [item: T, weight: number];

export class ZSet<T> {
  private readonly entries: IMap<T, number>;

  constructor(entries?: IMap<T, number> | Iterable<readonly [T, number]>) {
    if (entries === undefined) {
      this.entries = IMap<T, number>([]);
    } else if (isMap(entries)) {
      this.entries = entries as IMap<T, number>;
    } else {
      this.entries = IMap<T, number>(entries);
    }
  }

  isEmpty(): boolean {
    return this.entries.size === 0;
  }

  get length(): number {
    return this.entries.size;
  }

  get(item: T): number {
    return this.entries.get(item) ?? 0;
  }

  *getEntries(): IterableIterator<ZSetEntry<T>> {
    for (const [item, weight] of this.entries) {
      yield [item, weight] as const;
    }
  }

  add(item: T, weight = 1): ZSet<T> {
    if (weight === 0) return this;

    const cur = this.entries.get(item) ?? 0;
    const updated = cur + weight;

    const next =
      updated === 0
        ? this.entries.delete(item)
        : this.entries.set(item, updated);

    return next === this.entries ? this : new ZSet(next);
  }

  remove(item: T, weight = 1): ZSet<T> {
    return this.add(item, -weight);
  }

  union(other: ZSet<T>): ZSet<T> {
    if (other.entries.size === 0) return this;

    let result = this.entries;
    for (const [item, w] of other.entries) {
      if (w === 0) continue;

      const cur = result.get(item) ?? 0;
      const updated = cur + w;

      if (updated === 0) result = result.delete(item);
      else result = result.set(item, updated);
    }

    return result === this.entries ? this : new ZSet(result);
  }

  intersection(other: ZSet<T>): ZSet<T> {
    if (this.entries.size === 0 || other.entries.size === 0)
      return new ZSet<T>();

    let result = IMap<T, number>();
    for (const [item, weight1] of this.entries) {
      const weight2 = other.entries.get(item);
      if (weight2 !== undefined) {
        const product = weight1 * weight2;
        if (product !== 0) result = result.set(item, product);
      }
    }

    return new ZSet(result);
  }

  difference(other: ZSet<T>): ZSet<T> {
    if (other.entries.size === 0) return this;

    let result = this.entries;
    for (const [item, weight] of other.entries) {
      const current = result.get(item);
      if (current !== undefined) {
        const diff = current - weight;
        if (diff === 0) result = result.delete(item);
        else result = result.set(item, diff);
      } else if (weight !== 0) {
        result = result.set(item, -weight);
      }
    }

    return result === this.entries ? this : new ZSet(result);
  }

  filter(pred: (t: T) => boolean): ZSet<T> {
    let result = IMap<T, number>();
    for (const [item, weight] of this.entries) {
      if (pred(item)) {
        result = result.set(item, weight);
      }
    }

    return result.size === this.entries.size ? this : new ZSet(result);
  }

  product<A>(other: ZSet<A>): ZSet<Tuple<[T, A]>> {
    let result = IMap<Tuple<[T, A]>, number>();

    for (const [xItem, xWeight] of this.entries) {
      for (const [yItem, yWeight] of other.entries) {
        const w = xWeight * yWeight;
        if (w === 0) continue;

        const key = Tuple(xItem, yItem);
        const prev = result.get(key);
        const upd = (prev ?? 0) + w;

        if (upd === 0) result = result.delete(key);
        else result = result.set(key, upd);
      }
    }

    return new ZSet(result);
  }

  groupBy<K>(func: (t: T) => K): ZMap<K, T> {
    let result = new ZMap<K, T>();

    for (const [item, weight] of this.entries) {
      result = result.add(func(item), item, weight);
    }

    return result;
  }

  map<A>(func: (t: T) => A): ZSet<A> {
    let result = new ZSet<A>();

    for (const [item, weight] of this.entries) {
      result = result.add(func(item), weight);
    }

    return result;
  }

  toString(): string {
    return `ZSet(${this.entries.size})`;
  }

  toArray(): ZSetEntry<T>[] {
    return [...this.getEntries()];
  }
}
