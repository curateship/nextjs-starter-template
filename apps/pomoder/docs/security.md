# Security model

- Passwords use Argon2id; session and auth tokens are random, stored hashed, expire, and use secure HttpOnly SameSite cookies.
- Registration/login/reset endpoints validate origins and use PostgreSQL-backed rate limits.
- Protected operations resolve the current user server-side and apply owner/member/host/entitlement checks.
- Stripe controls prices; webhook state is accepted only after signature verification and event deduplication.
- Upload MIME claims are checked against file signatures and size/quota limits before R2 storage.
- AI prompts are bounded; provider output is treated as untrusted bytes and normalized by FFmpeg.
- R2 is private. Curated assets may be public, but user assets use authorized range routes.
- Admin media keys are constrained to curated or matching owner namespaces and ownership/storage fields are immutable after creation.
- Admin password resets revoke all existing sessions. Credential, role, billing, and destructive mutations write immutable audit records in the same database transaction.
- Media and user deletion writes object keys to a durable PostgreSQL deletion queue; the worker retries R2 cleanup without losing failed jobs.
- Nitro supplies CSP, HSTS, frame, MIME, referrer, and permissions headers.
- Logs and Sentry disable default PII and redact credentials, tokens, email, and prompts.

Production requires explicit origins, metrics token, Stripe/Resend/provider credentials, private R2 credentials, TLS, and secret rotation through Coolify.
