# Spike: virtual screen reader in the live page

Result: it runs in the live Chromium page, including under strict CSP. The jsdom fallback isn't needed.

## Findings
- The package exports `./browser.js`, which resolves to `lib/esm/index.browser.js` (version 0.33.0). It's one self-contained ES module of 402 KB with no imports. It exports `virtual` and `Virtual`.
- Chartty serves that file through `page.route` and loads it with a dynamic `import()`. That path depends on the page's CSP allowing the import, so we don't copy it.
- Instead, we strip the `export{...}` line, wrap the source in an IIFE, and assign `window.__vsr = { virtual, Virtual }`. We run it with `page.evaluate(source)`. CDP evaluation doesn't go through the page's CSP.
- Tested with `virtual.start({ container: document.body })`, then `next()` up to 40 steps, then `spokenPhraseLog()`:
  - Local page with `script-src 'nonce-…' 'strict-dynamic'`: 8 phrases ("document", "main", "heading, Hello, level 1", "button, Go", and more).
  - github.com: 41 phrases.
  - w3.org/WAI: 41 phrases.
- The 40-step cap is a test limit. The real runner needs its own cap (chartty uses 150) and should report when it truncates.

## Decisions
- Use `page.evaluate` injection for the virtual screen reader. Don't use `bypassCSP`, which changes how the page behaves.
- Label every result "simulated," as the spec says.
- Not measured: walk time on large pages.
