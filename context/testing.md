# Testing

Two parallel suites by language. Both run in CI as independent jobs.

## Backend (Python + pytest)

```
python -m pytest tests/backend/ -v
```

Covers the pure-logic modules in the backend: media scanning, metadata extraction, cache management, and job state.

## Frontend (Node built-in test runner, no deps)

```
node --test tests/public/
```

Covers the pure-logic services the frontend relies on: CSV parsing, view-model building, and the job state machine. DOM components and network-dependent modules are intentionally not covered.

## Philosophy

Tests are curated for bug-catching value, not coverage. Before adding a test, ask whether a realistic regression would actually break it. Trivial guards and one-branch-per-test cases are intentionally omitted to keep maintenance low.

New services should have tests. Components, HTTP routes, and anything requiring a DOM or live server do not.
