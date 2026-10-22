# The phone link

Date runs Tinder from the member's own Android phone. A small Date app on the phone has the permission a screen reader uses: it reads what is on screen and taps, swipes and types. The phone always dials out to Date; nothing on it is reachable from outside.

The server half is copied from Promo's rack link and trimmed to one phone talking for itself: no adb, no USB, no proxies. Date does not connect to Promo; the copy is Date's own.

## The phone app

- **Source** is in `android/`, Kotlin, Android 12 or newer. `android/README.md` says which phone to buy and how to build and install it.
- **It has not been compiled.** The Mac it was written on has no Java or Android tools. The first build in Android Studio is its first check.
- **One screen**: the server address, the six-digit code, Pair, a "Date is in control" switch, and a line saying when the server last answered.
- **It runs as a foreground service** with a quiet notification, so Android does not stop it.

## Pairing

- **Pair a phone** in the dashboard's phone panel shows a six-digit code that works once, for ten minutes. Only its hash is kept. The code is made for the open profile, and the phone it pairs becomes that profile's phone (`../profiles.md`). New profile shows one too.
- **The phone posts the code** to `/api/phone/pair` and gets its key back once. The key is kept encrypted with the server's key.
- **Ten tries per address per fifteen minutes**, so a code cannot be guessed.
- **Unpair** stops the key at once and cancels everything waiting. The phone's record and history stay; Pair it again gives a new key.
- **The server needs `CUSTOM_SHELL_SECRET_ENCRYPTION_KEY`** set, or pairing is refused with words saying so.

## The signed messages

Every message after pairing is signed both ways with the phone's key (`src/server/phone/signing.ts`, the same rule as Promo's rack). A changed body, a copied message sent again, a message sent to another address or a clock five minutes out is refused.

| Address | When | What |
| --- | --- | --- |
| `/api/phone/check-in` | every 15 seconds | battery, time zone, Tinder's version, whether Tinder is in front, the phone's own switch |
| `/api/phone/next` | in a loop | the next action, held open up to 20 seconds when nothing waits |
| `/api/phone/result` | after each action | its answer and a picture of the screen |
| `/api/phone/screen` | while a window watches | the newest picture of the screen |

These addresses are outside `src/lib/api/`, so the shell's guard test never sees them. The signature is their only lock, and `src/server/phone/routes.test.ts` checks every one refuses a wrong signature.

## Plain actions

Open an app, read the screen, tap, swipe, type, back, home, take a picture. Everything that knows what Tinder looks like is on the server, so a Tinder update is a server change, not a new phone app.

- **Reading the screen** sends every box on it, its words, label, view id and place, plus a picture.
- **A tap, swipe, type, back or home** can ask to read the screen once it settles, in the same answer.
- **An empty text box sends no words.** Android reports an empty box's grey hint as its text; the phone sends it as `hint` only, so a hint is never taken for a bio or a message.
- **A swipe with `holdMs`** rests the finger on its start that long first, then moves without lifting: a long press that turns into a drag, which is how a photo on the edit screen is picked up and moved. Up to 3 seconds.
- **Each action has a time limit.** The phone gives up when it runs out; the server waits a minute more for the answer.
- **One action at a time, in order.** Nothing is handed out while "Date is in control" is off in the dashboard's phone panel.

## A phone in a pocket

- **Away is normal, not an error.** A phone silent for 45 seconds reads as away since its last check-in.
- **An action still waiting after an hour** is cancelled with "Phone away".
- **A walk's step waits two minutes** for the phone to pick it up, then the walk stops saying nothing more was done.

## Pictures

Cards' photos and step pictures are other people's photos and private chats. Each is kept once, encrypted, in R2, and only its member can open it, through `/api/dating/picture/<id>`, which checks the session. Step pictures go after a week. Only what matters is kept: a card's photos, the stop screen, a picture asked for by hand, and the screen a failed walk stopped on.
