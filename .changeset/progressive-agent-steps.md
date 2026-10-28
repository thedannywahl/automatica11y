---
automatica11y: minor
---

Split the agent steps into a small core and on-demand references (`guide setup`, `guide targets`, `guide site`, `guide fixtures`, `guide reporting`), so agents load only what a request needs. Every file in the runner's `references/` folder is now a `guide` topic. Add `doctor --json`, which prints the environment's `state` (`ok`, `node-unsupported`, `browser-missing`, `browser-outdated`, `install-failed-no-browser`, `install-failed-outdated`, or `other`) with the browser, download result, and problems, so agents act on the tool's diagnosis instead of its prose.
