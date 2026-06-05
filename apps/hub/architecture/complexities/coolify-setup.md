# Coolify Custom Domain Setup

Hub is one Next.js app that serves many sites. Each site can have its own custom domain, but all domains still need to route into the same Hub container.

## The Two Domain Steps

There are two separate systems involved:

1. **DNS** tells the internet where the domain points.
2. **Traefik** tells the server which app should receive that domain.

Cloudflare DNS can point `example.com` at the server, but Traefik still needs a route for `example.com`. If Traefik does not know the hostname, the request will not route correctly.

## Preferred Live Traefik Setup

The no-restart flow uses Traefik dynamic config. Hub can either write the dynamic config directly if the directory is mounted into the Hub container, or call a small internal writer service.

Hub env vars:

```env
TRAEFIK_DYNAMIC_CONFIG_ENDPOINT=
TRAEFIK_DYNAMIC_CONFIG_TOKEN=
TRAEFIK_HUB_SERVICE=
```

Optional direct-write mode:

```env
TRAEFIK_DYNAMIC_CONFIG_DIR=/data/coolify/proxy/dynamic
```

`TRAEFIK_HUB_SERVICE` is the existing Traefik Docker service for Hub, for example:

```env
TRAEFIK_HUB_SERVICE=http-3-a5nnhgrzwx83prpn63pagwix@docker
```

The writer service lives in `services/traefik-config-writer`.

## Legacy Coolify Env Setup

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

These are kept as a fallback. Updating Coolify app domains may still require a Hub container restart before Traefik sees the new labels.

## Why `systemeverything.com` Already Worked

`systemeverything.com` worked before this setup because it was already added to Coolify manually.

That means Coolify already knew to route:

```text
systemeverything.com
www.systemeverything.com
```

New domains are different. DNS may point to the server, but Traefik does not know about each new hostname until Hub adds a dynamic route.

## New Domain Flow

When a user saves a custom domain in Hub:

1. Hub sanitizes the domain and stores the non-`www` version as canonical.
2. Hub checks for the ownership TXT record.
3. If verified, Hub writes a Traefik dynamic config route or calls the internal writer service.
4. Traefik reloads the route without restarting the Hub container.
5. For root domains, Hub routes both `domain.com` and `www.domain.com`.
6. Better Auth trusts login requests from verified custom domains by resolving the request host back to an active Hub site.
7. The site record is saved with the custom domain.

The DNS records still need to exist in Cloudflare. Hub does not create customer DNS records unless a separate Cloudflare integration is built for that domain owner.

## Managed Cloudflare DNS

For domains in our Cloudflare account, Hub can create the DNS records before checking TXT verification. This automatic DNS write only runs for `super_admin` users; other users still get the manual TXT instructions.

Hub env vars:

```env
CLOUDFLARE_DNS_API_TOKEN=
CLOUDFLARE_DNS_TARGET=5.78.189.158
CLOUDFLARE_DNS_RECORD_TYPE=A
CLOUDFLARE_DNS_PROXIED=true
CLOUDFLARE_DNS_ZONES=eatdrinktoronto.com:zone_id,example.com:zone_id
```

`CLOUDFLARE_DNS_ZONES` is optional if the token can list zones. Keep this token server-only and scoped to Cloudflare DNS edit permissions for the managed zones.

## When This Breaks

If saving a custom domain returns:

```text
Traefik domain wiring is misconfigured
```

then `TRAEFIK_HUB_SERVICE` is missing or invalid.

If saving a custom domain returns:

```text
Traefik domain wiring token is not configured
```

then `TRAEFIK_DYNAMIC_CONFIG_ENDPOINT` is set but `TRAEFIK_DYNAMIC_CONFIG_TOKEN` is missing.

If saving a custom domain returns:

```text
Coolify domain wiring is not configured
```

then one or more of the three Coolify env vars are missing from the Hub app or the running app needs a restart.

If the error mentions a TXT record, proxy setup is probably fine and the domain ownership record has not propagated yet.

## Important Notes

- These env vars belong on the Hub app, not pgadmin or the database.
- The values are runtime-only; they do not need to be available at build time.
- The env var names should be visible in Coolify, but secret values are masked.
- Recreate the API token only if the old token is revoked or leaked.
- Update `COOLIFY_HUB_APP_UUID` only if the Hub app is recreated in Coolify.
