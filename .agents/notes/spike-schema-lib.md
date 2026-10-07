# Spike: schema library

Result: keep valibot.

Cold-start times are `node --input-type=module -e` runs, median of seven, on Node 24.21.0. A bare `node -e "0"` took 57 ms median (40 ms min), so subtract that.

| Library | Version | Install size | Import only (median) | Import and parse (median) |
|---|---|---|---|---|
| valibot | 1.5.0 | 1.8 MB | 45 ms | 42 ms |
| zod | 4.6.5 | 8.2 MB | 95 ms | 94 ms |
| arktype | 2.2.7 | 0.6 MB, plus 0.95 MB in `@ark` | 244 ms | 208 ms |

- Valibot sits at the noise floor. Zod 4 adds about 40 ms. ArkType adds about 150 to 190 ms.
- ArkType's TypeScript inference doesn't help in a JSDoc-only codebase.
- The test schema was small (a nested object with an array and an enum). It's representative of the plan and mapping files.

Decision: valibot.
