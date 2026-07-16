# Directory

Directory is the Vite, TanStack Start, React Server Components, and Nitro port of Hub. Hub remains a separate app and owns database migrations; Directory connects to the same database at runtime.

## Development

```bash
npm install
npm run dev
```

The dev server reads Directory's assigned port from `local-apps.json` and fails if that port is unavailable.

Required runtime secrets are documented in `.env.example`.
