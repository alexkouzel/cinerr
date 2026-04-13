# Frontend

Vanilla JavaScript, no build step. ES modules loaded directly by the browser.

Three pages live under `public/`: the main app, a public demo, and a marketing landing page. Each is self-contained with its own `index.html`, `index.css`, and `index.js`. Shared code lives under `public/shared/`.

Shared scripts are split into two strictly independent layers:

- **components**: UI. Touch the DOM, hold view state, expose imperative methods.
- **services**: business logic. CSV parsing, view-model building, state machines, HTTP calls.

## Layering rule

**Services must never import components. Components must never import services.** The two layers are independent and testable in isolation.

Each page's `index.js` is the only place that knows about both. It wires them together by passing service callbacks into component hooks, or by subscribing components to service events.

## Why this matters

- Services are unit-testable without a DOM or jsdom.
- Components can be restyled or replaced without touching business logic.
- A new page can reuse any combination of services and components without inheriting coupling from existing pages.

## Related context

- [project.md](project.md): high-level project overview.
- [backend.md](backend.md): the API the frontend consumes.
- [testing.md](testing.md): test suites.
