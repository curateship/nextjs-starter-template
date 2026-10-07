# AI backgrounds and soundscapes

A Pro member types what they want and gets it a minute or two later: an animated
background from Google's Veo, or an ambient loop from ElevenLabs. Five
backgrounds and twenty soundscapes a month.

## What a member sees

"Generate your own" is one card under the uploads on `/backgrounds` and
`/sounds`, drawn to Tyler's Sounds design of 7 Oct 2026. Its heading reads
"GENERATE YOUR OWN" with an orange "PRO", and this month's counter sits beside
it ("20 of 20 left this month"). Under it come the sentence saying what it
does, the three suggestions as pills, and a list of what has been asked for
and how it went. The prompt box runs along the card's foot under a full-width
divider, with no frame of its own, and the orange Generate button at its
right end. Clicking a suggestion fills the box and puts the cursor in it. A finished one is an ordinary upload, so it
appears in the grid above and the list just says "In the grid above".

Nothing is pressable until the server has answered, and a shut control always
says why:

- A guest is told to sign in on a Pro plan.
- A free account is told AI generation is a Pro perk.
- **A server with no provider key says so plainly** rather than taking the
  request and failing a minute later: "AI backgrounds are not switched on yet."
  or "AI soundscapes are not switched on yet." A member cannot reach the
  provider settings, so the line no longer tells them about operators and
  keys. Operators see the keys on Settings → AI in the admin.
- A member who has used the month's allowance is told when the next lot arrives.

**A prompt that is too short does not grey the button out.** Prompts need 5
characters (`PROMPT_MIN_LENGTH` in `src/lib/pomodoro/generation.ts`). Pressing
Generate on fewer says "Describe it in a few more words." under the box, marks
the box `aria-invalid`, and sends nothing. Typing clears the line. The button
used to go grey with no reason at all, the one shut control in the product that
did not say why.

**A failed line has Try again.** Pressing it puts that line's prompt back in the
box, replacing whatever was there, and moves the cursor into it. It does not
send on its own; Generate still does that. A failed generation is refunded, so
the only cost of trying again was retyping it. Lines that worked or are still
running have no button, and neither does a failed line while the box is shut
(a free plan or no provider), because the words would have nowhere to go.

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

## What it costs, and where an operator sees it

Every attempt that reaches a provider is one row on the shell's AI usage page
(Settings → AI, then AI usage), beside every other AI call, filed under
"pomodoro background" or "pomodoro soundscape" with the member and the model.
Tyler asked for this on 7 Oct 2026, because the Google bill was the only place
the spend showed.

- **A finished background is 8 seconds of `veo-3.1-lite-generate-preview`,
  $0.40.** Google's Gemini API price page lists Veo 3.1 Lite at $0.05 a second
  at 720p, checked on 7 Oct 2026.
- **A finished soundscape is 30 seconds of `eleven_text_to_sound_v2`, $0.06.**
  ElevenLabs' API price page lists sound effects at $0.12 a minute, checked on
  7 Oct 2026.
- **The prices live in the shell's price list**, `src/lib/ai/ai-models.ts`,
  added in custom-shell first and copied here. When a provider changes its
  price, that list is the one place to change, and the comment beside each
  line says the date it was checked.
- **The cost is booked the moment the provider hands the file back**, because
  that is when it charges. A file that then fails in FFmpeg or storage still
  shows as spent, and the member gets their credit back as before.
- **An attempt the provider refused or never finished is a failed row at $0**,
  with this app's own reason (`PROVIDER_TIMEOUT`, `PROVIDER_REQUEST_FAILED`),
  never the provider's words. An error that is not one of this app's codes
  is filed as `PROVIDER_FAILED`, because it can carry a piece of the
  provider's reply. A retry is a second row.
- **A missing key records nothing**, because nothing reached a provider.
- **The member's limit is still the monthly credits above.** The worker never
  checks the shell's dollar allowance before a render, so a render is never
  refused by it. The spend does count toward that allowance and its warnings
  if a plan ever sets `aiDollars`; Tyler chose that on 7 Oct 2026. No plan sets
  one today.
- **One gap:** a Veo render that times out on this side may still finish and
  be billed by Google. It shows as a failed row at $0, so the usage page can
  read slightly under the Google bill.

The recording is `src/server/pomodoro/generation-spend.ts`, called from the
worker, and the models and lengths both requests and the meter read are
`GENERATION_MODELS` in `src/lib/pomodoro/generation.ts`.

## The bell

A finished background or soundscape says so in the bell, with the prompt
underneath, and leads to the page it was made on. One that gave up says the
credit is back. Both are written in the same transaction as the credit being
counted or refunded. The bell also warns once at one credit left and once at
none left, per month and kind, and the none-left notice names the day they come
back. See [Notifications](notifications.md).

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
- `src/server/pomodoro/generation-spend.ts` — the rows on the AI usage page.
- `src/lib/api/pomodoro/generation.ts` — two server functions, both guarded.
- `src/components/pomodoro/media-generator-section.tsx` — the panel.

Tables `pomodoro_generation_usage` and `pomodoro_generations` are migration
0092.
