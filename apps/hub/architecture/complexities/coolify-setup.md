# Coolify Custom Domain Setup

Hub is one Next.js app that serves many sites. Each site can have its own custom domain, but all domains still need to route into the same Coolify application.

## The Two Domain Steps

There are two separate systems involved:

1. **DNS** tells the internet where the domain points.
2. **Coolify** tells the server which app should receive that domain.

Cloudflare DNS can point `example.com` at the server, but Coolify still needs `example.com` in the Hub app domain list. If Coolify does not know the hostname, the request will not route correctly.

## One-Time Coolify Env Setup

The Hub app needs these server-only env vars once:

```env
COOLIFY_BASE_URL=
COOLIFY_API_TOKEN=
COOLIFY_HUB_APP_UUID=
```

These let Hub call the Coolify API.

- `COOLIFY_BASE_URL` is the Coolify dashboard/API base URL.
- `COOLIFY_API_TOKEN` is the API token Hub uses to update Coolify.
- `COOLIFY_HUB_APP_UUID` is the Coolify app UUID for the Hub app.

After these are set, new custom domains can be added from Hub without manually editing Coolify each time.

## Why `systemeverything.com` Already Worked

`systemeverything.com` worked before this setup because it was already added to Coolify manually.

That means Coolify already knew to route:

```text
systemeverything.com
www.systemeverything.com
```

New domains are different. DNS may point to the server, but Coolify does not know about each new hostname until Hub adds it through the API.

## New Domain Flow

When a user saves a custom domain in Hub:

1. Hub sanitizes the domain and stores the non-`www` version as canonical.
2. Hub checks for the ownership TXT record.
3. If verified, Hub calls Coolify.
4. Coolify adds `https://domain.com`.
5. For root domains, Coolify also adds `https://www.domain.com`.
6. The site record is saved with the custom domain.

The DNS records still need to exist in Cloudflare. Hub does not create customer DNS records unless a separate Cloudflare integration is built for that domain owner.

## When This Breaks

If saving a custom domain returns:

```text
Coolify domain wiring is not configured
```

then one or more of the three Coolify env vars are missing from the Hub app or the running app needs a restart.

If the error mentions a TXT record, Coolify setup is probably fine and the domain ownership record has not propagated yet.

## Important Notes

- These env vars belong on the Hub app, not pgadmin or the database.
- The values are runtime-only; they do not need to be available at build time.
- The env var names should be visible in Coolify, but secret values are masked.
- Recreate the API token only if the old token is revoked or leaked.
- Update `COOLIFY_HUB_APP_UUID` only if the Hub app is recreated in Coolify.
