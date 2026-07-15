# __APP_NAME__

A [Danio](https://www.npmjs.com/package/danio-js) app.

## Develop

```bash
npm install
npm run dev
```

Open http://localhost:5173. Edit `src/App.jsx` and save — the page updates instantly.

## Build & deploy

```bash
npm run build
```

The `dist/` folder is a static site. Deploy it as-is:

- **Vercel** — `vercel` (framework preset: *Other*; build `npm run build`, output `dist`)
- **Netlify** — build `npm run build`, publish `dist`
- **AWS Amplify** — build `npm run build`, artifacts base directory `dist`
- **GitHub Pages / any static host** — upload `dist/`

## Learn Danio

If you know React, you already know Danio: same `useState`, `useEffect`, JSX, and component
model. See the [Danio docs](https://www.npmjs.com/package/danio-js) for hooks, the store, and the
router.
