export type DiffNode = {
  type: "added" | "removed" | "changed" | "unchanged";
  value?: any;
  oldValue?: any;
  children?: Record<string, DiffNode>;
};

export function computeJsonDiff(oldVal: any, newVal: any): DiffNode {
  // If both are objects (and not null)
  if (
    oldVal !== null &&
    newVal !== null &&
    typeof oldVal === "object" &&
    typeof newVal === "object"
  ) {
    const isOldArray = Array.isArray(oldVal);
    const isNewArray = Array.isArray(newVal);

    if (isOldArray !== isNewArray) {
      return { type: "changed", oldValue: oldVal, value: newVal };
    }

    const children: Record<string, DiffNode> = {};
    const allKeys = new Set([...Object.keys(oldVal), ...Object.keys(newVal)]);
    let allUnchanged = true;

    for (const key of allKeys) {
      const hasOld = key in oldVal;
      const hasNew = key in newVal;

      if (hasOld && hasNew) {
        const childDiff = computeJsonDiff(oldVal[key], newVal[key]);
        children[key] = childDiff;
        if (childDiff.type !== "unchanged") allUnchanged = false;
      } else if (hasOld) {
        children[key] = createDiffTree(oldVal[key], "removed");
        allUnchanged = false;
      } else {
        children[key] = createDiffTree(newVal[key], "added");
        allUnchanged = false;
      }
    }

    return {
      type: allUnchanged ? "unchanged" : "changed",
      children,
    };
  }

  // Primitive leaves
  if (oldVal === newVal) {
    return { type: "unchanged", value: newVal };
  }

  return { type: "changed", oldValue: oldVal, value: newVal };
}

function createDiffTree(val: any, type: "added" | "removed"): DiffNode {
  if (val !== null && typeof val === "object") {
    const children: Record<string, DiffNode> = {};
    for (const key of Object.keys(val)) {
      children[key] = createDiffTree(val[key], type);
    }
    return { type, children };
  }
  return { type, value: val };
}
