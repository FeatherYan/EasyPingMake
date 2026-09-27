export const DARK_COLOR_TEXT = "#1e293b";
export const LIGHT_COLOR_TEXT = "#ffffff";
export const DIMMED_COLOR_OPACITY = 0.5;

function toLinearChannel(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.03928
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

/** Returns the more readable label color for a six-digit HEX background. */
export function getReadableTextColor(hex: string): string {
  const normalized = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) {
    return DARK_COLOR_TEXT;
  }

  const red = toLinearChannel(Number.parseInt(normalized.slice(0, 2), 16));
  const green = toLinearChannel(Number.parseInt(normalized.slice(2, 4), 16));
  const blue = toLinearChannel(Number.parseInt(normalized.slice(4, 6), 16));
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  const darkTextContrast = (luminance + 0.05) / 0.05;
  const lightTextContrast = 1.05 / (luminance + 0.05);

  return darkTextContrast >= lightTextContrast ? DARK_COLOR_TEXT : LIGHT_COLOR_TEXT;
}

/**
 * Returns the display opacity for a color while another color is highlighted.
 * A missing highlight leaves every color fully visible; non-matching colors are
 * softened so the selected color can be located without changing its fill.
 */
export function getColorDisplayOpacity(code: string, highlightCode: string | null): number {
  if (!highlightCode || code === highlightCode) {
    return 1;
  }
  return DIMMED_COLOR_OPACITY;
}
