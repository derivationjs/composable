import { List } from "immutable";

export interface Tuple<T extends readonly unknown[]> {
  get<I extends keyof T & number>(index: I): T[I];
  set<I extends keyof T & number>(index: I, value: T[I]): Tuple<T>;
}

export function Tuple<T extends readonly unknown[]>(...values: T): Tuple<T> {
  return List(values) as Tuple<T>;
}
