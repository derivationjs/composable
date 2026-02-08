import { List, Map as IMap } from "immutable";
import { Log } from "./log.js";
import type { ListOperations, ListCommand } from "./list-operations.js";
import type { MapOperations, MapCommand } from "./map-operations.js";
import type { LogOperations } from "./log-operations.js";
import type { PrimitiveOperations } from "./primitive-operations.js";
import type { TupleOperations, TupleCommand } from "./tuple-operations.js";
import type { Tuple } from "./tuple.js";

/**
 * Base interface for operations on an immutable data structure T.
 *
 * Provides the command algebra for manipulating values of type T.
 * Commands are represented as `unknown` since TypeScript lacks associated types.
 */
export interface OperationsBase<T, C> {
  mergeCommands(firstCommand: C, secondCommand: C): C;

  apply(state: T, command: C): T;
  replaceCommand(value: T): C;
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
    : [T] extends [Log<infer X>]
      ? LogOperations<X>
      : [T] extends [Tuple<infer X extends readonly unknown[]>]
        ? TupleOperations<X>
        : PrimitiveOperations<T & NonNullable<unknown>>;

export type Changes<T> = [T] extends [List<infer X>]
  ? ListCommand<X>[] | null
  : [T] extends [IMap<infer K, infer V>]
    ? MapCommand<K, V>[] | null
    : [T] extends [Log<infer X>]
      ? X[] | null
      : [T] extends [Tuple<infer X extends readonly unknown[]>]
        ? TupleCommand<X> | null
        : T | null;

/**
 * Resolves to T when T is not a known collection type, never otherwise.
 * Used to prevent passing collection types where primitive keys are expected.
 */
export type Primitive<T> = [T] extends [List<any>]
  ? never
  : [T] extends [IMap<any, any>]
    ? never
    : [T] extends [Log<any>]
      ? never
      : [T] extends [Tuple<any>]
        ? never
        : T;

/**
 * Convert an Operations<T> to OperationsBase<T> for use in generic contexts.
 */
export function asBase<T>(ops: Operations<T>): OperationsBase<T, Changes<T>> {
  return ops as OperationsBase<T, Changes<T>>;
}
