# Using it with an AI agent.

The tool prints its own guidance, so any agent that can run `npx` can learn to use it. If the tool is installed globally, the agent can run `automatica11y guide skill` instead of `npx automatica11y@latest guide skill`:

```bash
npx automatica11y@latest guide           # where to start (the AGENTS.md file)
npx automatica11y@latest guide skill     # the full steps: build the command, run it, write the report
npx automatica11y@latest guide fixtures  # how to write the fixtures an npm package needs
```

The guidance ships with the tool, so it always matches the version you run. Tell your agent to run `npx automatica11y@latest guide` and follow it, then ask for things like "How accessible is Radix Dialog?" or "Compare the accessibility of React Aria and Headless UI." The agent needs to run shell commands and read and write files. Nothing here is tied to one agent.

## Skills.

If your agent loads skills from a folder, copy [`skills/automatica11y`](https://github.com/thedannywahl/automatica11y/tree/main/skills/automatica11y) into it. That's one small file, `SKILL.md`. It advertises the tool to the agent, and sends it to `guide skill`. It names no version, so it doesn't go stale. The full steps are the [`automatica11y-runner`](https://github.com/thedannywahl/automatica11y/tree/main/skills/automatica11y-runner) skill, which ships in the package and is what `guide skill` prints. Copy it too if you want the steps available without the network. They're also on this site as [the agent steps](agent-steps.md).

## AGENTS.md.

[`AGENTS.md`](https://github.com/thedannywahl/automatica11y/blob/main/AGENTS.md) is for agents that read it but don't load skills. It points to the same steps, and tells contributors how to run and change the code.

## Version safety.

The steps name the version series they were written for, and the first thing they do is check it. If the installed tool is the wrong series, the agent stops and says so, instead of running steps that don't match. An installed copy can be older than the steps expect. In that case use `npx`, which always fetches the latest.
