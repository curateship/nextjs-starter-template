# Engine settings and health notices

## Trading engine settings

Settings → Trading engine uses four full-width cards. Trading engine comes
first, then Safety and Orders, and Errors is last.

The route arrives with the engine, liquidation warning, Aster margin, and plain
order style already read. The page never replaces itself with "Asking the
server" or draws empty setting rows while four browser requests finish. Aster
checks its saved margin against the exchange after the page is visible.

The Trading engine card puts its six figures in two rows of three. Price feeds
sit beneath them as one chip per exchange. An error appears above the figures
and can be dismissed. Engine, Trading, and Restart stay together in the card's
footer. The title row has no subheader and a divider separates it from the
status below. The title row uses the compact spacing left after the subheader
was removed. The page does not print a separate "Read just now" line because
Last heard from already gives the useful time.

The Safety card holds Real money, the liquidation warning, and the real-money
switch in separate horizontal rows. The Orders card holds Aster margin and the
choice between resting and watched plain orders in the same row style. Each row
puts its control on the right when there is room and beneath the words on a
narrow screen. The wallet, dollar-distance, and out-of-100 controls keep their
own visible labels in both layouts.

## The Errors card

The Errors card is a history of what the engine got wrong, newest first. It
sits at the bottom of the tab, under Orders, because it is a record to go
looking through rather than a setting to change. The Trading engine card at the
top says what the engine is doing now and carries one error, the last one,
because that is the only one the heartbeat can hold. That was never enough. Two failures at 3am and one at 4am left the screen showing the 4am one
alone, and a fault that repeated every hour looked like one bad moment.

Every place in the engine that used to print an error to the container log now
writes the same words down with a time. The printed line is unchanged; the log
still has everything it always had. What is new is that the words survive a
deploy and can be read from the app.

Each row says when, where and what happened.

- **When** is the last time that line was seen, to the second. Several
  different failures inside one second is what a bad moment looks like, and
  three rows all reading 10:57 AM would leave no way to tell which came first.
- **Where** is the part of the engine that reported it, named after its file:
  `ladder-worker`, `live-fills`, `live-smart-orders`, `candles`, and so on.
- **What happened** is the sentence that was printed. A warning is marked
  "Warning" in words rather than by its colour.

Repeats fold. The same sentence from the same place, inside one minute,
becomes one row with a count and the time it started, so an outage that fires
once a second leaves sixty readable rows an hour instead of one row whose
count nobody can place in time. Writes go through a queue one at a time,
because four sites failing in the same instant used to leave four identical
rows: each of them looked the table up before any of them had inserted
anything.

The last 500 rows are kept. The oldest go on the insert that passes the mark,
so the table cannot grow forever on a night nobody is watching. The words go
through the same scrubber the live journal uses, so nothing key-shaped is ever
stored, and each message stops at 300 characters. An empty table says "No
errors recorded. The last 500 are kept."

The list is read with the page and does not refresh on its own. Reading the
history is the whole feature: there is no alert, no bell notice and no push
behind it. Reload the page to see anything newer.

Recording an error never becomes one. A write that fails is swallowed, because
the line has already been printed by then, and a database that has gone away
must not turn one failed pass into two. During an outage the queue stops
accepting after fifty are waiting, for the same reason.

## Engine health notices

Engine health goes through the notification tray that the rest of the app
already uses. The notice is about the app failing to work. It is not a price
alert, a chart-line alert, or an order alert. Those alerts remain out of scope.

The app's background pass checks the trading engine every 15 seconds. The engine
writes its own heartbeat every 5 seconds. A heartbeat older than 45 seconds,
which is three checks by the app worker, counts as an outage only while the
Ladders switch is on. Switching Ladders off on purpose clears the outage memory
and sends nothing. The same is true when Ladders goes off and back on between
two checks: the old outage is cleared, and only a later missed heartbeat can
start a new one.

Switching Ladders back on starts a new 45-second window. A heartbeat left from
before the switch cannot cause an immediate outage notice. Pausing the engine
does not reset the health clock because a pause and a restart are different.

The 45-second line comes from the engine copies retained from 20 to 22 August 2026. Eleven measured restarts took between 7.475 and 12.318 seconds. A normal
replacement is therefore back well before the app calls it an outage. Since the
monitor checks every 15 seconds, the notice arrives 45 to 60 seconds after the
last heartbeat.

The outage notice reads:

> The trading engine stopped at 3:12 AM EDT
>
> Watched orders and ladder rungs will not fire until it is running again.

The time uses Toronto's current EST or EDT name. Later checks stay quiet. When
the heartbeat returns, one all clear reads:

> The trading engine came back at 3:15 AM EDT
>
> It was unavailable for 3 minutes 12 seconds. Watched orders and ladder rungs
> are working again.

The outage start is the last heartbeat. The return is the first heartbeat that
the monitor sees after the outage. The app keeps one outage row while the engine
is down, then deletes the row after writing the all clear. A later outage can
therefore make its own pair without one outage producing a message every 15
seconds.

The tray uses its existing announcement-shaped message to carry these words.
The app turns its banner off, so the health message only appears in the tray and
notification list. The matching record remains in Announcements history because
the shell keeps an announcement's words there.

