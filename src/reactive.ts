import { ReactiveValue, Graph } from "derivation";
import { Operations, Changes, asBase } from "./operations.js";

/**
 * Reactive wraps an immutable data structure T and provides
 * reactive access to its state through a derivation graph.
 */
export class Reactive<T> {
  readonly materialized: ReactiveValue<T>;
  readonly previousMaterialized: ReactiveValue<T>;
  readonly changes: ReactiveValue<Changes<T>>;
  readonly operations: Operations<T>;

  constructor(
    materialized: ReactiveValue<T>,
    previousMaterialized: ReactiveValue<T>,
    changes: ReactiveValue<Changes<T>>,
    operations: Operations<T>,
  ) {
    this.materialized = materialized;
    this.previousMaterialized = previousMaterialized;
    this.changes = changes;
    this.operations = operations;
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
   * Create a new Reactive from an Operations instance and a command stream.
   * Uses a separate C type parameter so that callers inside generic functions
   * don't need the Changes<T> conditional type to resolve.
   */
  static create<T>(
    graph: Graph,
    operations: Operations<T>,
    changes: ReactiveValue<Changes<T>>,
    initial: T,
  ): Reactive<T> {
    const ops = asBase(operations);
    // Accumulate commands into materialized state
    const materialized = changes.accumulate(initial, (state, command) => {
      if (command == null) {
        return state;
      } else {
        return ops.apply(state, command);
      }
    });

    // Track previous materialized state
    const previousMaterialized = materialized.delay(initial);

    return new Reactive(
      materialized,
      previousMaterialized,
      changes,
      operations,
    );
  }
}
