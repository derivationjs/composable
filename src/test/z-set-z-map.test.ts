import { describe, it, expect } from "vitest";
import { ZMap } from "../z-map.js";
import { ZSet } from "../z-set.js";

function sortPairs<T>(
  xs: ReadonlyArray<readonly [T, number]>,
): Array<readonly [T, number]> {
  return [...xs].sort(
    (a, b) => String(a[0]).localeCompare(String(b[0])) || a[1] - b[1],
  );
}

function sortTriples<K, V>(
  xs: ReadonlyArray<readonly [K, V, number]>,
): Array<readonly [K, V, number]> {
  return [...xs].sort((a, b) => {
    const c1 = String(a[0]).localeCompare(String(b[0]));
    if (c1 !== 0) return c1;
    const c2 = String(a[1]).localeCompare(String(b[1]));
    if (c2 !== 0) return c2;
    return a[2] - b[2];
  });
}

describe("ZSet", () => {
  it("add/remove cancels to zero and deletes entries", () => {
    let s = new ZSet<string>();

    s = s.add("a", 2);
    s = s.add("a", -1);
    expect(s.get("a")).toBe(1);

    s = s.remove("a", 1);
    expect(s.get("a")).toBe(0);
    expect(s.isEmpty()).toBe(true);
  });

  it("weight 0 is a no-op", () => {
    let s = new ZSet<string>();
    s = s.add("a", 0);
    expect(s.get("a")).toBe(0);
    expect(s.isEmpty()).toBe(true);
  });

  it("merge mutates, union returns new", () => {
    let a = new ZSet<string>();
    a = a.add("x", 1);

    let b = new ZSet<string>();
    b = b.add("x", 2);
    b = b.add("y", 3);

    const u = a.union(b);
    expect(sortPairs([...u.getEntries()])).toEqual(
      sortPairs([
        ["x", 3],
        ["y", 3],
      ]),
    );
  });

  it("product forms cartesian product with multiplied weights", () => {
    let a = new ZSet<string>();
    a = a.add("a", 2);
    a = a.add("b", -1);

    let b = new ZSet<number>();
    b = b.add(10, 3);

    const p = a.product(b);
    const got = [...p.getEntries()].map(
      ([k, w]) => [`${k.get(0)}:${k.get(1)}`, w] as const,
    );
    expect(sortPairs(got)).toEqual(
      sortPairs([
        ["a:10", 6],
        ["b:10", -3],
      ]),
    );
  });

  it("groupBy builds a ZMap of items to weights", () => {
    let s = new ZSet<string>();
    s = s.add("apple", 2);
    s = s.add("apricot", 1);
    s = s.add("banana", 3);

    const m = s.groupBy((x) => x[0]);

    expect(m.getValue("a", "apple")).toBe(2);
    expect(m.getValue("a", "apricot")).toBe(1);
    expect(m.getValue("b", "banana")).toBe(3);
    expect(m.getValue("b", "apple")).toBe(0);
  });

  it("map maps values and preserves weights", () => {
    let s = new ZSet<string>();
    s = s.add("aa", 2);
    s = s.add("bbb", -1);

    const t = s.map((x) => x.length);
    expect(sortPairs([...t.getEntries()])).toEqual(
      sortPairs([
        [2, 2],
        [3, -1],
      ]),
    );
  });

  it("intersection multiplies weights for matching items", () => {
    let a = new ZSet<string>();
    a = a.add("x", 3);
    a = a.add("y", 2);

    let b = new ZSet<string>();
    b = b.add("x", 4);
    b = b.add("z", 5);

    const i = a.intersection(b);
    expect(sortPairs([...i.getEntries()])).toEqual(sortPairs([["x", 12]]));
  });

  it("intersection with negative weights", () => {
    let a = new ZSet<string>();
    a = a.add("x", -2);
    a = a.add("y", 3);

    let b = new ZSet<string>();
    b = b.add("x", 4);
    b = b.add("y", -1);

    const i = a.intersection(b);
    expect(sortPairs([...i.getEntries()])).toEqual(
      sortPairs([
        ["x", -8],
        ["y", -3],
      ]),
    );
  });

  it("difference subtracts weights", () => {
    let a = new ZSet<string>();
    a = a.add("x", 5);
    a = a.add("y", 2);

    let b = new ZSet<string>();
    b = b.add("x", 3);
    b = b.add("z", 1);

    const d = a.difference(b);
    expect(sortPairs([...d.getEntries()])).toEqual(
      sortPairs([
        ["x", 2],
        ["y", 2],
        ["z", -1],
      ]),
    );
  });

  it("filter keeps matching items with weights", () => {
    let s = new ZSet<string>();
    s = s.add("apple", 2);
    s = s.add("apricot", 1);
    s = s.add("banana", 3);

    const f = s.filter((x) => x.startsWith("a"));
    expect(sortPairs([...f.getEntries()])).toEqual(
      sortPairs([
        ["apple", 2],
        ["apricot", 1],
      ]),
    );
  });
});

describe("ZMap", () => {
  it("add/remove cancels and deletes empty rows", () => {
    let m = new ZMap<string, string>();

    m = m.add("k", "a", 2);
    m = m.add("k", "a", -2);

    expect(m.getValue("k", "a")).toBe(0);

    const entries = [...m.getEntries()];
    expect(entries.length).toBe(0);
  });

  it("union returns a new map", () => {
    let a = new ZMap<string, string>();
    a = a.add("x", "a", 1);

    let b = new ZMap<string, string>();
    b = b.add("x", "a", 2);

    const u = a.union(b);

    expect(sortTriples([...u.getEntries()])).toEqual(
      sortTriples([["x", "a", 3]]),
    );

    expect(sortTriples([...a.getEntries()])).toEqual(
      sortTriples([["x", "a", 1]]),
    );
  });

  it("join matches keys and produces product of row zsets", () => {
    let left = new ZMap<string, string>();
    left = left.add("k1", "a", 2);
    left = left.add("k1", "b", 1);
    left = left.add("k2", "c", 5);

    let right = new ZMap<string, number>();
    right = right.add("k1", 10, 3);
    right = right.add("k3", 20, 7);

    const joined = left.join(right);

    const got = [...joined.getEntries()].map(
      ([k, pair, w]) => [k, `${pair.get(0)}:${pair.get(1)}`, w] as const,
    );

    expect(sortTriples(got)).toEqual(
      sortTriples([
        ["k1", "a:10", 6],
        ["k1", "b:10", 3],
      ]),
    );
  });

  it("mapValues maps row items and preserves weights", () => {
    let m = new ZMap<string, string>();
    m = m.add("k", "aa", 2);
    m = m.add("k", "bbb", -1);

    const mapped = m.mapValues((s) => s.length);

    expect(sortTriples([...mapped.getEntries()])).toEqual(
      sortTriples([
        ["k", 2, 2],
        ["k", 3, -1],
      ]),
    );
  });

  it("flatten merges all rows into one set", () => {
    let m = new ZMap<string, string>();
    m = m.add("k1", "a", 2);
    m = m.add("k2", "a", 3);
    m = m.add("k2", "b", 1);

    const flat = m.flatten();
    expect(sortPairs([...flat.getEntries()])).toEqual(
      sortPairs([
        ["a", 5],
        ["b", 1],
      ]),
    );
  });

  it("constructors accept iterables and Immutable Maps", () => {
    const z1 = new ZSet(new Map([[1, 2]]));
    const z2 = new ZSet([[2, 3]]);
    expect(z1.get(1)).toBe(2);
    expect(z2.get(2)).toBe(3);

    const zm1 = new ZMap<string, number>(new Map([["a", new ZSet([[1, 5]])]]));
    const zm2 = new ZMap<string, number>([["b", new ZSet([[2, 6]])]]);
    expect(zm1.getValue("a", 1)).toBe(5);
    expect(zm2.getValue("b", 2)).toBe(6);
  });

  it("ZSet.addSet and add remove zero-weight entries correctly", () => {
    let zm = new ZMap<string, number>();
    const zs = new ZSet<number>().add(10, 1).add(10, -1);
    zm = zm.addSet("k", zs);
    expect([...zm.getEntries()].length).toBe(0);

    let z = new ZSet<number>();
    z = z.add(1, 0);
    expect(z.isEmpty()).toBe(true);
  });

  it("ZMap.flatten merges multiple rows", () => {
    let zm = new ZMap<string, string>();
    zm = zm.add("x", "a", 1);
    zm = zm.add("y", "a", 2);
    const flat = zm.flatten();
    const entries = [...flat.getEntries()];
    expect(entries).toContainEqual(["a", 3]);
  });

  it("ZSet.map maps to new type correctly", () => {
    let zs = new ZSet<string>();
    zs = zs.add("abc", 2);
    const mapped = zs.map((x) => x.length);
    expect([...mapped.getEntries()]).toContainEqual([3, 2]);
  });

  it("ZMap.intersection multiplies weights for matching keys and values", () => {
    let a = new ZMap<string, string>();
    a = a.add("k1", "x", 2);
    a = a.add("k1", "y", 3);
    a = a.add("k2", "z", 1);

    let b = new ZMap<string, string>();
    b = b.add("k1", "x", 4);
    b = b.add("k1", "w", 5);
    b = b.add("k3", "z", 2);

    const i = a.intersection(b);
    expect(sortTriples([...i.getEntries()])).toEqual(
      sortTriples([["k1", "x", 8]]),
    );
  });

  it("ZMap.difference subtracts weights", () => {
    let a = new ZMap<string, string>();
    a = a.add("k1", "x", 5);
    a = a.add("k1", "y", 2);

    let b = new ZMap<string, string>();
    b = b.add("k1", "x", 3);
    b = b.add("k2", "z", 1);

    const d = a.difference(b);
    expect(sortTriples([...d.getEntries()])).toEqual(
      sortTriples([
        ["k1", "x", 2],
        ["k1", "y", 2],
        ["k2", "z", -1],
      ]),
    );
  });

  it("ZMap.filter filters by key and value", () => {
    let m = new ZMap<string, number>();
    m = m.add("k1", 10, 2);
    m = m.add("k1", 5, 1);
    m = m.add("k2", 15, 3);

    const f = m.filter((k, v) => k === "k1" && v > 7);
    expect(sortTriples([...f.getEntries()])).toEqual(
      sortTriples([["k1", 10, 2]]),
    );
  });
});
