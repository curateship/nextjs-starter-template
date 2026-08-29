# The database link is encrypted

Everything the app says to its database crosses the public internet between
the machine running the app and the German server. Since 29 August 2026 that
link is encrypted with TLS 1.3. Before then it was plain text — the database
password, session tokens and the encrypted exchange keys were all readable to
anyone on the wire, because the Postgres server did not offer TLS at all
(asked directly on 29 August 2026, it answered `N` to an SSLRequest).

## The server side

Postgres 18 on the German box (the Coolify-managed `postgres:18-alpine`
container behind the public port 54320) now runs with `ssl = on` and a
self-signed certificate valid to 2036. The certificate pair lives in the data
directory (`server.crt` / `server.key`), which is on the container's volume,
so it survives the container being recreated; `ssl = on` is set with
`ALTER SYSTEM`, which is stored the same way. Turning it on needed only a
config reload, not a restart, so no running connection — the live trading
engine's included — was dropped.

`ssl = on` accepts both encrypted and plain connections. That is deliberate:
the live containers keep connecting plain until their connection string
changes, so nothing broke the moment the server changed.

## The client side

The connection string carries `?uselibpqcompat=true&sslmode=require`. That is
node-postgres for "encrypt, and accept the server's self-signed certificate".
The two forms that look right and are not:

- `?sslmode=require` alone — node-postgres treats it as full certificate
  verification and refuses the self-signed certificate outright. This was
  confirmed against the live server, not assumed.
- No suffix — connects happily, encrypts nothing.

The web app's pool, the worker and the migration script all read the same
`CUSTOM_SHELL_DATABASE_URL` and all go through the same `pg` module, so one
suffix covers all three. Each was proven separately on 29 August 2026: the
migration script answered "Database already up to date" over the new string,
the worker health check answered "Worker healthy", and the restarted dev
server served the signed-in dashboard with a clean console while
`pg_stat_ssl` showed its connections encrypted.

## What still travels plain

The live web and worker containers, until the same suffix is added to
`CUSTOM_SHELL_DATABASE_URL` in Coolify on both resources. Changing that value
restarts the containers, so it rides the next deploy rather than being
flipped on its own. `.env.live` records the exact value Coolify must hold.

Verifying it after the deploy, from any machine that can reach the database:

```sql
select coalesce(client_addr::text,'local') as from_addr, ssl, count(*)
from pg_stat_activity join pg_stat_ssl using (pid)
where usename = 'trade' group by 1, 2;
```

Every row should say `ssl = true`. Rows saying `false` are connections still
on the old string.

Certificate pinning and `verify-full` were left out on purpose: they need a
certificate the client can verify, and getting the link encrypted at all was
the win. If the certificate is ever replaced with a CA-signed one, the suffix
can tighten then.
