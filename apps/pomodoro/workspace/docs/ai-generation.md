# AI backgrounds and soundscapes

A Pro member types what they want and gets it a minute or two later: an animated
background from Google's Veo, or an ambient loop from ElevenLabs. Five
backgrounds and twenty soundscapes a month.

## What a member sees

"Generate your own" sits under the uploads on `/backgrounds` and `/sounds`: a
prompt box, three suggestions to click, this month's counter, and a list of what
has been asked for and how it went. A finished one is an ordinary upload, so it
appears in the grid above and the list just says "In the grid above".

Nothing is pressable until the server has answered, and a shut control always
says why:

- A guest is told to sign in on a Pro plan.
- A free account is told AI generation is a Pro perk.
- **A server with no provider key says so plainly** rather than taking the
  request and failing a minute later: "AI generation is not set up on this
  server yet. An operator needs to add the provider key under Settings → AI."
- A member who has used the month's allowance is told when the next lot arrives.

## The credit rule

**A member is never charged for a file they did not get.** That is the whole
point of the ledger, and it is the one thing with tests against a real database.

A credit is taken the moment the request is accepted, not when the file arrives.
Taking it up front is what stops twenty videos being queued while the first is
still rendering. The row is locked for the length of the transaction, so two
requests sent at the same moment cannot both read "one left" and both take it.

A failed attempt goes back in the queue once, because the usual cause is a
provider having a bad minute. When the attempts run out the request is marked
failed **and the credit is handed back in the same transaction**, so the ledger
can never show somebody charged for nothing. A failure that trying again cannot
fix — no provider key, no FFmpeg — skips the retry and refunds straight away.

A refund raises `refunded` rather than lowering `reserved`, so the ledger still
records that the attempt happened. `reserved - refunded` is what has been spent.

The monthly numbers come from the plan (`monthlyBackgrounds` and
`monthlySoundscapes` in the Pro perks), so a plan can move them without a code
change. A free plan has zero of each, which is what makes the panel say it is a
Pro perk.

## What happens after Generate

The request goes in `pomodoro_generations` and the `pomodoro-generations` worker
picks it up on the shell's fifteen-second loop, one per pass. One, because this
is the slowest thing the app does: a Veo render can take minutes, and the room
clock rides the same loop. Two people asking at once means the second waits.

The worker calls the provider, runs the result through the same FFmpeg step
uploads get (video to 720p without sound, audio loudness-normalised), then
stores it through the same path as an upload — the shell's media library, the R2
bucket, and a `pomodoro_media_uploads` row. From the picker's point of view
there is no difference between something a member made and something they
uploaded, so picking it, playing it and deleting it are all one code path.

Provider keys come from the shell's AI settings (Settings → AI), not from this
app's own environment, so an operator fills them in once and every AI feature
can see them.

## What the provider is never allowed to do

The two adapters in `generation-providers.ts` are the only code in this app that
talks to an outside service, and both are written on the assumption the reply is
not to be trusted.

- **The download address must be Google's own.** Veo's reply has changed shape
  between versions, so the code walks the reply looking for a URI rather than
  reaching for a fixed path — and only accepts one on
  `generativelanguage.googleapis.com`. The download also sets
  `redirect: "error"`, so a reply cannot bounce the server somewhere else.
- **A provider's own error text never reaches the member.** Those name models
  and quotas, which tells a member nothing and an attacker something. Every
  failure becomes one of a handful of plain sentences.
- **The member's prompt goes inside a frame**, so the result is usable as
  scenery: locked camera, no text, nobody talking at you.

## Where the code lives

- `src/lib/pomodoro/generation.ts` — the kinds, the suggested prompts and the
  wording, browser-safe.
- `src/server/pomodoro/generation.ts` — the ledger and the queue.
- `src/server/pomodoro/generation-providers.ts` — Veo and ElevenLabs.
- `src/server/pomodoro/generation-worker.ts` — one job per tick, registered in
  `src/app/server-options.ts`.
- `src/lib/api/pomodoro/generation.ts` — two server functions, both guarded.
- `src/components/pomodoro/media-generator-section.tsx` — the panel.

Tables `pomodoro_generation_usage` and `pomodoro_generations` are migration
0092.
