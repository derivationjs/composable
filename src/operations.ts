/**
 * Operations defines how to work with an immutable data structure T.
 *
 * Provides the command algebra for manipulating values of type T.
 * Commands are represented as `unknown` since TypeScript lacks associated types.
 */
export interface Operations<T> {
  emptyCommand(): unknown;
  isEmpty(command: unknown): boolean;
  mergeCommands(firstCommand: unknown, secondCommand: unknown): unknown;

  apply(state: T, command: unknown): T;
}
