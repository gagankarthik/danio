# Contributing to Danio

Thanks for your interest in Danio! It's a small, from-scratch framework, and its whole
premise is that the source stays **readable** — so contributions that keep it clear and
well-tested are especially welcome.

## Ways to help

- **Report a bug** — open an issue with a minimal reproduction (a few lines of code or a
  small repo). What you expected, what happened, and your browser/Node version.
- **Suggest a feature** — open an issue describing the use case first, before writing code.
  Danio aims to stay tiny, so new API is weighed against the size and clarity it costs.
- **Improve docs** — typos, unclear explanations, and missing examples are all fair game.
- **Send a pull request** — see below.

## Getting set up

Danio has no runtime dependencies; the only dev dependencies are Vite (to compile JSX),
jsdom (to test), and TypeScript (to type-check).

```bash
git clone https://github.com/gagankarthik/danio.git
cd danio-js
npm install

npm run dev        # the example app at http://localhost:5173
npm test           # the test suite (runs against a real DOM via jsdom)
npm run typecheck  # tsc, no emit
npm run bench      # the bailout benchmark
```

## Project layout

```
src/core/     the engine — elements, dom, scheduler, reconciler, hooks, context
src/store/    createStore, middleware, bindings
src/router/   the History-API router
src/server/   renderToString / renderToStaticMarkup (SSR)
types/        hand-written TypeScript definitions
test/         unit tests (node --test + jsdom)
docs/         GUIDE.md (using it) and ARCHITECTURE.md (how it works)
example/      a real app that exercises routing, store, and hooks
```

## Pull request checklist

1. **Branch** off `main`.
2. **Add or update tests** — `test/danio.test.mjs` runs against a real DOM. Bug fixes should
   come with a test that fails before the fix and passes after.
3. **Keep it readable** — plain JavaScript, meaningful names, and a comment when the code
   can't explain *why* on its own. Match the surrounding style; there's no build magic to
   hide behind.
4. **Run the full gate locally:**
   ```bash
   npm test && npm run typecheck
   ```
5. **Keep the public API and types in sync** — if you change an export, update
   `types/index.d.ts` (and `types/server.d.ts` for SSR) to match.
6. **Update the docs** if behaviour changes — `docs/GUIDE.md`, `docs/ARCHITECTURE.md`, or the
   README as appropriate.
7. **Describe the change** in your PR: what problem it solves and how you verified it.

## Design principles

Keep these in mind — they're why Danio exists:

- **Readable over clever.** If a reviewer can't follow it in one pass, simplify it.
- **Small over complete.** Every feature costs bytes and cognitive load. Prefer composition.
- **Honest over hyped.** Document limitations plainly; don't paper over them.

## Code of conduct

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree
to uphold it.

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE), the same license that covers the project.
