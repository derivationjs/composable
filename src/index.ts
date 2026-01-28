// Core data structures
export { ZSet, type ZSetEntry } from "./z-set.js";
export { ZMap, type ZMapEntry } from "./z-map.js";
export { Log } from "./log.js";
export { Tuple } from "./tuple.js";

// Operations and base interfaces
export { type OperationsBase, type Operations, asBase } from "./operations.js";
export { PrimitiveOperations } from "./primitive-operations.js";
export { SetOperations, type SetCommand } from "./set-operations.js";
export { MapOperations, type MapCommand } from "./map-operations.js";
export { ListOperations, type ListCommand } from "./list-operations.js";
export { ZSetOperations, type ZSetCommand } from "./z-set-operations.js";
export { ZMapOperations, type ZMapCommand } from "./z-map-operations.js";
export { LogOperations, type LogCommand } from "./log-operations.js";

// Reactive
export { Reactive } from "./reactive.js";

// ZSet reactive operations
export {
  groupByZSet,
  filterZSet,
  mapZSet,
  unionZSet,
  intersectionZSet,
  differenceZSet,
  productZSet,
} from "./z-set-reactive.js";

// ZMap reactive operations
export {
  joinZMap,
  mapValuesZMap,
  flattenZMap,
  filterZMap as filterZMapReactive,
  unionZMap as unionZMapReactive,
  intersectionZMap as intersectionZMapReactive,
  differenceZMap as differenceZMapReactive,
} from "./z-map-reactive.js";

// Log reactive operations
export { foldLog, lengthLog } from "./log-reactive.js";

// List reactive operations
export { sequenceList, mapList } from "./list-reactive.js";

// Map reactive operations
export { sequenceMap, mapMap } from "./map-reactive.js";

// Filter and group operations
export { filterList } from "./filter-list.js";
export { groupByList } from "./group-by-list.js";

// Join operations
export { joinZSet } from "./join-z-set.js";

// Change inputs
export { ZSetChangeInput } from "./z-set-change-input.js";
export { ZMapChangeInput } from "./z-map-change-input.js";
export { LogChangeInput } from "./log-change-input.js";
