import type { PatternDocument } from "../domain/pattern";

const STORAGE_KEY = "easypingmake.patterns.v1";

function getStorage(storage?: Storage): Storage | null {
  if (storage) {
    return storage;
  }

  return typeof window === "undefined" ? null : window.localStorage;
}

export function readPatterns(storage?: Storage): PatternDocument[] {
  const target = getStorage(storage);
  if (!target) {
    return [];
  }

  try {
    const raw = target.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PatternDocument[]) : [];
  } catch {
    return [];
  }
}

export function savePattern(pattern: PatternDocument, storage?: Storage): PatternDocument[] {
  const target = getStorage(storage);
  const patterns = readPatterns(target ?? undefined).filter((item) => item.id !== pattern.id);
  const next = [pattern, ...patterns];

  target?.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function deletePattern(id: string, storage?: Storage): PatternDocument[] {
  const target = getStorage(storage);
  const next = readPatterns(target ?? undefined).filter((item) => item.id !== id);
  target?.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
