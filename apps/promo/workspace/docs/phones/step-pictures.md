# A picture of every step

Every action a phone runs keeps a small screenshot of each step, so a failed
one shows exactly where it went wrong. Part 17 of the phone farm.

- **Each step is named,** such as "Opened About phone" or "Press Post (found,
  not pressed)", and its picture is the screen as that step left it. A step
  that could not find its button takes a picture of what was on screen
  instead.
- **The Actions tab** in a phone's window lists its last 20 actions, a job's
  Reddit steps and the daily self-test among them. Each says its answer or
  its error, what the rack did about a freeze, and for a failed one "Stopped
  at" with the last step. **Show the steps** opens the pictures in order.
- **The pictures are fetched only when a row is opened,** because each one is
  read out of R2 and opened with the server's key.
- **Kept privately in R2,** like a profile's backup: each picture is
  encrypted with the server's key before it leaves Promo, and only an admin's
  request opens it. Nothing is at a public address.
- **How long they are kept:** a finished action's pictures go once they are
  older than the days set in Settings → Phones (seven to start). The tidy-up
  runs once an hour, so they are gone the day after. A failed action's
  pictures stay until a person presses **Clear the pictures** on its row.
- **Up to 30 steps an action:** past that, the first 29 and the last, which is
  where it stopped. An answer with more is trimmed, never refused, so whether
  a comment went out is never lost. A picture R2 will not take is logged and
  its step still listed, saying the picture could not be kept.
- **Deleting a phone deletes its pictures** from R2 as well as the list.

## Where it is

- In Promo: `src/server/phones/trail.ts` (keeping, opening, clearing and the
  tidy-up), `promo_phone_screenshots` with the step, its place and its R2 key
  from `drizzle/0116_promo_phone_health.sql`.
- The tab: `src/components/phones/phone-actions-panel.tsx`.
- On the rack computer: the `Walk` class in `rack/promo_rack.py`, which every
  action that touches the screen uses for its steps.
