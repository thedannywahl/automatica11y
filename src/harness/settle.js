/**
 * Wait for fades and slides to finish before a state is scanned, so contrast is measured on the settled colors and not on a
 * half-transparent element mid-transition. Animations that never end (a spinner) are left alone. Waits at most 2 seconds.
 * @param {import("playwright-core").Page} page
 */
export async function settleAnimations(page) {
  await page.evaluate(async () => {
    const frame = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    await frame();
    const finite = () => document.getAnimations().filter((a) => a.effect && a.effect.getComputedTiming().endTime !== Infinity);
    const deadline = Date.now() + 2000;
    while (finite().length > 0 && Date.now() < deadline) {
      await Promise.race([Promise.allSettled(finite().map((a) => a.finished)), new Promise((done) => setTimeout(done, 200))]);
      await frame();
    }
  });
}
