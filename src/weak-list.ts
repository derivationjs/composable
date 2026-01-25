export class WeakList<T extends object> implements Iterable<T> {
  private items: WeakRef<T>[] = [];

  add(value: T): void {
    this.items.push(new WeakRef(value));
  }

  private popDead(): void {
    while (
      this.items.length > 0 &&
      this.items[this.items.length - 1]!.deref() === undefined
    ) {
      this.items.pop();
    }
  }

  push(value: T): void {
    this.popDead();
    this.items.push(new WeakRef(value));
  }

  pop(): T | undefined {
    while (this.items.length > 0) {
      this.popDead();
      if (this.items.length === 0) return undefined;
      const ref = this.items.pop()!;
      const value = ref.deref();
      if (value !== undefined) {
        this.popDead();
        return value;
      }
    }
    return undefined;
  }

  reverse(): void {
    this.items.reverse();
  }

  isEmpty(): boolean {
    this.popDead();
    return this.items.length === 0;
  }

  *[Symbol.iterator](): Iterator<T> {
    const newItems: WeakRef<T>[] = [];

    for (const ref of this.items) {
      const value = ref.deref();
      if (value !== undefined) {
        yield value;
        newItems.push(ref);
      }
    }

    this.items = newItems;
  }
}
