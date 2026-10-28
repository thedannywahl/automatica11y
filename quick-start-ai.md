---
url: /quick-start-ai.md
---
# AI {#quick-start-ai}

Automatica11y provides an evergreen bootstrap skill you can add to your agent of choice. Automatica11y cli bundles the latest version of the runner skill and its references, so every invocation is always compatible.

```skill
---
name: automatica11y
compatibility: Needs Node 22 or newer, a shell that can run npx or the installed automatica11y command, and network access to the npm registry.
description: Test and compare web accessibility. Use when someone asks how accessible a web page, Storybook, or npm component library is, asks for an accessibility or WCAG check or audit (including a whole site, using its sitemap or a crawl across its links, with a trusted authentication module for pages behind sign-in), or asks to compare the accessibility of two or more sites or component libraries (for example "how accessible is Radix Dialog?" or "compare React Aria and Headless UI").
---

# automatica11y

automatica11y tests and compares web accessibility. This skill only gets you started. The full steps ship with the tool, so they always match its version.

Don't narrate each step. Before answering, show the exact guide command you ran in a fenced code block, then report results or the error. Don't claim to have run a command you couldn't execute.

1. Follow this decision list:

   Guide output is usable only if the command exits with code 0 and prints guide text containing at least 20 non-blank lines of Markdown text (blank lines and lines containing only code fence markers are not counted; count newline-delimited lines, not visual wrapping).

   At the start of each new accessibility request in this conversation, obtain usable guide output using the sequence below, read all of it, and follow it; continue to step 2. For a follow-up message about the same request, reuse the guide already read. For a comparison, reuse that guide for every target instead of fetching it again.

   Run these phases in order. As soon as a guide command produces usable output, read and follow it and continue to step 2; skip the remaining phases.

   1. **A: Installed command.** If `automatica11y` is on the `PATH` and `automatica11y --version` prints a version, run `automatica11y guide skill`. Otherwise, or if its output is not usable, continue to phase B.
   2. **B: npx command.** Run `npx --yes --prefer-online automatica11y@latest guide skill` once. If it fails because it can't reach the npm registry, continue to phase C. For any other failure or unusable output, skip phase C and continue to phase D.
   3. **C: Permission-based retry.** If the shell tool returns a permission or sandbox prompt for network access, request network access for that exact command only. If permission is granted, retry that exact command once. If no such prompt is available, the request is refused, or the retry fails or produces unusable output, continue to phase D. Do not make further recovery attempts.
   4. **D: Node.js check.** If no command produced usable guide output, run `node --version` and report the outcome using the table below. Stop; don't continue with partial instructions.

   | Phase | Outcome | Result |
   | --- | --- | --- |
   | A, B, or C | Usable guide output. | Read and follow the guide; continue to step 2. |
   | D | Node.js is missing or below 22. | Tell the user Node.js 22 or newer is required, then stop. |
   | D | Node.js is 22 or newer, but no command produced usable guide output. | Report the guide error text or state that no usable output was produced, then stop. |

   A DNS lookup failure such as `ENOTFOUND` counts as a registry connectivity failure for phase B, and it does not prove a sandbox restriction.

   The guide sends you to other topics only when the request needs them (for example `guide reporting` before you write a report). Run each with the same command form that produced usable `guide skill` output, such as `npx --yes --prefer-online automatica11y@latest guide reporting`. The same usable-output check and recovery rules apply. Reuse a topic you've already read for the same request.

   If the tool's accessibility check fails or returns no results after the guide was read, report the error text or state that no results were produced, and stop, except for an unreachable comparison target as described in step 2. Don't retry the check, present partial results as complete, or invent findings.

2. Keep the user's request as they gave it: the target or targets, and any settings they named, such as a WCAG version or level. Apply them using the guide.

   If the user's request names no target, ask: "Which target should I test: a URL, a Storybook, or an npm package?" before running any accessibility check. Do not guess a target.
   If the user names a library or component without a URL, Storybook address, or npm package name, ask the user to confirm the exact npm package name or URL before running a check on that target. For a comparison, still run the checks for the fully specified targets and report the pending target separately after the user confirms. Don't assume a package name.

   If a named target cannot be reached or does not exist, report which target failed and the error text. For a comparison, test the remaining targets and report the failed one separately; otherwise, stop. Don't substitute a different target.

   After reading the guide, pass only settings that the guide lists as supported for this tool. If the user named a setting the guide doesn't list as supported, tell the user which setting is unsupported, list the supported values from the guide, and ask which to use. Don't ask again for anything they've already said.

3. If you can't run shell commands, tell the user and stop. For npm network failures, use only the permission-request recovery in step 1. Web search access and this skill's compatibility field don't grant shell network access. Don't change permission settings, bypass restrictions, or substitute web search for the guide command. Don't guess at results.

```

Once the skill is installed in your agent you can prompt it with the same commands and flags that are available to the cli.

## Audit a web page

You can audit web pages, static html files, Storybooks, and npm packages. To audit a live web page, simply provide the URL.

```prompt
/automatica11y audit "https://iywahl.com/"
```

## Compare two packages

Automatica11y can compare two packages, even across different frameworks. It also supports versioning, sub-component exports, and aliases. Here's an example of comparing two different versions of a button from the same package:

```prompt
/automatica11y compare next-gen=npm:@instructure/ui-button/Button/v2 canvas=npm:@instructure/ui-buttons/Button/v1
```

The runner skill and references guide the Agent on how to write custom fixtures, how to interpret results, and how to turn the machine results (`report.json`) into a human-readable templated report.

See [Using it with an AI agent](/agents) for additional details.
