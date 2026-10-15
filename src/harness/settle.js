/**
 * Wait for fades and slides to finish before a state is scanned, so contrast is measured on the settled colors and not on a
 * half-transparent element mid-transition. Animations that never end (a spinner) are left alone. Defaults to a 2-second bound.
 * Test fixtures can opt into finishing finite animations instead of waiting for their normal duration.
 * @param {import("playwright-core").Page} page
 * @param {{ finishFinite?: boolean, maxWaitMs?: number }} [options]
 */
export async function settleAnimations(page, { finishFinite = false, maxWaitMs = 2000 } = {}) {
  await page.evaluate(async ({ finishFinite, maxWaitMs }) => {
    const frame = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    await frame();
    const finite = () => document.getAnimations().filter((animation) => animation.effect && animation.effect.getComputedTiming().endTime !== Infinity && !["finished", "idle"].includes(animation.playState));
    const deadline = Date.now() + maxWaitMs;
    while (finite().length > 0 && Date.now() < deadline) {
      const animations = finite();
      if (finishFinite) {
        for (const animation of animations) {
          try {
            animation.finish();
          } catch {
            // An animation that cannot finish uses the bounded natural-wait path.
          }
        }
      }
      /** @type {ReturnType<typeof setTimeout> | undefined} */
      let timer;
      try {
        await Promise.race([Promise.allSettled(animations.map((animation) => animation.finished)), new Promise((done) => { timer = setTimeout(done, Math.min(200, Math.max(0, deadline - Date.now()))); })]);
      } finally {
        clearTimeout(timer);
      }
      await frame();
    }
  }, { finishFinite, maxWaitMs });
}
