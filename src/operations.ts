import { List, Map as IMap, Set as ISet } from "immutable";
import { ZSet } from "./z-set.js";
import { ZMap } from "./z-map.js";
import { Log } from "./log.js";
import type { ListOperations } from "./list-operations.js";
import type { MapOperations } from "./map-operations.js";
import type { SetOperations } from "./set-operations.js";
import type { ZSetOperations } from "./z-set-operations.js";
import type { ZMapOperations } from "./z-map-operations.js";
import type { LogOperations } from "./log-operations.js";
import type { PrimitiveOperations } from "./primitive-operations.js";

/**
 * Base interface for operations on an immutable data structure T.
 *
 * Provides the command algebra for manipulating values of type T.
 * Commands are represented as `unknown` since TypeScript lacks associated types.
 */
export interface OperationsBase<T> {
  emptyCommand(): unknown;
  isEmpty(command: unknown): boolean;
  mergeCommands(firstCommand: unknown, secondCommand: unknown): unknown;

  apply(state: T, command: unknown): T;
}

/**
 * Operations type that maps data structures to their concrete operation classes.
 * This allows extracting inner operations from composite types.
 *
 * Wraps T in [T] to prevent distributive conditional types (so boolean doesn't become true | false).
 */
export type Operations<T> = [T] extends [List<infer X>]
  ? ListOperations<X>
  : [T] extends [IMap<infer K, infer V>]
    ? MapOperations<K, V>
    : [T] extends [ISet<infer X>]
      ? SetOperations<X>
      : [T] extends [ZSet<infer X>]
        ? ZSetOperations<X>
        : [T] extends [ZMap<infer K, infer V>]
          ? ZMapOperations<K, V>
          : [T] extends [Log<infer X>]
            ? LogOperations<X>
            : PrimitiveOperations<T & NonNullable<unknown>>;

/**
 * Convert an Operations<T> to OperationsBase<T> for use in generic contexts.
 */
export function asBase<T>(ops: Operations<T>): OperationsBase<T> {
  return ops as OperationsBase<T>;
}
