---
name: automatica11y
compatibility: Needs Node 20 or newer, a shell that can run npx, and network access to the npm registry.
description: Test and compare web accessibility. Use when someone asks how accessible a web page, Storybook, or npm component library is, asks for an accessibility or WCAG check or audit, or asks to compare the accessibility of two or more sites or component libraries (for example "how accessible is Radix Dialog?" or "compare React Aria and Headless UI").
---

# automatica11y

automatica11y tests and compares web accessibility. This skill only gets you started. The full steps ship with the tool, so they always match its version.

1. Check `node --version`. It must be 20 or newer. If it isn't, tell the user and stop.
2. Run this, read all of what it prints, and follow it:

   ```bash
   npx --yes automatica11y@latest guide
   ```

3. If you can't run shell commands, or `npx` can't reach the npm registry, tell the user and stop. Don't guess at results.

The tool is **not** an attestation or certification tool. Automated checks cover only part of WCAG. Say "no automated violations found." Never say a target is "accessible" or "compliant."
