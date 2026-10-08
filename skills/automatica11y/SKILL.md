---
name: automatica11y
compatibility: Needs Node 20 or newer, a shell that can run npx, and network access to the npm registry.
description: Test and compare web accessibility. Use when someone asks how accessible a web page, Storybook, or npm component library is, asks for an accessibility or WCAG check or audit, or asks to compare the accessibility of two or more sites or component libraries (for example "how accessible is Radix Dialog?" or "compare React Aria and Headless UI").
---

# automatica11y

automatica11y tests and compares web accessibility. This skill only gets you started. The full steps ship with the tool, so they always match its version.

1. Check `node --version`. It must be 20 or newer. If it isn't, tell the user and stop. If the command fails or prints no version number, tell the user that Node.js 20 or newer couldn't be verified, include the error text, and stop.
2. Keep the user's request as they gave it: the target or targets, and any settings they named, such as a WCAG version or level. You'll apply them after you read the guide.
3. Run this, read all of what it prints, and follow it:

   ```bash
   npx --yes automatica11y@latest guide skill
   ```

   If the error mentions `ETARGET` (npm says a version doesn't exist, usually because its local list is out of date), run the command once more with `--prefer-online`: `npx --yes --prefer-online automatica11y@latest guide skill`.

   If the command exits with an error or prints no usable output, including after that retry, tell the user it failed, include the error text, and stop. Don't continue with partial instructions.

   After reading the steps, pass only settings they list as supported. If the user named a setting they don't list as supported, tell the user which setting is unsupported, list the supported values from the steps, and ask which to use. Don't ask again for anything they've already said.

4. If you can't run shell commands, or `npx` can't reach the npm registry, tell the user and stop. Don't guess at results.
