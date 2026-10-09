# Limits.

- Automated rules find only part of what WCAG covers. They can't judge whether alt text is meaningful, whether link and heading text make sense in context, cognitive load, real focus and reading order in use, or how real screen readers behave. A person has to check those.
- Components are tested in the states a fixture shows. Dialogs, menus, tooltips, and comboboxes run closed and open, and live regions run before and after the message. Other states aren't visited.
- Content on a canvas with no alternative, or inside a closed shadow root, can't be tested, and the report says so. The virtual screen reader can't read inside shadow roots at all.
- Motion driven by JavaScript timers, such as a carousel that animates with `requestAnimationFrame`, isn't visible to the reduced motion check.
- Svelte, Vue 2, Angular older than version 22, and other frameworks report "unsupported framework." Their Storybooks work, because a Storybook renders stories in a page whatever the framework.
- Native screen readers aren't part of this version.
- Results are a snapshot. The tools run at their latest versions, and the report records them.

## License.

MIT. See [LICENSE](https://github.com/thedannywahl/automatica11y/blob/main/LICENSE). The WCAG data below has its own terms.

## Attribution.

automatica11y reads WCAG criterion numbers, names, levels, and versions from the W3C's published JSON, [wcag.json](https://www.w3.org/WAI/WCAG22/wcag.json). The package ships that file in `src/data/` without changes.

Source: [Web Content Accessibility Guidelines (WCAG) 2.2](https://www.w3.org/TR/WCAG22/), W3C. The JSON is used under the [terms in the W3C WCAG repository](https://github.com/w3c/wcag/blob/main/11ty/json/README.md): the source is credited with a link, and the content isn't changed. See also the [W3C Document License](https://www.w3.org/copyright/document-license/) and [W3C Intellectual Rights](https://www.w3.org/copyright/intellectual-rights/). The links that reports build to each criterion are added by automatica11y and aren't part of the W3C data.

Every report repeats this credit in its closing section. To refresh the data, run `npm run update-wcag`.
