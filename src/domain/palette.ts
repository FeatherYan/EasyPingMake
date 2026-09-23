import mapping from "../../data/colorSystemMapping.json";

export const MARD221_PALETTE_ID = "MARD221" as const;

export const MARD221_GROUP_COUNTS = {
  A: 26,
  B: 32,
  C: 29,
  D: 26,
  E: 24,
  F: 25,
  G: 21,
  H: 23,
  M: 15,
} as const;

export type Mard221Group = keyof typeof MARD221_GROUP_COUNTS;

export interface PaletteColor {
  code: string;
  hex: string;
}

type MappingEntry = Record<string, string>;
type ColorMapping = Record<string, MappingEntry>;

const colorMapping = mapping as ColorMapping;

function isMard221Code(code: string): code is `${Mard221Group}${number}` {
  const match = /^([A-Z]+)(\d+)$/.exec(code);
  if (!match) {
    return false;
  }

  const group = match[1] as Mard221Group;
  const number = Number(match[2]);
  const expectedCount = MARD221_GROUP_COUNTS[group];

  return expectedCount !== undefined && number >= 1 && number <= expectedCount;
}

function compareMardCodes(a: string, b: string): number {
  const groupOrder = Object.keys(MARD221_GROUP_COUNTS) as Mard221Group[];
  const aMatch = /^([A-Z]+)(\d+)$/.exec(a);
  const bMatch = /^([A-Z]+)(\d+)$/.exec(b);

  if (!aMatch || !bMatch) {
    return a.localeCompare(b);
  }

  const groupDifference = groupOrder.indexOf(aMatch[1] as Mard221Group) - groupOrder.indexOf(bMatch[1] as Mard221Group);
  return groupDifference || Number(aMatch[2]) - Number(bMatch[2]);
}

export function loadMard221Palette(source: ColorMapping = colorMapping): PaletteColor[] {
  const palette = Object.entries(source)
    .map(([hex, brands]) => ({ code: brands.MARD, hex: hex.toUpperCase() }))
    .filter((color): color is PaletteColor => Boolean(color.code) && isMard221Code(color.code))
    .sort((a, b) => compareMardCodes(a.code, b.code));

  const expectedCount = Object.values(MARD221_GROUP_COUNTS).reduce((sum, count) => sum + count, 0);
  if (palette.length !== expectedCount) {
    throw new Error(`MARD221 色板数据应包含 ${expectedCount} 个色号，实际得到 ${palette.length} 个。`);
  }

  return palette;
}

export function getMard221Color(code: string, palette = loadMard221Palette()): PaletteColor {
  const color = palette.find((item) => item.code === code);
  if (!color) {
    throw new Error(`未找到 MARD221 色号：${code}`);
  }
  return color;
}
