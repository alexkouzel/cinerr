# Conventions

## Python

- Stdlib first. `pymediainfo` is the only runtime dependency. Do not add new ones without strong justification.
- Private functions and attributes are prefixed with `_`.
- Type hints and docstrings are used sparingly, mainly on public entry points. Don't add them to trivial helpers.
- Logs: `print(f"[module] ...", file=sys.stderr, flush=True)`.
- Filenames are `snake_case`.

## JavaScript

- No dependencies, no build step. Browser-native ES modules only.
- Services and components are static-method classes. Instantiation is avoided.
- Inside a class, members are grouped under `// --- public ---` and `// --- private ---` banners. Private members are prefixed with `_`.
- Logs: `console.log('[module] ...')`.
- Filenames are `kebab-case`.

## Both

- Match the surrounding style before inventing a new one.
- Prefer deleting code over adding flags or shims for backwards compatibility.
