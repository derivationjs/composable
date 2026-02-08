import type { Operations } from "./operations.js";

export type OperationsProxy<T> = Operations<T> & { setTarget(t: Operations<T>): void };

export function operationsProxy<T>(initial: Operations<T>): OperationsProxy<T> {
  let target: object = initial as object;
  const childProxies = new Map<string | symbol, { setTarget(target: unknown): void }>();

  const proxy = new Proxy<object>(target, {
    get(_, prop, receiver) {
      if (prop === "setTarget") {
        return (t: Operations<T>) => {
          target = t as object;
          for (const [childProp, childProxy] of childProxies) {
            const childTarget: unknown = Reflect.get(target, childProp);
            if (childTarget !== undefined) {
              childProxy.setTarget(childTarget);
            }
          }
        };
      }
      if (prop === "valueOperations" || prop === "itemOperations") {
        let child = childProxies.get(prop);
        if (!child) {
          const currentChild: unknown = Reflect.get(target, prop);
          child = operationsProxy((currentChild ?? {}) as Operations<unknown>);
          childProxies.set(prop, child);
        }
        return child;
      }
      return Reflect.get(target, prop, receiver);
    },
    set(_, prop, value, receiver) { return Reflect.set(target, prop, value, receiver); },
    has(_, prop) { return Reflect.has(target, prop); },
    deleteProperty(_, prop) { return Reflect.deleteProperty(target, prop); },
    ownKeys() { return Reflect.ownKeys(target); },
    getOwnPropertyDescriptor(_, prop) { return Reflect.getOwnPropertyDescriptor(target, prop); },
    defineProperty(_, prop, desc) { return Reflect.defineProperty(target, prop, desc); },
    getPrototypeOf() { return Reflect.getPrototypeOf(target); },
    setPrototypeOf(_, proto) { return Reflect.setPrototypeOf(target, proto); },
    isExtensible() { return Reflect.isExtensible(target); },
    preventExtensions() { return Reflect.preventExtensions(target); },
  });
  return proxy as OperationsProxy<T>;
}
