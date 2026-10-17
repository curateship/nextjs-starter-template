# AI providers, keys, and usage

The AI settings support four providers:

- Anthropic, OpenAI, and Gemini provide text models.
- ElevenLabs provides models priced by a unit such as a character rather than
  an input and output token pair.

An admin may save a provider key in Settings → AI or let the server use its matching
environment variable. Saved keys take priority and the server encrypts them at
rest. If a saved key cannot be decrypted, the settings page reports the problem
instead of silently switching to the environment key.

On a live app deployed with the `deploy-app` skill, the deploy writes Tyler's
keys into the same saved rows, encrypted with that app's own key, so live
Settings → AI shows them as set without anyone pasting them. The keys come from
the private keys file on Tyler's Mac, and that file wins: a different key
pasted on live is replaced by the next deploy. The skill's "The AI keys"
section has the details.

## Model and key checks

The model catalog is defined in one place with provider ids and prices. The key
test makes a small real request to the selected provider. A successful test
records its usage, so the usage totals include setup checks as well as product
requests.

A failed test shows the provider's own sentence beside the status number, such
as Anthropic's "Your credit balance is too low" or ElevenLabs' "missing the
permission user_read". A bare number is shown only when the provider sent no
reason. The key is blanked out of that sentence if a provider ever repeats it.
On 8 Oct 2026 three keys failed for three different reasons and the screen
showed only 400, 404 and "rejected", which is why.

The test waits 15 seconds. A provider that answers slower than that is
reported as taking too long, which is usually the provider being busy, not the
key. "Could not be reached" is kept for a request that never got an answer at
all. Gemini, overloaded on 8 Oct 2026, was told to check the server's internet
connection before the two were separated.

Gemini's two models are `gemini-3.8-flash`, which is also the default and the
key test's model, and `gemini-3.1-pro-preview`. Google stopped offering
`gemini-2.5-flash` and `gemini-2.5-pro` to new accounts, and a key made after
that gets a 404 from either. Their price rows stay so older usage rows keep
their cost. On 8 Oct 2026 Tyler's Google key got "You exceeded your current
quota" from 3.1 Pro on its first call while 3.8 Flash worked, which points to an
account with no Pro allowance rather than a wrong model name.

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
