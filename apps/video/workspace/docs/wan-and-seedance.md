# Wan and Seedance

An AI shot can be made by three companies' models: Google's Omni Flash, Wan 2.7
(Alibaba's video model) and Seedance 1.5 Pro (ByteDance's video model). Wan's
and Seedance's keys live on Settings → AI video, a tab of the Video app's own.
The shell knows nothing about either company.

The task is `workspace/tasks/ai-generation/15-wan-and-seedance.md`, and Tyler's
answers are written there.

## Settings → AI video

The tab is at `/admin/settings/ai-video` and is drawn by
`src/components/video-editor/ai-video-settings.tsx`. Everything on it saves by
itself.

- **Wan and Seedance cards:** a key box each, copied from the Pexels tab. A
  pasted key saves 0.7 seconds after the last keystroke, scrambled with the
  server's encryption key. Only its last four characters ever reach the
  browser. Test and Remove sit beside it.
- **Region:** a key works only at the address of the site it was made on.
  - Wan's sites are International (Singapore, `dashscope-intl.aliyuncs.com`)
    and China (Beijing, `dashscope.aliyuncs.com`).
  - Seedance's are BytePlus (`ark.ap-southeast.bytepluses.com`) and
    Volcengine (`ark.cn-beijing.volces.com`). Volcengine names the model with a
    `doubao-` prefix, and the app adds it.
- **Test this key** proves the key without making anything or spending money.
  Wan is asked about a job that does not exist. Seedance is asked for its list
  of jobs. A 401 from either means the key was refused. Neither company
  documents a free key check, so this way of checking is the app's own. On
  29 Oct 2026 a made-up key sent to Wan's real International address came back
  refused, as it should. A good key has not been tried.
- **New AI shots:** which model a new shot starts on, in the AI clip panel and
  in Make it move.
  - Wan's and Seedance's starting size and length are set here, and so is
    whether Seedance makes its own sound. Each line shows what a shot like
    that costs.
  - A model whose key is missing cannot be picked. If the picked model's key
    is removed later, new shots start on Google until a key is pasted again.
  - Google keeps the size its last shot was made at, as it always did.
- **This month:** AI shot pieces that arrived this UTC month, and their cost,
  for each of the three. It is read off the AI meter, the same month the
  allowance counts. A shot longer than 8 seconds is several pieces.

The keys are columns on `video_settings` (`drizzle/0143`), next to the Pexels
and YouTube keys. The defaults are in `video_settings.ai_defaults` as
`videoModel` and `videoModelDefaults`.

## What each model takes

`src/lib/video/video-models.ts` is the one list. Every screen and the worker
read it.

| | Google Omni Flash | Wan 2.7 | Seedance 1.5 Pro |
| --- | --- | --- | --- |
| Sizes | 360p, 720p, 1080p | 720p, 1080p | 480p, 720p, 1080p |
| Actor's pictures | yes | yes | no |
| End picture | no | yes | yes |
| Says a voiceover | no | yes | no |
| Sound switch | no | no, always makes sound | yes |

- **Every shot starts from a first frame**, the same as Google's: a first frame
  from the AI clip panel, or the picture on the timeline for Make it move.
  Every picture goes inside the request as a JPEG of at most 1536 pixels.
- **Lengths are the app's own:** 4, 6 or 8 seconds a piece. Longer shots are 8
  second pieces, each starting from the last frame of the piece before, the
  same as Google's (`longer-ai-clips.md`). Wan takes 2 to 15 seconds and
  Seedance 1.5 Pro takes 4 to 12, so both accept every piece.
- **Actor's pictures on Wan** go to Wan's reference model (`wan2.7-r2v`)
  beside the first frame, only on the first piece of a shot.
- **The rule for Wan's actor pictures:** with an end picture or a voiceover,
  Wan's frame model (`wan2.7-i2v-2026-04-25`) is used instead, and the actor's
  pictures are left out. The research did not show the reference model taking
  an end picture. The first frame already shows the actor.
- **Seedance never gets the actor's pictures.** It refuses a first frame and
  reference pictures in one request. It gets the first frame alone, which
  already shows the actor.
- **The end picture** is another first frame of the same project, picked from
  "Ends on" in the AI clip panel. Only the last piece of a shot lands on it.
- **A voiceover** is picked from "Says", which lists the voiceovers on the
  timeline that are no longer than the shot. Only the list leaves longer ones
  out; the server does not know a file's length and does not check it. Wan
  fetches the file itself from
  its public media address. It works only on a shot of 8 seconds or less.
  Whether Wan takes a link to the file rather than the file itself is
  unconfirmed (Alibaba's page shows links for pictures). Wan's own lip-sync
  model, `wan2.2-s2v`, runs only on the China site, so the app does not use it.

## How a shot is made

The background worker in `src/server/video/asset-factories/generations.ts`
makes Wan and Seedance pieces the same way it makes Google's. The request
building and answer reading are in `src/server/video/video-companies.ts`.

1. **Start.** The worker sends the request and gets back a job id. The id is
   saved as `<region>:<id>`, so the job is asked about on the site it started
   on even if the saved region changes. A "too many jobs" answer (429) puts the
   piece back in the queue for a later pass.
2. **Check.** Each pass asks about the job. Wan says `PENDING`, `RUNNING`,
   `SUCCEEDED` or `FAILED`. Seedance says `queued`, `running`, `succeeded` or
   `failed`. A piece gets an hour, against Google's 15 minutes, because both
   companies queue jobs on busy days.
   - **Seedance drops it too.** Seedance is told to drop a job that has not
     finished within the same hour (`execution_expires_after`, its shortest),
     so a piece the app gave up on is never made and billed afterwards.
   - **Wan has no such setting.** A Wan job the app gave up on may still
     finish on Wan's side and be billed there, though the app never fetches
     or charges it.
3. **Fetch.** The finished file is a link that lasts 24 hours. The worker
   downloads it at once, only over https and only from the company's own
   storage (`*.aliyuncs.com`, `*.volces.com`, `*.bytepluses.com`,
   `*.byteplus.com`). Then it saves the file to the media library like any
   other shot.

**When something fails, the piece says what to do in plain words**, never in
the company's own wording.

- The worker reads the company's error code and turns it into a sentence (a
  refused key, a model not switched on, an empty account, words or pictures
  against the rules, a job the company no longer has).
- Try again remakes the failed piece on the same model, and the shot carries
  on from there.

## What it costs, and the meter

The prices are in `video-models.ts`, read on 29 Oct 2026.

- **Wan 2.7:** $0.10 a second at 720p, $0.15 at 1080p, from Alibaba's
  Singapore price page. Its sound is included. An 8 second 720p piece is $0.80.
- **Seedance 1.5 Pro:** billed by tokens of video, which are width × height ×
  24 frames × seconds ÷ 1024. BytePlus charges $2.40 a million tokens with
  sound and $1.20 without. A 10 second 720p piece is 1280 × 720 × 24 × 10 ÷
  1024 = 216,000 tokens. With sound that comes to 216,000 × $2.40 ÷ 1,000,000
  = $0.52, and without sound $0.26.

**The charge is what the company says it made.** Wan's answer gives the
seconds it billed, and Seedance's the tokens. An answer without them is
charged the expected price.

**Wan and Seedance count against the same limits as Google.** The shots-at-once
caps, the monthly allowance and the project's spend limit all include them.

**Video writes these meter rows itself.**
- The shell's meter prices only the shell's own models. On 29 Oct 2026 Tyler
  chose to have Video write Wan's and Seedance's rows in the same
  `ai_usage_events` table rather than change the shell.
- The writer is `src/server/video/video-meter.ts`. It writes provider `wan`
  or `seedance`, feature `video-generation`, and the shot's id, so a shot's
  row shows its cost.
- **One difference from Google's rows:** these charges do not send the shell's
  80% and 100% allowance emails, because that sender is private to the shell.
  The allowance itself still stops shots when it is used up.

## Several models at once

**Try on 2 models**, or **Try on all 3 models**, in the AI clip panel makes the
same frame and direction once on every model with a key. The button shows only
when at least two models have keys.

- **Starting sizes:** each shot starts on its model's settings, Google on its
  last size and Wan and Seedance on their defaults.
- **Checked together:** the shots-at-once cap and the money are checked for
  all of them before any is written, and they are written in one step, so
  either all of them start or none does. If the project is already making one
  shot, three more would pass the cap of three, so none start.
- **The results:** they land side by side under the button, like any shots
  of one frame (`several-ai-clips.md`). The ones not used stay, since they are
  paid for, and Delete removes one.

## Make it move and Make it again

- **Make it move:** the window has the same Model, Quality and sound fields as
  the AI clip panel, and starts on Settings → AI video's model.
- **Make it again:** a clip made again keeps the model, size and sound it was
  made with, unless another is picked. A Google clip from the Veo days is made
  again on Omni Flash, as before.
- **Brief to video:** a brief makes still pictures, never AI video, so it has
  no model to pick. A scene's picture gets Wan or Seedance through Make it
  move.

## What has not been run

Tyler chose on 29 Oct 2026 to build without real clips. No clip has been made
on either company.

- **Tests:** `video-companies.test.ts` checks every request and answer against
  the shapes on the companies' pages. `keyed-shots.test.ts` runs the worker
  from start to meter against stand-in answers.
- **Proven against a real company:** Wan's International site refuses a
  made-up key with a 401, which Test turns into "Wan refused this key".
- **Unknown until a real key makes a shot:**
  - whether a good key passes Test, on Wan or on Seedance
  - anything at all from Seedance's sites
  - whether Wan's reference model takes a first frame beside the actor's
    pictures
  - whether Wan fetches a voiceover from a link
  - the exact wording each company's refusals carry
