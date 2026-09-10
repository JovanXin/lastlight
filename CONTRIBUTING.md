# Contributing

## Workflow

`main` is always the deployable branch. Work happens on short-lived branches
that are merged through a pull request, even for small changes:

```sh
git checkout -b feat/short-description main
# small, focused commits
npm test
git push -u origin feat/short-description
gh pr create --base main --head feat/short-description
gh pr merge --merge --delete-branch
git checkout main && git pull
```

Branch prefixes: `feat/` for user-visible behaviour, `fix/` for bugs,
`docs/` for prose, `test/` for test-only changes, `chore/` for tooling.

## Commits

Commit early and often. Each commit should be a coherent, describable change,
and the message should say what changed and why:

```
Add map click-to-position and keyboard shortcuts

Clicking the map outside draw mode snaps to the nearest point on the route
so you can ask what if I am here, reporting the off-route distance.
```

A pull request can hold many commits; that is expected and encouraged.

## Tests

- Every change to `src/core/` or `src/services/` needs a test.
- `npm test` must pass before a pull request is opened.
- Bug fixes should include the failing case as a test first.

## Style

- ES modules, no build step, no runtime dependencies.
- Prefer small pure functions with explicit inputs over hidden global state.
- Keep the UI dumb: decisions belong in `src/core/`, formatting in `src/ui/`.
