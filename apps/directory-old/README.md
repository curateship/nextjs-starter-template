# Directory

Directory is the Vite, TanStack Start, React Server Components, and Nitro port of Hub. Hub remains a separate app and owns database migrations; Directory connects to the same database at runtime.

## Development

```bash
npm install
npm run dev
```

The dev server reads Directory's assigned port from `local-apps.json` and fails if that port is unavailable.

Required runtime secrets are documented in `.env.example`.

## Production

Directory is the production deployment target. The repository root `Dockerfile` builds this app and runs the Nitro server output:

```bash
docker build \
  --build-arg VITE_APP_URL=https://your-app-host \
  --build-arg VITE_APP_DOMAIN=your-base-domain \
  -t directory-prod .
```

`VITE_APP_URL` and `VITE_APP_DOMAIN` are build arguments, not runtime variables. Vite freezes them into the bundle, so changing either one requires a rebuild. The build fails if they are missing rather than silently falling back to the local dev origin.

The container listens on port 3000 and starts with `node apps/directory/.output/server/index.mjs`. Port 3000 is the container port kept unchanged from the previous Hub image so the deployment proxy configuration keeps working; `local-apps.json` still owns Directory's local dev port.
