---
name: automatica11y
compatibility: Needs Node 22 or newer, a shell that can run npx or the installed automatica11y command, and network access to the npm registry.
description: Test and compare web accessibility. Use when someone asks how accessible a web page, Storybook, or npm component library is, asks for an accessibility or WCAG check or audit, or asks to compare the accessibility of two or more sites or component libraries (for example "how accessible is Radix Dialog?" or "compare React Aria and Headless UI").
---

# automatica11y

automatica11y tests and compares web accessibility. This skill only gets you started. The full steps ship with the tool, so they always match its version.

Don't narrate each step. Before answering, show the exact guide command you ran in a fenced code block, then report results or the error. Don't claim to have run a command you couldn't execute.

1. Follow this decision list:

   Guide output is usable only if the command exits with code 0 and prints guide text containing at least 20 non-blank lines of Markdown text (blank lines and lines containing only code fence markers are not counted; count newline-delimited lines, not visual wrapping).

   At the start of each new accessibility request in this conversation, obtain usable guide output using the sequence below, read all of it, and follow it; continue to step 2. For a follow-up message about the same request, reuse the guide already read. For a comparison, reuse that guide for every target instead of fetching it again.

   1. If `automatica11y` is already on the `PATH` and `automatica11y --version` prints a version, run `automatica11y guide skill`. If it produces usable output, the sequence is complete.

   2. If the installed command is unavailable, fails, or produces no usable output, run this command once. If it produces usable output, the sequence is complete.

      ```bash
      npx --yes automatica11y@latest guide skill
      ```

   3. Only if the `npx` command fails with `ETARGET`, run `npx --yes --prefer-online automatica11y@latest guide skill` once. If it produces usable output, the sequence is complete.

   4. If no command produced usable guide output, run `node --version`. If Node.js is missing or below 22, tell the user that Node.js 22 or newer is required and stop. Otherwise, report the guide error text (or state that the guide produced no usable output) and stop. Don't continue with partial instructions.

   If the tool's accessibility check fails or returns no results after the guide was read, report the error text or state that no results were produced, and stop, except for an unreachable comparison target as described in step 2. Don't retry the check, present partial results as complete, or invent findings.

2. Keep the user's request as they gave it: the target or targets, and any settings they named, such as a WCAG version or level. Apply them using the guide.

   If the user's request names no target, ask: "Which target should I test: a URL, a Storybook, or an npm package?" before running any accessibility check. Do not guess a target.
   If the user names a library or component without a URL, Storybook address, or npm package name, ask the user to confirm the exact npm package name or URL before running any check. Don't assume a package name.

   If a named target cannot be reached or does not exist, report which target failed and the error text. For a comparison, test the remaining targets and report the failed one separately; otherwise, stop. Don't substitute a different target.

   After reading the guide, pass only settings that the guide lists as supported for this tool. If the user named a setting the guide doesn't list as supported, tell the user which setting is unsupported, list the supported values from the guide, and ask which to use. Don't ask again for anything they've already said.

3. If you can't run shell commands, or `npx` can't reach the npm registry, tell the user and stop. Don't guess at results.
