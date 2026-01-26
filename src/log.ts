import { List } from "immutable";

/**
 * An append-only log backed by an immutable List.
 * Once entries are added, they cannot be modified or removed.
 */
export class Log<T> {
  private readonly entries: List<T>;

  constructor(entries?: List<T> | Iterable<T>) {
    if (entries === undefined) {
      this.entries = List<T>();
    } else if (List.isList(entries)) {
      this.entries = entries as List<T>;
    } else {
      this.entries = List<T>(entries);
    }
  }

  get length(): number {
    return this.entries.size;
  }

  isEmpty(): boolean {
    return this.entries.isEmpty();
  }

  get(index: number): T | undefined {
    return this.entries.get(index);
  }

  append(value: T): Log<T> {
    return new Log(this.entries.push(value));
  }

  *[Symbol.iterator](): IterableIterator<T> {
    yield* this.entries;
  }

  toArray(): T[] {
    return this.entries.toArray();
  }

  toList(): List<T> {
    return this.entries;
  }

  toString(): string {
    return `Log(${this.entries.size})`;
  }
}
