export function forwardingProxy<T extends object>(initial: T) {
  let target = initial;
  const proxy = new Proxy({} as T, {
    get(_, prop, receiver) { return Reflect.get(target, prop, receiver); },
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
    apply(_, thisArg, args) { return Reflect.apply(target as Function, thisArg, args); },
    construct(_, args, newTarget) { return Reflect.construct(target as Function, args, newTarget); },
  });
  return { proxy, setTarget(t: T) { target = t; } };
}
