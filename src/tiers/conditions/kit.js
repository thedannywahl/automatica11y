/**
 * Runs inside the page before any page script. It sets `window.__a11yConditions`, which reads what the page does under
 * a user's settings and environment: running animations, content that spills past the window, and content a text spacing
 * override clips. It reports plain facts. The checks in checks.js decide pass or fail.
 * This function is serialized and sent to the browser, so it can't use anything from outside itself.
 */
export function installConditions() {
  /** A short, readable name for an element: `button#save`, `div.alert`, or `span`. */
  const describe = (el) => {
    if (!el || el.nodeType !== 1) return "(document)";
    const tag = el.localName;
    if (el.id) return `${tag}#${el.id}`;
    const first = typeof el.className === "string" ? el.className.trim().split(/\s+/).find(Boolean) : "";
    return first ? `${tag}.${first}` : tag;
  };

  /** Keyframe properties that move or resize something. Opacity and color changes aren't motion. */
  const MOVING = /^(transform|translate|rotate|scale|top|left|right|bottom|inset\w*|margin\w*|offset(Path|Distance|Rotate)|backgroundPosition\w*|height|maxHeight|minHeight|width|maxWidth|minWidth|clipPath|clip)$/;
  const IGNORED_KEYS = new Set(["offset", "easing", "composite", "computedOffset"]);

  const allElements = () => [...document.body.querySelectorAll("*")];

  /** The scroll container an element sits in, if one hides its overflow sideways (so it doesn't push the page wider). */
  const scrollsSideways = (el) => {
    for (let node = el.parentElement; node && node !== document.documentElement; node = node.parentElement) {
      const x = getComputedStyle(node).overflowX;
      if (x === "auto" || x === "scroll" || x === "hidden" || x === "clip") return true;
    }
    return false;
  };

  window.__a11yConditions = {
    describe,
    /** Every animation and transition running right now. */
    animations() {
      return document.getAnimations().map((animation) => {
        const effect = animation.effect instanceof KeyframeEffect ? animation.effect : null;
        const timing = effect?.getComputedTiming?.() ?? {};
        const keyframes = effect?.getKeyframes?.() ?? [];
        const props = [...new Set(keyframes.flatMap((frame) => Object.keys(frame)).filter((key) => !IGNORED_KEYS.has(key)))];
        const target = effect?.target ?? null;
        const iterations = timing.iterations === Infinity ? "infinite" : timing.iterations;
        return {
          kind: animation.constructor.name,
          name: animation instanceof CSSAnimation ? animation.animationName : animation instanceof CSSTransition ? animation.transitionProperty : "",
          target: describe(target),
          duration: typeof timing.duration === "number" ? timing.duration : null,
          iterations,
          props,
          moving: props.some((prop) => MOVING.test(prop)),
        };
      });
    },
    /** How far the page reaches past the window's right edge, and which elements do it. */
    overflow(rootSelector) {
      const width = document.documentElement.clientWidth;
      const offenders = [];
      for (const el of allElements()) {
        const box = el.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) continue;
        const style = getComputedStyle(el);
        if (style.visibility === "hidden" || style.display === "none") continue;
        if (box.right > width + 1 && !scrollsSideways(el)) offenders.push({ element: describe(el), right: Math.round(box.right), width: Math.round(box.width), left: Math.round(box.left) });
      }
      const root = rootSelector ? document.querySelector(rootSelector) : null;
      const rootBox = root && root.getClientRects().length ? root.getBoundingClientRect() : null;
      return {
        viewportWidth: width,
        scrollWidth: document.documentElement.scrollWidth,
        offenders: offenders.slice(0, 8),
        offenderCount: offenders.length,
        root: rootBox ? { element: describe(root), left: Math.round(rootBox.left), right: Math.round(rootBox.right) } : null,
      };
    },
    /** For every element, whether its box cuts off its own content, so two snapshots can show what a change clips. */
    clipping() {
      return allElements().map((el) => {
        const style = getComputedStyle(el);
        const hidesX = ["hidden", "clip"].includes(style.overflowX);
        const hidesY = ["hidden", "clip"].includes(style.overflowY);
        const box = el.getBoundingClientRect();
        return {
          /** A one-pixel box that hides its overflow is a screen reader only copy. Nobody sees its text, so nothing is cut off. */
          visuallyHidden: box.width <= 1 && box.height <= 1,
          element: describe(el),
          hidesX,
          hidesY,
          overX: el.scrollWidth - el.clientWidth,
          overY: el.scrollHeight - el.clientHeight,
          text: (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 30),
        };
      });
    },
    /** Apply the text spacing the success criterion names, with !important so authored styles can't hold it back. */
    applySpacing() {
      const style = document.createElement("style");
      style.setAttribute("data-a11y-spacing", "");
      style.textContent = "* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }";
      document.head.append(style);
    },
    /**
     * Surfaces that carry text over a see-through background or a blur: a background color that isn't fully opaque,
     * or a backdrop filter. Empty overlays are left out, because they hold no text for the effect to get in the way of.
     */
    translucentSurfaces() {
      const toRgba = window.__a11yMeasure?.rgba;
      const found = [];
      for (const el of allElements()) {
        const box = el.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) continue;
        const style = getComputedStyle(el);
        if (style.visibility === "hidden" || style.display === "none") continue;
        const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim()) || el.matches("input, textarea, select, button");
        const holdsText = own || (el.textContent ?? "").trim().length > 0;
        if (!holdsText) continue;
        const color = toRgba ? toRgba(style.backgroundColor) : null;
        const seeThrough = Boolean(color) && color[3] > 0 && color[3] < 1;
        const blur = style.backdropFilter && style.backdropFilter !== "none" ? style.backdropFilter : "";
        if (seeThrough || blur) found.push({ element: describe(el), background: seeThrough ? `${Math.round(color[3] * 100)}% opaque` : "", backdropFilter: blur });
      }
      return found;
    },
    /** Elements that opt out of forced colors, and so keep their own colors. */
    forcedColorOptOuts() {
      return allElements().filter((el) => getComputedStyle(el).forcedColorAdjust === "none").slice(0, 20).map(describe);
    },
    /** A cheap fingerprint of how the page looks in the current color scheme. */
    appearance() {
      const html = getComputedStyle(document.documentElement);
      return { colorScheme: html.colorScheme, background: getComputedStyle(document.body).backgroundColor, color: getComputedStyle(document.body).color };
    },
  };
}
