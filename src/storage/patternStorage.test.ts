import { describe, expect, it } from "vitest";
import { createBlankPatternDocument } from "../domain/pattern";
import { deletePattern, readPatterns, savePattern } from "./patternStorage";

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

describe("pattern storage", () => {
  it("saves, updates and deletes local patterns", () => {
    const storage = createMemoryStorage();
    const first = createBlankPatternDocument({ name: "第一张" });
    const updated = { ...first, name: "已重命名" };
    const second = createBlankPatternDocument({ name: "第二张" });

    expect(savePattern(first, storage)).toHaveLength(1);
    expect(savePattern(updated, storage)[0].name).toBe("已重命名");
    expect(savePattern(second, storage)).toHaveLength(2);
    expect(deletePattern(first.id, storage).map((pattern) => pattern.id)).toEqual([second.id]);
    expect(readPatterns(storage).map((pattern) => pattern.name)).toEqual(["第二张"]);
  });
});
