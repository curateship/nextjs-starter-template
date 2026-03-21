# Security Rules

- Never hardcode credentials in client-side code
- Always validate authentication server-side
- Every `'use server'` action that mutates data must verify auth + ownership independently — middleware only protects UI routes, not server action calls
- Use secure session management (httpOnly cookies, proper JWT expiration)
- Check for XSS, CSRF, SQL injection, and OWASP Top 10 after every code change
- Never add `.trim()` to input sanitization — it breaks typing spaces
