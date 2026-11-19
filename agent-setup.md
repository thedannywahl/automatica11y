---
url: /agent-setup.md
---
# Fixing the setup

Read this when `doctor --json` reports a `state` other than `ok`, or when the user has already said yes to downloading Chromium. The tool decides the state. Don't work it out from prose, and don't install or configure anything the steps below don't name.

## If the user already said yes to downloading Chromium

Complete the version check, then skip the plain `doctor` command and run exactly `npx --yes --prefer-online automatica11y@latest doctor --install-browser --json` once in the shell. Do not substitute `automatica11y` for `npx` for this command. Report its `state` and any `install.output` or `problems`. Don't run `doctor` first, invoke a standalone browser installer, or install anything else. Then follow the row for the new state below.

Browser consent only authorizes the chosen setup step. Preserve any instruction to show the audit command without running it, including after a download or fallback choice.

## What each state means

Exit code 3 means an environment problem. Relay each entry in `problems` (its `message` and `fix`) in plain words, then follow the matching state. When a `fix` names a separate installer, such as `npx playwright-core install`, don't run it; the download below is the only install this skill runs.

| `state` | Next action |
|---|---|
| `ok` | Continue. |
| `node-unsupported` | Node is older than 22. Relay the problem and the fix, then stop until the user applies it. |
| `browser-missing` | Ask only whether to download Chromium. If declined, report that no browser is available and stop. If accepted, run `npx --yes --prefer-online automatica11y@latest doctor --install-browser --json` once and report its result. |
| `browser-outdated` | Follow the ordered browser-choice steps below. The browser is more than two major versions behind Playwright's browser; `browser.kind` and `browser.version` name it. |
| `install-failed-no-browser` | Report the exact error from `install.output`, say that no browser is available, and stop without auditing. |
| `install-failed-outdated` | Report the exact error from `install.output` and name the remaining browser and its version. Call it the outdated browser in every mention, including next to the final command. Use `--allow-old-browser` only if the user already explicitly authorized using that browser; otherwise, explain that its results may be unreliable, ask whether to use it, and wait. If the user declines, say that no current browser is available and use of the outdated browser was declined. State that the audit did not run and no results, report, or screenshots were produced, then stop in that turn without asking again. |
| `other` | Relay the exact problem and fix, then stop until the user applies it. |

A download that succeeds reports `ok`. Continue.

## An outdated browser

1. Name the browser and its version. Explain that results may be unreliable and the report header will flag it.
2. Ask whether to use that browser or download current Chromium through Playwright (about 100 MB), then wait without auditing or downloading.
3. If the user declines both, report that no current browser is available and that use of the outdated browser was declined, then stop without auditing. If their reply answers neither option, ask for clarification and wait.
4. If the user chooses the outdated browser, use `--allow-old-browser` on the audit or comparison and every rerun. Whenever you mention that browser afterward, including next to the final command, use the word "outdated" (for example "the outdated headless-shell 141").
5. If the user chooses a download, run `npx --yes --prefer-online automatica11y@latest doctor --install-browser --json` once and report its result. Follow the row for the new state above. A failed download with an outdated browser remaining (`install-failed-outdated`) requires a separate fallback question unless the user already explicitly authorized that browser.

Download consent never implies outdated-browser consent. The outdated-browser option bypasses only its version check, never missing browsers, unsupported Node, launch failures, or failed rule-engine self-tests.

Add `--allow-old-browser` only after explicit consent to use the outdated browser. Never add it by default.

Do not try other installers, change network settings, or bypass sandbox restrictions.
