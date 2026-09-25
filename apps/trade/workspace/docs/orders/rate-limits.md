# How fast signed-in orders may leave the app

Trade limits the real-money actions sent by a signed-in browser before they
reach an exchange. Every user has two separate counts. A user may ask for
twenty order actions in ten seconds and one hundred cancellation actions in ten
seconds.

The order count covers placing, moving and closing plain orders, changing
leverage or margin, changing position protection, and every live ladder or grid
action that can place or replace an exchange order. The cancellation count
covers plain-order cancels and calls that stop live ladders or grids.

The twenty-first order action in the same ten seconds is refused. The sentence
on screen is "The app is sending orders too fast. Try again in a moment."
Cancellation has its own larger count, so a stuck placement loop cannot use the
room needed to get existing orders off an exchange. If the database cannot
check the count, a cancel still goes through. A new order does not.

## The measured bulk actions

The bulk tests use twenty positions, the burst named in the task.

- Close all sends one browser request carrying all twenty live positions. The
  server closes the twenty positions together, but the press uses one place in
  the order count.
- Empty wallet sends one browser request carrying the wallet id. With twenty
  positions, the server starts twenty followed closes inside that request. The
  engine sends those orders on later passes. The press uses one place in the
  order count.

The counts apply to the signed-in browser action, not to each coin inside one
confirmed bulk action. Close all and Empty wallet therefore keep working on a
wallet with twenty positions. Both measured normal bursts use one place in the
count. The order allowance is twenty times that measured burst, and the cancel
allowance is one hundred times that burst.

## What does not use these counts

Reads do not use either count. Practice-wallet actions do not reach an exchange
and do not use either count. Orders placed later by the worker belong to the
engine's exchange rationing and do not use a signed-in browser count.

The exchange rationing in `src/server/protocols/rationing.ts` still applies.
That code reacts to the allowance reported by an exchange. The signed-in order
count stops a browser loop before it can spend that shared allowance.
