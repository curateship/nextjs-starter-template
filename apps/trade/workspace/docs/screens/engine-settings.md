# Engine settings and health notices

## Trading engine settings

Settings → Trading engine uses three full-width cards. Trading engine comes
first, followed by Safety and Orders.

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

