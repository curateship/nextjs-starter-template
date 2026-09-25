# AI providers, keys, and usage

The AI settings support four providers:

- Anthropic, OpenAI, and Gemini provide text models.
- ElevenLabs provides models priced by a unit such as a character rather than
  an input and output token pair.

An admin may save a provider key in Settings or let the server use its matching
environment variable. Saved keys take priority and the server encrypts them at
rest. If a saved key cannot be decrypted, the settings page reports the problem
instead of silently switching to the environment key.

## Model and key checks

The model catalog is defined in one place with provider ids and prices. The key
test makes a small real request to the selected provider. A successful test
records its usage, so the usage totals include setup checks as well as product
requests.

## Allowances

Each AI call records the user, workspace, provider, model, quantity, and cost in
cents. Plans can include a monthly AI dollar allowance. An admin may override a
single account's allowance without changing the plan.

Allowance handling is consistent across providers:

- The server warns when an account has used four fifths of its allowance.
- The server sends another alert and stops calls when no allowance remains.
- Admins can see provider and account totals.
- Members can see their current usage in Account.

Provider calls must go through the usage wrapper. A direct SDK call would skip
allowance checks and cost records.
