# Using it with an AI agent.

The tool prints its own guidance, so any agent that can run `npx` can learn to use it. If the tool is installed globally, the agent can run `automatica11y guide skill` instead of `npx automatica11y@latest guide skill`:

```bash
npx automatica11y@latest guide            # where to start (the AGENTS.md file)
npx automatica11y@latest guide skill      # the core steps: check, build the command, run it
npx automatica11y@latest guide setup      # what to do for each doctor state (browser, Node)
npx automatica11y@latest guide targets    # local pages, Storybooks, npm packages, and grouping
npx automatica11y@latest guide site       # crawling a site, sitemaps, and authentication
npx automatica11y@latest guide fixtures   # how to write the fixtures an npm package needs
npx automatica11y@latest guide reporting  # how to write the report from the results
```

The core steps are small, and they tell the agent which other topic to read, only when the request needs it. That keeps the agent's context free for the work. For setup, the agent runs `doctor --json`, which names the environment's state, so the agent follows the tool's diagnosis instead of interpreting prose.

The guidance ships with the tool, so it always matches the version you run. Tell your agent to run `npx automatica11y@latest guide` and follow it, then ask for things like "How accessible is Radix Dialog?" or "Compare the accessibility of React Aria and Headless UI." The agent needs to run shell commands and read and write files. Nothing here is tied to one agent.

Shell networking can be restricted separately from web search or browser access. If npm can't reach the registry, the agent can request network permission for the exact guide command where the execution environment supports and permits it, then retry once if granted. If permission is denied or unavailable, or the retry fails, it reports the error and stops. Prompt wording and a skill's compatibility field describe requirements; they don't grant access.

## Skills.

If your agent loads skills from a folder, copy [`skills/automatica11y`](https://github.com/thedannywahl/automatica11y/tree/main/skills/automatica11y) into it. That's one small file, `SKILL.md`. It advertises the tool to the agent, and sends it to `guide skill`. It names no version, so it doesn't go stale. The full steps are the [`automatica11y-runner`](https://github.com/thedannywahl/automatica11y/tree/main/skills/automatica11y-runner) skill, which ships in the package and is what `guide skill` prints. Copy it too if you want the steps available without the network. They're also on this site as [the agent steps](agent-steps.md), with a page for each reference.

## AGENTS.md.

[`AGENTS.md`](https://github.com/thedannywahl/automatica11y/blob/main/AGENTS.md) is for agents that read it but don't load skills. It points to the same steps, and tells contributors how to run and change the code.

## Version safety.

The steps name the version series they were written for, and the first thing they do is check it. If the installed tool is the wrong series, the agent stops and says so, instead of running steps that don't match. An installed copy can be older than the steps expect. In that case use `npx`, which always fetches the latest.
