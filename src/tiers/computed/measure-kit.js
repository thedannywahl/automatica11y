/**
 * Runs inside the page before any page script. It sets `window.__a11yMeasure`, which reads resolved styles
 * (getComputedStyle) and turns them into plain numbers: colors as [r, g, b, a], sizes in pixels.
 * It never decides pass or fail. The checks in checks.js do that.
 * This function is serialized and sent to the browser, so it can't use anything from outside itself.
 */
export function installMeasure() {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  /** Any CSS color to [r, g, b, a] in sRGB, or null. The canvas does the conversion, so modern color spaces work. */
  const rgba = (css) => {
    if (!css || !context) return null;
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = "#000";
    context.fillStyle = css;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
    // The canvas stores premultiplied values, so a translucent color loses a little precision. That's fine for contrast.
    return a === 0 ? [0, 0, 0, 0] : [r, g, b, a / 255];
  };
  const over = (top, under) => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3])).concat(1);
  const parentOf = (el) => el.assignedSlot || el.parentElement || (el.getRootNode() instanceof ShadowRoot ? el.getRootNode().host : null);

  /**
   * The opaque color behind an element: its ancestors' backgrounds laid over each other, ending at white.
   * `includeSelf` adds the element's own background. Gradients, images, and transparency can't be reduced to one color,
   * so those return a reason instead of a guess.
   */
  const backdrop = (el, includeSelf) => {
    const layers = [];
    let node = includeSelf ? el : parentOf(el);
    for (let hops = 0; node && hops < 60; hops += 1) {
      const style = getComputedStyle(node);
      if (style.backgroundImage !== "none") return { reason: "a background image or gradient sits behind it" };
      if (Number(style.opacity) < 1) return { reason: "an element behind it is partly transparent" };
      if (style.mixBlendMode !== "normal") return { reason: "a blend mode is applied behind it" };
      const color = rgba(style.backgroundColor);
      if (color && color[3] > 0) {
        layers.push(color);
        if (color[3] === 1) break;
      }
      node = parentOf(node);
    }
    let result = [255, 255, 255, 1];
    for (const layer of layers.reverse()) result = over(layer, result);
    return { color: result };
  };

  const visibleBox = (el) => {
    const box = el.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  };
  const deepActive = () => {
    let active = document.activeElement;
    while (active && active.shadowRoot && active.shadowRoot.activeElement) active = active.shadowRoot.activeElement;
    return active;
  };
  const trigger = () => {
    const find = (root) => {
      const hit = root.querySelector("[data-a11y-trigger]");
      if (hit) return hit;
      for (const el of root.querySelectorAll("*")) if (el.shadowRoot) { const inner = find(el.shadowRoot); if (inner) return inner; }
      return null;
    };
    return find(document);
  };

  /** Split a computed box-shadow list at its top-level commas. */
  const splitShadows = (value) => {
    const out = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < value.length; i += 1) {
      if (value[i] === "(") depth += 1;
      else if (value[i] === ")") depth -= 1;
      else if (value[i] === "," && depth === 0) { out.push(value.slice(start, i).trim()); start = i + 1; }
    }
    out.push(value.slice(start).trim());
    return out.filter(Boolean);
  };
  const parseShadow = (text) => {
    const color = /(rgba?\([^)]*\)|color\([^)]*\)|oklab\([^)]*\)|oklch\([^)]*\)|lab\([^)]*\)|lch\([^)]*\)|hsla?\([^)]*\)|#[0-9a-f]{3,8}|\b[a-z]+\b(?=\s|$))/i.exec(text.replace(/\binset\b/, ""));
    const rest = text.replace(/\binset\b/, "").replace(color ? color[0] : "", "");
    const [x, y, blur, spread] = (rest.match(/-?[\d.]+px/g) ?? []).map(parseFloat);
    return { inset: /\binset\b/.test(text), x: x ?? 0, y: y ?? 0, blur: blur ?? 0, spread: spread ?? 0, color: color ? rgba(color[0]) : null };
  };

  const keys = new WeakMap();
  let keyCounter = 0;

  window.__a11yMeasure = {
    rgba,
    /**
     * The text inside the trigger (or, with "page", anywhere on the page except the trigger): each piece of text with its
     * color, size, and backdrop. Slotted text takes its style from the slot's parent in the flattened tree, and text that is
     * visually hidden (a one-pixel screen reader copy) is left out. `key` lets a later call tell which text is new.
     */
    text(scope) {
      const wholePage = scope === "page" || scope === "all";
      const el = trigger();
      if (!el && !wholePage) return null;
      const parts = [];
      const seen = new Set();
      const consider = (textNode, label, own) => {
        const host = own ?? textNode.parentElement;
        const node = own ?? textNode.assignedSlot ?? host;
        if (!host || !node || seen.has(textNode) || !visibleBox(host)) return;
        const box = host.getBoundingClientRect();
        if (box.width <= 1 && box.height <= 1) return;
        seen.add(textNode);
        const style = getComputedStyle(node);
        if (style.visibility === "hidden") return;
        if (!keys.has(textNode)) keys.set(textNode, (keyCounter += 1));
        const behind = backdrop(node, true);
        const color = rgba(style.color);
        parts.push({
          key: keys.get(textNode),
          text: label.replace(/\s+/g, " ").trim().slice(0, 40),
          color,
          size: parseFloat(style.fontSize),
          weight: style.fontWeight,
          backdrop: behind.color ?? null,
          undetermined: behind.reason ?? (color ? null : "its color couldn't be read"),
        });
      };
      const walk = (root) => {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, wholePage ? { acceptNode: (n) => (n.parentElement?.closest(scope === "all" ? "script, style, noscript" : "script, style, noscript, [data-a11y-trigger]") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) } : undefined);
        for (let node = walker.nextNode(); node && parts.length < (scope === "all" ? 300 : 30); node = walker.nextNode()) {
          if (node.nodeValue && node.nodeValue.trim() && node.parentElement) consider(node, node.nodeValue);
        }
        if (wholePage) for (const host of root.querySelectorAll("*")) if (host.shadowRoot) walk(host.shadowRoot);
      };
      walk(wholePage ? document.body : el);
      if (!wholePage && el.matches("input, textarea, select") && "value" in el && String(el.value).trim()) {
        consider(el, String(el.value), el);
      }
      return parts;
    },
    /** What the control looks like from outside: label, input, or icon, and the colors that mark its edge. */
    boundary() {
      const el = trigger();
      if (!el) return null;
      const style = getComputedStyle(el);
      const outside = backdrop(el, false);
      const inside = backdrop(el, true);
      const parts = [];
      if (outside.color && inside.color) {
        parts.push({ kind: "fill", color: inside.color });
        for (const side of ["Top", "Right", "Bottom", "Left"]) {
          const border = parseFloat(style[`border${side}Width`]) > 0 && style[`border${side}Style`] !== "none" ? rgba(style[`border${side}Color`]) : null;
          if (border && border[3] > 0) parts.push({ kind: `${side.toLowerCase()} border`, color: over(border, inside.color), width: parseFloat(style[`border${side}Width`]) });
        }
      }
      const graphics = [];
      for (const shape of el.querySelectorAll("svg path, svg circle, svg ellipse, svg rect, svg line, svg polyline, svg polygon")) {
        const s = getComputedStyle(shape);
        for (const [kind, value] of [["fill", s.fill], ["stroke", s.stroke]]) {
          const color = value && value !== "none" ? rgba(value) : null;
          if (color && color[3] > 0 && visibleBox(shape) && inside.color) graphics.push({ kind, color: over(color, inside.color) });
        }
      }
      return {
        outside: outside.color ?? null,
        undetermined: outside.reason ?? inside.reason ?? null,
        parts,
        graphics: graphics.slice(0, 12),
        hasText: (el.innerText ?? el.textContent ?? "").trim().length > 0 || (el.matches("input, textarea, select") && "value" in el && String(el.value).trim().length > 0),
        inputLike: el.matches("input:not([type=button]):not([type=submit]):not([type=reset]):not([type=checkbox]):not([type=radio]), textarea, select") || ["textbox", "combobox", "searchbox", "listbox"].includes(el.getAttribute("role") ?? ""),
        box: (() => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; })(),
      };
    },
    /** The styles that draw a focus indicator on the focused element itself, with the colors they sit against. */
    focusStyles(atRest) {
      const el = atRest ? trigger() : deepActive();
      if (!el) return null;
      const style = getComputedStyle(el);
      const outside = backdrop(el, false);
      const inside = backdrop(el, true);
      const side = ["Top", "Right", "Bottom", "Left"].find((name) => parseFloat(style[`border${name}Width`]) > 0 && style[`border${name}Style`] !== "none");
      const border = side ? rgba(style[`border${side}Color`]) : null;
      return {
        outside: outside.color ?? null,
        inside: inside.color ?? null,
        undetermined: outside.reason ?? inside.reason ?? null,
        outline: style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0 ? { width: parseFloat(style.outlineWidth), offset: parseFloat(style.outlineOffset) || 0, color: rgba(style.outlineColor) } : null,
        shadows: style.boxShadow === "none" ? [] : splitShadows(style.boxShadow).map(parseShadow),
        border: border ? { width: parseFloat(style[`border${side}Width`]), color: border } : null,
        box: (() => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; })(),
      };
    },
    /**
     * Compare two screenshots (as data URLs) pixel by pixel. For each pixel that changed, find the contrast between
     * its two colors. Used when a focus indicator isn't a plain outline or ring, such as a ripple or a background change.
     */
    async compareShots(before, after) {
      const load = async (url) => {
        const bitmap = await createImageBitmap(await (await fetch(url)).blob());
        const c = document.createElement("canvas");
        c.width = bitmap.width;
        c.height = bitmap.height;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(bitmap, 0, 0);
        return ctx.getImageData(0, 0, c.width, c.height);
      };
      const [a, b] = [await load(before), await load(after)];
      const lin = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
      const lum = (d, i) => 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]);
      let changed = 0;
      let strong = 0;
      let max = 1;
      for (let i = 0; i < a.data.length; i += 4) {
        if (a.data[i] === b.data[i] && a.data[i + 1] === b.data[i + 1] && a.data[i + 2] === b.data[i + 2]) continue;
        changed += 1;
        const [hi, lo] = [lum(a.data, i), lum(b.data, i)].sort((x, y) => y - x);
        const ratio = (hi + 0.05) / (lo + 0.05);
        if (ratio > max) max = ratio;
        if (ratio >= 3) strong += 1;
      }
      return { changed, strong, max, width: a.width, height: a.height };
    },
  };
}
