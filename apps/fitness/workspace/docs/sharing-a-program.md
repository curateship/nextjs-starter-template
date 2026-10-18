# Sharing a program

A program can be shared as a public page that anyone with the link can open and copy into their own account. Only the program's owner can switch sharing on or off. A coach who can change a client's program still can't make it public; the server refuses it, not only the screen.

## The page

- The address is `/r/<code>`, where the code is a random 12-character string made when sharing is switched on. The Share switch is in the program's actions on its own dashboard.
- It shows the program's name, its routine type and its week, Monday to Sunday: each workout day with its lifts, sets, reps and rest, and every other day marked Rest. A superset is marked.
- It never shows the owner's name, weights, workouts, starting data or photos. The server only hands out those few fields (`loadSharedProgram` in `src/server/fitness/sharing.ts`), and it is the one Fitness endpoint open to people who aren't signed in (`src/app/open-endpoints.ts`).
- A code that never existed, an archived program, and a program whose sharing was switched off all get the same not-found page, so nobody can tell them apart.

## Copying it

- Signed in, Copy to my account makes a new program in the visitor's own account with the same week: the same workout on the same weekday, with the same lifts, sets, reps, rest and supersets. It opens on that program's dashboard.
- Weights start empty, because the owner's weights are theirs. The copy keeps the shared program's routine type.
- A lift the owner made themselves is left out of the copy, because it lives in the owner's own library.
- Signed out, the button reads "Sign in to copy it" and comes back to the page after signing in. "Make an account" goes to sign-up; the shell's sign-up page takes no address to come back to, so after signing up the visitor opens the link again.

## Turning it off

Switching sharing off clears the code. The old link then shows the not-found page. Switching it on again makes a new code, so an old link never comes back to life.
