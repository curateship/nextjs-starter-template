# Logging without signal

Many gyms are basements with no signal. The live workout keeps working there as long as it was opened before the signal dropped.

## What happens

- **Changes that can't be sent:** a set ticked, typed, added or removed with no signal waits in a queue on the phone. The line under the workout's name says "Saved on this phone. Will send when you're back online."
- **Sending them later:** the queue goes to the server in the order the changes were made, as soon as the browser says it is back online. It also goes the next time the workout opens.
- **Order is kept:** once one change is waiting, every later change waits behind it rather than overtaking it.
- **Sent twice, saved once:** a new set's id is made on the phone, so a set sent twice after a dropped signal is saved once.
- **Folding:** two edits to the same set in a row become one change in the queue. A set added and removed again while offline never reaches the server at all.
- **A refused change:** a change the server says no to, such as a set deleted on a laptop, is dropped with a red message. One bad change never blocks the rest.
- **Nothing flickers back:** the sets ticked in this tab are kept on top of whatever the server sends, so a reload of the program's data never shows a ticked set as open again.

## What doesn't work offline

- **Opening or reloading the workout with no signal.** The program's dashboard loads from the server. Before the workout moved into the program dashboard, a copy kept on the phone could stand in for it; the dashboard's loader doesn't read that copy, so it was removed rather than left half-working. Making the app open with no signal at all needs a service worker, which is a shell change every app would share. That hasn't been built.
- **Adding, swapping or removing a whole lift, finishing, and the Finish summary.** These need the server. They show the usual red message and can be done once the signal is back.
- **Which change wins:** if the same workout is changed on a laptop while the phone is offline, the phone's changes are sent last and win set by set. Tyler hasn't decided this rule; it is what the app does today.

## Where it lives

- The queue: `src/components/fitness/workout/offline-queue.ts`, tested in `offline-queue.test.ts` beside it.
- Sending and holding changes: `src/components/fitness/workout/use-set-sync.ts`.
- What both panels show of the changes made in this tab: `src/components/fitness/workout/live-workout.ts`.
