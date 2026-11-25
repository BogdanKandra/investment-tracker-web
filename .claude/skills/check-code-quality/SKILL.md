---
name: check-code-quality
description: Run every code-quality gate for investment-tracker-web (type-check, lint, format check, tests, production build) and report the results. Use after any non-trivial change, before suggesting commit messages, or when asked to verify the project.
---

# Check code quality

Run the project's quality gates and report each one's result. Run them all
even if an early one fails, so the report is complete.

## 1. Core gates

Use the **PowerShell** tool. Vitest fails with "failed to find the current
suite" when Git Bash's working directory is MSYS-style (`/c/Users/...`).
From Git Bash, `cd "C:/Users/..."` first, or use PowerShell.

Run each separately (not `npm run check`, which stops at the first failure):

| Gate   | Command                                   | Passes when                             |
| ------ | ----------------------------------------- | --------------------------------------- |
| Types  | `npx tsc -b`                              | no output                               |
| Lint   | `npx eslint .`                            | no output                               |
| Format | `npx prettier --check . --log-level warn` | no output                               |
| Tests  | `npx vitest run`                          | "Test Files … passed", no failed tests  |
| Build  | `npx vite build`                          | "built in", no "(!)" chunk-size warning |

If Format fails, offer `npx prettier --write <files>` on the files you changed
rather than formatting the whole tree.

## 2. Extra checks, when relevant

- **Changed the portfolio loader, `data/`, or build config**: check that a
  clone without the gitignored `data/portfolio.json` still builds. Copy the
  tracked and new files (`git ls-files -co --exclude-standard`) to a temp
  folder, link `node_modules` with `cmd /c mklink /J`, run `npx vite build`
  there, then remove the junction with `cmd /c rmdir` **before** deleting the
  folder (deleting through a junction can delete the real `node_modules`).
- **Changed anything about which data gets bundled**: `npx vite build --mode demo`
  must not emit a `portfolio-*.js` chunk (only `portfolio_test-*.js`).
- **Changed dependencies**: `npm audit --omit=dev` (needs network).
- **Changed calculations**: `npx vitest run --coverage` and look at the
  coverage of the files you touched.

## 3. Report

List each gate with pass/fail. For a failure, include the first relevant lines
of output and the file:line, and say whether the change caused it or it was
already failing before (check with `git stash` only if the working tree has no
other agent's work in progress; otherwise say you could not tell).
