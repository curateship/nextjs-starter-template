# System emails

System emails are the messages the product sends for fixed events such as:

- Email verification and password reset.
- Account changes.
- Billing and notifications.
- Automation work.

The event decides the message kind. An admin can edit the wording and layout
without changing the server action that sends it.

The System emails dashboard lists every supported kind. Each editor can preview,
save, send a test, and return to the built-in default. Resetting a template
changes future mail only. It does not rewrite earlier send records.

## Delivery records and retries

Each attempt creates a system email send record with the recipient, message
kind, provider id, status, and failure detail. The Recent sends panel reads
those records inside the dashboard's shared panel frame.

A temporary provider failure can create a pending send. The background pass
retries eligible pending mail and stops after the saved retry policy says the
attempt is final. Provider webhooks update later delivery state after the
initial send call has returned.

Local development can capture messages in the Dev outbox instead of sending
them to real addresses. The outbox shows:

- Subject and recipient.
- Rendered body.
- Send time.

Email settings hold:

- Sender details.
- The Resend key and webhook secret.
- Link expiry and retry defaults.

Secrets stay on the server and saved provider keys are encrypted at rest.
