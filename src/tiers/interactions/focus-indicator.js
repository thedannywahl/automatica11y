/** @typedef {{ outlineStyle: string, outlineWidth: string, outlineColor: string, boxShadow: string, borderTopStyle: string, borderTopColor: string, borderTopWidth: string, backgroundColor: string, color: string, textDecorationLine: string, rendered: boolean }} FocusPart */

/**
 * Compare the resolved styles of a control with and without keyboard focus, and say which changes can show a focus indicator.
 * A change counts only if a person could see it: an outline with a width and a color, a box shadow, a border, a color change,
 * a text decoration, or an element that appeared inside. An outline offset alone doesn't count, because it moves nothing visible.
 * @param {Record<string, FocusPart>} focused Parts of the focused control, keyed by where they are.
 * @param {Record<string, FocusPart> | undefined} unfocused The same parts without focus.
 * @returns {string[]} Each change, such as `the element: outline`.
 */
export function focusIndicatorChanges(focused, unfocused) {
  const changes = [];
  for (const [where, now] of Object.entries(focused)) {
    const before = unfocused?.[where];
    if (!before) {
      if (now.rendered) changes.push(`${where}: appeared on focus`);
      continue;
    }
    // A ring that stays in the page but only shows on focus, such as a ripple, goes from not rendered to rendered.
    if (now.rendered && !before.rendered) {
      changes.push(`${where}: appeared on focus`);
      continue;
    }
    const found = [];
    const drawnOutline = (s) => s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0 && !transparent(s.outlineColor);
    if (drawnOutline(now) && (!drawnOutline(before) || now.outlineWidth !== before.outlineWidth || now.outlineColor !== before.outlineColor || now.outlineStyle !== before.outlineStyle)) found.push("outline");
    if (now.boxShadow !== before.boxShadow) found.push("box-shadow");
    const drawnBorder = (s) => s.borderTopStyle !== "none" && parseFloat(s.borderTopWidth) > 0;
    if (drawnBorder(now) && (now.borderTopColor !== before.borderTopColor || now.borderTopWidth !== before.borderTopWidth || !drawnBorder(before))) found.push("border");
    if (now.backgroundColor !== before.backgroundColor) found.push("background color");
    if (now.color !== before.color) found.push("text color");
    if (now.textDecorationLine !== before.textDecorationLine) found.push("text decoration");
    if (!now.rendered && !before.rendered) continue;
    for (const what of found) changes.push(`${where}: ${what}`);
  }
  return changes;
}

function transparent(color) {
  return color === "transparent" || /^rgba\(.*,\s*0\)$/.test(color) || /\/\s*0\)$/.test(color);
}
