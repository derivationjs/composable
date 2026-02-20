import { hash, is } from "immutable";

/**
 * Cell is the scalar leaf value type for reactive composition.
 */
export class Cell<T extends NonNullable<unknown>> {
  readonly value: T;

  constructor(value: T) {
    this.value = value;
  }

  set(value: T): Cell<T> {
    return new Cell(value);
  }

  map<U extends NonNullable<unknown>>(f: (value: T) => U): Cell<U> {
    return new Cell(f(this.value));
  }

  equals(other: unknown): boolean {
    return other instanceof Cell && is(this.value, other.value);
  }

  hashCode(): number {
    return hash(this.value);
  }
}
