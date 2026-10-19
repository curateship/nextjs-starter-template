# Before and after photos

Photos is a view inside each program's dashboard
(`/programs/<id>?view=photos`), the Photos tab in the middle panel. Photos
belong to the person, not the program, so every program shows the same photo
days. It keeps dated front, side and back photos
with that day's bodyweight and tape measurements, and compares any two days.

## Privacy, which comes first

These are the most private thing in the app.

- **Only the owner sees them**, plus a coach the owner has accepted and
  switched photos on for. Nobody else, admins included.
- **A photo never gets a public address.** The browser only ever sees
  `/api/fitness/photos/<photo day>/<front|side|back>`, and that address checks
  who is asking on every request. Anyone else, signed out or not, gets the
  same "doesn't exist" answer an unknown address gets, and nothing caches it.
- **The storage key stays on the server.** Photos are stored in the app's
  bucket under `fitness-photos/<person>/<random id>`. The bucket's public
  address could serve a file to someone who knew its key, but no key is ever
  sent to a browser.
- **Uploads skip the media library.** The shell's picture picker saves into the
  public media library, so photo slots use their own upload button instead.
- **Photos are fetched, then drawn.** Each photo is downloaded with a normal
  request and drawn from memory (`private-photo.tsx`), not pointed at by an
  image tag. The local dev server answers 404 to an image tag aimed at an
  app's address, so a plain tag showed nothing locally; fetching works locally
  and live. Project draws its task pictures the same way.
- Files must be JPEG, PNG, WebP or HEIC and at most 15 MB, and one person can
  upload at most 60 in ten minutes. The type is read from the file's own first
  bytes, not from what the browser says it is, so a page renamed to `.jpg` is
  refused, and a photo is stored and served as the type it really is
  (`imageTypeOf` in `src/server/fitness/photos.ts`).

## Using it

Laid out as Tyler drew it on 18 Oct 2026.

- **The middle panel** starts with a lock and a line saying who can see the
  photos, then Timeline or Compare, and New photo day. Under them, every photo
  day newest first, each a card: the date and "0 of 3 photos", three boxes for
  Front, Side and Back ("or browse files"; a photo file can also be dropped on
  a box), and its figures as small tags, "Waist **84 cm**". Clicking a card
  outlines it, opens it on the right and sets `?pick=<day>`. A photo added in
  the middle opens that day too.
- **New photo day** (beside Timeline and Compare) asks for the date,
  bodyweight, chest, waist, hips, arm and thigh in centimetres, and a note.
  All but the date are optional. The new day opens on the right, where its
  photos go in one slot at a time; each slot opens the phone's camera or
  photo library.
- **The right panel** shows the picked day: the date large with "Photo day"
  under it, the cog (edit the date and figures) and the bin (delete the day).
  Then Photos, "0 of 3", with a box each to add, replace or remove a photo,
  and Measurements: bodyweight and the five tape measurements as figures two
  by two, each with what changed since the day before it ("Down 3 cm since
  Oct 1"), and the note under them.
- **Replace and remove** work per photo. A replaced or removed photo is deleted
  from storage too.
- **Delete a photo day** asks first, then deletes the day, its figures and its
  photos.

## Compare

Compare (beside Timeline) opens on the earliest day and the picked one, or the
latest, and puts `?compare=<a>,<b>` in the address. Timeline goes back to the
list. The comparison fills the middle panel, and either day can be changed
there. Two ways to look:

- **Side by side**: front, side and back, earlier day on the left.
- **Slider**: the later photo laid over the earlier one, showing only to the
  right of a divider. Drag it, or focus it and use the arrow keys (Shift for
  bigger steps), Home and End.

Under the photos, the bodyweight and measurement changes are written out in
words. A figure missing on either day is left out rather than guessed.

## Where it lives

- `src/components/fitness/photos/photos-views.tsx` (the two panels),
  `photo-slot.tsx`, `private-photo.tsx`, `compare-view.tsx`,
  `photo-day-dialog.tsx`
- `src/server/fitness/photos.ts`, `src/lib/api/fitness/photos.ts`
- `src/routes/api/fitness/photos.$sessionId.$slot.ts` serves one photo
- Table `fitness_photo_sessions`
