# Spike: shadow DOM

Result: axe and IBM read open shadow roots. The virtual screen reader doesn't read any shadow root. A closed shadow root hides its content from every tool, and both engines report nothing there, which looks clean.

Test page: a custom element with a shadow root that holds an unnamed button, an image with no alt text, and low-contrast text. Run through the rules tier and the virtual screen reader in Chrome 155.

## Open shadow root
- axe: found `button-name`, `image-alt`, and `color-contrast`. Selectors look like `x-thing button`.
- IBM: found `input_label_exists`, `img_alt_valid`, and `text_contrast_sufficient`. Paths include `#document-fragment`.
- Playwright: `page.locator("[data-a11y-trigger]")` found the button inside the shadow root.
- Virtual screen reader: announced `document`, `main`, `heading, Shadow test, level 1`, `end of main`, `end of document`. It skipped the button, image, and text inside the shadow root.

## Closed shadow root
- axe and IBM reported no violations, which would read as a clean result for content they never saw.
- Playwright's locator found no trigger.
- The virtual screen reader behaved the same as for the open root.

## Decisions
- Record closed shadow roots by wrapping `Element.prototype.attachShadow` in an init script that runs before page scripts. Report the host tag names as `not-testable`, on every target type, never as clean.
- Don't force closed roots open. That would change how the component behaves.
- The vsr tier (M6) must report content inside shadow roots as `not-testable`, because the virtual screen reader can't reach it. M6 needs its own check for this.
- Fixture hooks (`data-a11y-trigger`, `data-a11y-root`) may sit inside an open shadow root.
