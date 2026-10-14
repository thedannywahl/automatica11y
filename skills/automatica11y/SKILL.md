---
name: automatica11y
compatibility: Needs Node 22 or newer, a shell that can run npx or the installed automatica11y command, and network access to the npm registry.
description: Test and compare web accessibility. Use when someone asks how accessible a web page, Storybook, or npm component library is, asks for an accessibility or WCAG check or audit, or asks to compare the accessibility of two or more sites or component libraries (for example "how accessible is Radix Dialog?" or "compare React Aria and Headless UI").
---

# automatica11y

automatica11y tests and compares web accessibility. This skill only gets you started. The full steps ship with the tool, so they always match its version.

Don't narrate each step. Before answering, show the exact guide command you ran in a fenced code block, then report results or the error. Don't claim to have run a command you couldn't execute.

1. Follow this decision list:

   (a) If `automatica11y` is already on the `PATH` and `automatica11y --version` prints a version, run `automatica11y guide skill`. Otherwise, run:

   ```bash
   npx --yes automatica11y@latest guide skill
   ```

   If `automatica11y guide skill` fails or produces no usable output as defined in (b), run `npx --yes automatica11y@latest guide skill` once and apply (b) to its result.

   (b) Guide output is usable only if the command exits with code 0 and prints non-empty guide text containing more than 20 lines of Markdown instructions. If the guide succeeds with usable output, read all of it once per user request and follow it; continue to step 2. For a comparison, reuse that guide for every target instead of fetching it again.

   (c) If the `npx` command fails with `ETARGET`, run `npx --yes --prefer-online automatica11y@latest guide skill` once. If it succeeds with usable output as defined in (b), read all of it and follow it; continue to step 2.

   (d) If the guide still fails or produces no usable output as defined in (b), run `node --version`. If Node.js is missing or below 22, tell the user that Node.js 22 or newer is required and stop.

   (e) For any other failure, report the failure with its error text (or say that the guide produced no usable output as defined in (b)) and stop. Don't continue with partial instructions.

2. Keep the user's request as they gave it: the target or targets, and any settings they named, such as a WCAG version or level. Apply them using the guide.

   If the user's request names no target (URL, Storybook, or npm component library), ask which one to test before running any accessibility check. Do not guess a target.

   After reading the guide, pass only settings that the guide lists as supported for this tool. If the user named a setting the guide doesn't list as supported, tell the user which setting is unsupported, list the supported values from the guide, and ask which to use. Don't ask again for anything they've already said.

3. If you can't run shell commands, or `npx` can't reach the npm registry, tell the user and stop. Don't guess at results.
