import { ReactiveValue, Graph } from "derivation";
import { Operations } from "./operations.js";

/**
 * Reactive wraps an immutable data structure T and provides
 * reactive access to its state through a derivation graph.
 */
export class Reactive<T> {
  readonly materialized: ReactiveValue<T>;
  readonly previousMaterialized: ReactiveValue<T>;
  readonly changes: ReactiveValue<unknown>;

  constructor(
    materialized: ReactiveValue<T>,
    previousMaterialized: ReactiveValue<T>,
    changes: ReactiveValue<unknown>,
  ) {
    this.materialized = materialized;
    this.previousMaterialized = previousMaterialized;
    this.changes = changes;
  }

  /**
   * Current snapshot (synchronous access)
   */
  get snapshot(): T {
    return this.materialized.value;
  }

  /**
   * Previous snapshot
   */
  get previousSnapshot(): T {
    return this.previousMaterialized.value;
  }

  /**
   * Create a new Reactive from an Operations instance and a command stream
   */
  static create<T>(
    graph: Graph,
    operations: Operations<T>,
    changes: ReactiveValue<unknown>,
    initial: T,
  ): Reactive<T> {
    // Accumulate commands into materialized state
    const materialized = changes.accumulate(initial, (state, command) => {
      return operations.apply(state, command);
    });

    // Track previous materialized state
    const previousMaterialized = materialized.delay(initial);

    return new Reactive(materialized, previousMaterialized, changes);
  }
}
