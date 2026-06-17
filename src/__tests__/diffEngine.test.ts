import { computeJsonDiff } from "../utils/diffEngine";

describe("diffEngine", () => {
  test("should detect identical objects as unchanged", () => {
    const obj1 = { a: 1, b: "hello", c: true };
    const obj2 = { a: 1, b: "hello", c: true };

    const diff = computeJsonDiff(obj1, obj2);
    expect(diff.type).toBe("unchanged");
  });

  test("should detect flat key additions, removals, and changes", () => {
    const oldObj = { a: 1, b: "hello", c: true };
    const newObj = { b: "world", c: true, d: [1, 2] };

    const diff = computeJsonDiff(oldObj, newObj);

    expect(diff.type).toBe("changed");
    expect(diff.children?.a).toEqual({ type: "removed", value: 1 });
    expect(diff.children?.b).toEqual({ type: "changed", oldValue: "hello", value: "world" });
    expect(diff.children?.c).toEqual({ type: "unchanged", value: true });
    expect(diff.children?.d).toEqual({
      type: "added",
      children: {
        "0": { type: "added", value: 1 },
        "1": { type: "added", value: 2 },
      },
    });
  });

  test("should compute deep nested differences", () => {
    const oldObj = {
      user: {
        name: "Alice",
        profile: {
          age: 30,
          city: "New York",
        },
      },
    };

    const newObj = {
      user: {
        name: "Alice",
        profile: {
          age: 31,
          country: "USA",
        },
      },
    };

    const diff = computeJsonDiff(oldObj, newObj);

    expect(diff.type).toBe("changed");
    expect(diff.children?.user.type).toBe("changed");
    expect(diff.children?.user.children?.name.type).toBe("unchanged");
    
    const profileDiff = diff.children?.user.children?.profile;
    expect(profileDiff?.type).toBe("changed");
    expect(profileDiff?.children?.age).toEqual({
      type: "changed",
      oldValue: 30,
      value: 31,
    });
    expect(profileDiff?.children?.city).toEqual({
      type: "removed",
      value: "New York",
    });
    expect(profileDiff?.children?.country).toEqual({
      type: "added",
      value: "USA",
    });
  });

  test("should handle array type mismatches and element diffs", () => {
    const oldObj = { data: [1, 2, 3] };
    const newObj = { data: { count: 3 } };

    const diff = computeJsonDiff(oldObj, newObj);
    expect(diff.children?.data).toEqual({
      type: "changed",
      oldValue: [1, 2, 3],
      value: { count: 3 },
    });
  });
});
