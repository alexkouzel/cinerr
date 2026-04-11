# Conventions

Small, consistent rules that keep the codebase readable without tooling. Follow them when adding or editing code.

## Python

- Stdlib first. `pymediainfo` is the only runtime dependency. Do not add new ones without strong justification.
- Private functions and attributes are prefixed with `_`.
- Type hints and docstrings are used sparingly, mainly on public entry points. Don't add them to trivial helpers.
- Logs go to stderr in the form `print(f"[module] ...", file=sys.stderr, flush=True)`.
- Four-space indent, double-quoted strings.
- Filenames are `snake_case`.

## JavaScript

- No dependencies, no build step. Browser-native ES modules only.
- Services and components are static-method classes. Instantiation is avoided.
- Inside a class, members are grouped under `// --- public ---` and `// --- private ---` banners. Private members are prefixed with `_`.
- Logs use `console.log('[module] ...')`.
- Four-space indent, single-quoted strings.
- Filenames are `kebab-case`.

## Both

- Match the surrounding style before inventing a new one.
- Prefer deleting code over adding flags or shims for backwards compatibility.

## Related context

- [project.md](project.md): high-level project overview.
- [backend.md](backend.md): what the backend does.
- [frontend.md](frontend.md): frontend layering.
