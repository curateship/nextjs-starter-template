# What the AI costs

- **Every call goes through the shell's usage meter** (`runAiCall`), tagged `dating-read-card`, `dating-draft-reply` or `dating-review-profile`, so it shows on the AI usage screen like any other.
- **There is no table of Date's own.** The cap reads the meter's rows for those tags.
- **The price is Date's own for now.** Claude Opus 5.5 is $4 per million tokens in and $20 out, from the claude-api skill's table cached 6 Oct 2026. The shell's price list (`src/lib/ai/ai-models.ts`, a shell file) does not have the model yet, so the AI usage screen shows these calls at $0 until the shell adds it.
- **The cap**, $20 a month by default, is in Settings → Dating. Once this month's spend reaches it, no call is made. Swiping stops, and the Swiping card says "Spend cap reached" and shows the spend against the cap. A button that needs the AI says the same in its message.
- **The cap is a pause, not a failure.** A card or a chat the cap held back keeps no error, so the AI reads or drafts it as soon as the month turns over or the cap is raised.
- **A card should cost about 1 to 3 cents**, with up to nine photos shrunk to 768 pixels and the AI at low effort. That is an estimate from the token prices, not a measurement: the first real call, on 18 Oct 2026, was refused by Anthropic because the account has no credit left. Measure it on the first real card and correct this line.
