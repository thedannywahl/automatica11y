# Spike: package name

Result: unconfirmed. `npm publish --dry-run` passes, but a dry run can't prove the name is claimable.

- Stub package: `automatica11y` 0.2.0, ESM, MIT. Dry run printed `+ automatica11y@0.2.0` with no errors.
- The registry shows an unpublished tombstone: version 0.1.1 was published October 31, 2016 and unpublished July 17, 2020. npm blocks republishing that exact version, so we start at 0.2.0.
- `npm whoami` fails here (not logged in). A real publish needs a logged-in npm user with publish rights.
- `@instructure/automatica11y` returns 404. That says the package doesn't exist, not whether the `@instructure` scope is ours to publish under.

Next step for Danny: decide the registry and scope (public npm, scoped, or GitHub Packages). Then confirm the name with a real publish from a logged-in account. We haven't published anything.
