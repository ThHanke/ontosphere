---
title: Slips with scripted edits, git and the shell that cost time or nearly lost work
date: 2026-11-10
category: docs/solutions/developer-experience/
module: development workflow (shell, git, scripted code edits)
problem_type: developer_experience
component: development_workflow
severity: medium
applies_when:
  - Editing many files with a script
  - Using git stash, git add on directories, or kill/pkill from an agent shell
tags: [git, stash, pkill, scripted-edits, nul-byte, workflow, shell]
---

# Slips with scripted edits, git and the shell

## Context
Each of these happened during one release-prep session and was caught by checking the result. They are listed because each is easy to repeat.

## Guidance
- **`pkill -f` from the agent's shell kills that shell** (the pattern matches its own command line). Find the PID, verify what it is (`readlink /proc/<pid>/cwd`, `ps -o args= -p <pid>`), then `kill <pid>`.
- **`git stash -- <file>` stashes every uncommitted change of that file**, not one hunk. To test "does this test fail without my fix", copy the file aside, edit, run, copy back, and verify with a grep for the fix.
- **`git add <dir>` picks up unrelated untracked files** (`scripts/gen-arch-svg.mjs` was committed once by `git add scripts`). Add explicit paths and check `git show --stat HEAD` before moving on; amend only your own unpushed commit.
- **A scripted import insertion matched the first "import" substring, inside a comment** ("imported schema axioms"). Insert at the first top-level statement (`^(import|export|const|type|interface )`), then run `tsc`.
- **A scripted slice between two markers deleted helper functions** that sat between them. Diff after every scripted slice and restore from `git show HEAD:<file>` what was lost.
- **A literal NUL byte inside a string makes the file binary to grep** (`file` says "data"); write `'\u0000'` instead. Check with `tr -cd '\000' < file | wc -c`.
- **`cd` in a persistent shell changes the working directory for later commands**; use subshells or absolute paths.

## Why This Matters
Each slip is silent until something else breaks; two of them (stash, directory add) touch work that is hard to recover or unrelated to the change.

## When to Apply
Whenever an agent session edits code with scripts, commits, or manages processes.

## Examples
```bash
cp src/workers/rdfManager.runtime.ts logs/runtime.bak   # not: git stash -- <file>
# ...edit, run the test, then:
cp logs/runtime.bak src/workers/rdfManager.runtime.ts && grep -c "the fix marker" src/workers/rdfManager.runtime.ts
git add src/specific/file.ts && git show --stat HEAD
```

## Related
- `docs/solutions/workflow-issues/verify-what-you-measured-wrong-build-vacuous-typecheck-skipped-tests-2026-11-10.md`
