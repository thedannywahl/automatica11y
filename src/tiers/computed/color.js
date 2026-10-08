/**
 * Color math for the computed tier. Colors are `[r, g, b, a]` with r, g, and b from 0 to 255 and a from 0 to 1.
 * The page turns every CSS color into this form (see measure-kit.js), so this file never parses CSS.
 */

/** Relative luminance of an opaque color, as WCAG defines it. */
export function luminance([r, g, b]) {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Lay `top` over an opaque `under` color. The result is opaque. */
export function composite(top, under) {
  const a = top[3];
  return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1);
}

/** WCAG contrast ratio between two opaque colors, from 1 to 21. */
export function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Contrast of a possibly translucent foreground over an opaque background. */
export function contrastOver(fg, bg) {
  return contrastRatio(composite(fg, bg), bg);
}

/** The ratio text needs: 3 for large text (24px, or 18.66px and bold), and 4.5 for the rest. */
export function textThreshold(sizePx, weight) {
  return sizePx >= 24 || (sizePx >= 18.66 && Number(weight) >= 700) ? 3 : 4.5;
}

/** "4.52:1". The ratio is cut down, never rounded up, so 2.999 never reads as 3. */
export function formatRatio(ratio) {
  return `${(Math.floor(ratio * 100) / 100).toFixed(2).replace(/\.?0+$/, "")}:1`;
}
