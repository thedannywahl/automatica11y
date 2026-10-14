---
"automatica11y": patch
---

Run conditions checks three at a time in isolated browser contexts, preserving result order and limiting concurrent pages. Clear completed check timers so audits and tests do not wait for unused timeouts before exiting.