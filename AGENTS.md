## Assumptions

The project is green field. No migrations or legacy code to worry about. All breaking changes are allowed. The goal is to build the best possible solution given the current state and constraints provided without hestiations of removing something old.

## Rules

- Env Management: Using @t3-oss/env-core package.
- Typescript: Using tsgo.
- Linting & Formatting: Using oxfmt & oxlint
- Testing: Using vitest

## Gotchas

- Project is using tanstack start. Issues with shell expansions are common when trying to read files with dollar sign in them.