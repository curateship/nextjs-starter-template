# Smart tools: alerts carried by drawings

A smart tool is an alert set with the drawing tools. Tyler's rule, in his
words: "Smart tools are a way to set an alert using the drawing tools." Both
drawings carry one, the trendline and the level. A base or a trendline marked
by hand is where the work happens, and before this the only alert was a flat
purple price line. A sloping line could not be watched at all.

## The marks a line carries, and where they sit

Everything a line carries hangs in **one column under the line, tucked in at
its right-hand end**: the bell nearest the line, then the cog, then the x. A
level runs the whole width, so its end is the right edge of the chart.

Under the line and at its end, rather than across its middle, because a row of
buttons over the middle covers the candles the line was drawn through, and
those candles are what the line was drawn to point at. The column starts far
enough below to clear the round handle on a trendline's end. A line lying too
near the bottom of the chart stacks its marks upwards instead.

Every mark is the same round chip, in the same muted grey, and every glyph is
drawn on the same 24-unit grid the icon set uses and brought down by the same
scale. That is what keeps them one size and one weight, rather than three sets
of hand-picked numbers that drift apart. Tyler's words, 3 Sep 2026: "they're
different colors, should all be gray and the icons needs to be the same size".
The bell wears the chip too, though it is not a button.

The bell's slot belongs to the bell whether there is one or not, so switching
an alert on never slides the buttons out from under the pointer.

## Opening the alert window

Pressing the cog opens the alert window, and double-clicking the line opens
the same one.

**The window is a fixed height and its body scrolls, the same frame the order
windows on the chart use.** Its height does not follow its content, so it never
has to be moved to stay on screen. While it did follow, ticking the close rule
made it taller, and the library moved the whole window 563 pixels in one jump
to fit — header above the top of the screen, and whatever somebody was about to
press somewhere else. The height is the order windows' own, or the room the
screen has if that is less, and `ScrollArea` carries the rest.

The window hangs off the foot of the line's column. It opens with a header
saying which drawing it is and where that line is right now in dollars, with a
divider under it running the full width of the window. Then a switch, Alert,
then Continuous line on a trendline, then — once the alert is on — the Wait for
a close card and Break buffer, then a Description field.

A level's price is its price. A trendline's price "right now" is its slope
carried on past its second point. A line straight up and down has no one
price, and the switch stays off with the reason in a tooltip. The same
tooltip explains a switch that is waiting for the first live price.

**A line with no alert says nothing under the switches.** There used to be a
sentence there explaining what the Alert switch would do, which is what the
switch itself already said. Words appear under the switches only once there is
something to report: what an armed line is waiting for, or when a fired one
went off.

## Without a mouse

Every way into the window opens the same window on the same line.

- **Enter or Space opens it on the line the Tab key is on.** The Tab key
  already reaches every line, and landing on one picks it out. Opening this
  way moves the keyboard into the window, so Tab then reaches the switch.
  Opening it with a pointer leaves the keyboard where it was.
- **Escape closes it and puts the keyboard back on the line**, still picked
  out, so Escape lands where Tab left off rather than at the top of the page.
- **A finger resting on a line for half a second opens it.** The same half
  second and the same eight pixels of movement the chart's order menu uses, so
  one finger learns one rule. A finger that moves further drags the line
  instead, and the window does not open.
- **The press never reaches the chart underneath**, so one finger can never
  open the line's window and the order menu together.
- **Below the 1280-pixel layout the window is the bottom sheet** the order
  windows and the side panels use, rather than a small box hanging off the
  edge of a phone screen.

## Describing a line

The window's Description field takes up to 240 characters, enough for at least
20 normal words. The box starts at one line and grows as the description wraps.
The description is saved when the field is left, not on every keystroke,
because each save is a write of the whole line. Emptying the box takes the
description away.

The description runs **along the line**, turned to the line's own angle,
sitting five pixels above it and starting at its left-hand end. Tyler's words,
3 Sep 2026:
"the text should line up againts the line". It is always the left end,
whichever end was drawn first, so the words read left to right rather than
upside down on a line drawn backwards. A line whose left end is off the side
of the chart is labelled where it comes into view, read along its own slope,
so the description never scrolls away with the end. It is in the line's own
colour and takes no pointer. A screen reader hears the description first and
then what the line is: "4h base, trendline from $100 to $120".

A description is not only for alerts. A line with no alert can carry one.

## What a line's alert draws on the chart

- **A bell at the head of every armed line's column**, picked out or not, in
  the muted foreground colour, so which lines are watched can be read off the
  chart without opening anything. It takes no pointer.
- **A dot where an alert fired**, at the moment and the price the engine
  compared, kept until the alert is switched on again or the line is deleted.
  Switching an alert on writes a fresh record, which takes the dot with it.
- **The window says when it fired and at what price**: "Fired 3 hours ago at
  $61,200."

A line that fired before the fire point was kept shows no dot. The record on
those rows has no price in it, and a dot in a guessed place is worse than no
dot.

## Continuous line

A trendline's window has a second switch, **Continuous line**, sitting right
under Alert. It was called "Extend to the right" until 3 Sep 2026, when Tyler
renamed it and moved it up under Alert; anything written before that date uses
the old name. On, the line carries on past its later point to the right edge
of the chart, on the same slope, drawn dashed and thinner so the part that was
drawn still reads as the drawn part. That dashed part is where the alert would fire, read with the
same arithmetic the engine uses, so what is on screen is what is watched.

The switch is off for a new line and goes on by itself the moment the
line's alert is switched on. Switching the alert off leaves it on. It is saved
on the drawing, so it survives a reload, and a level never shows it because a
level already runs the whole width.

The dashed part takes no pointer. Clicking it reaches the chart underneath
rather than picking the line, the two handles stay on the two real points,
and dragging either end moves the dashed part with it. A screen reader still
hears one line.

The window reads the market's lines again as it opens. The engine fires an
alert, and the chart only hears about that by asking, so the switch could
otherwise read on for a line that already rang the bell.

Backtest and flow-run charts draw the same lines but offer no cog and no
double-click. Only the live chart's lines are watched.

## Break buffer

A line drawn on a wick gets touched by wicks. The window's **Break buffer**
field is how far past the line the price has to go before the alert fires, so
a touch has to become a break. Tyler's words: "Fire only once price is a set
number past the line, so a wick that just kisses it stays quiet."

These docs and the screen both say an alert **fires**. They used to say it
rang, which was nobody's word but mine. Tyler, 3 Sep 2026: "What the hell is
ring?"

**It is a percentage, not a number of dollars.** Tyler, 3 Sep 2026: "It should
be percentage. NOt price". A fixed number of dollars only works on one coin.
The same "$50 past it" that is a sensible break on Bitcoin cannot be reached
at all on a coin worth twenty cents, and a line on such a coin was armed with
exactly that and would have waited forever. A percentage is the same
instruction on every coin.

- **The first buffer is 1%.** The box starts there until the account saves a
  different choice.
- **The last saved input becomes the next line's starting buffer.** Typing 2.5%
  on one line makes the next switched-on line start at 2.5%, across markets and
  after a reload. Clearing the box remembers none, so the next line fires at
  the line itself.
- **Beside the box is the percentage and which side of the line it is**, read
  from what is being typed rather than from what is saved: "0.1% above the
  level". It used to work the percentage out into a price and show that.
  Tyler, 3 Sep 2026: "It should say % at below or above line. At makes no
  sense and i dont need to read the price."
- **An empty box says nothing beside it.** There is no offset to describe.
- **The buffer goes on the side the alert waits for**, which is the side the
  words beside the box name. A line waiting for a rise fires that far above
  it, one waiting for a fall fires that far below.
- **It is offered only while the alert is on.** Each line keeps its own buffer
  beside the direction. Switching the alert off takes that line's alert record,
  but the account still remembers the last input for the next alert. A line
  that has fired keeps its own buffer, so switching it on again watches the
  same line the same way.
- **At most 100.** That ceiling is there because this is a number arriving
  from a browser, not because anybody would type near it.
- The notice says it: "The price had to go 0.1% past the level." Without that
  sentence the title reads as though the alert fired late.

The engine compares the price against the line moved by that percentage. The percentage is measured off the size of the
price, so a line dragged below zero still moves the way the words say.

## Wait for a close

A line can wait for two different things. **A touch** is what every line has
always done and what every line still does until somebody changes it: the
moment a live price reaches the line, it fires. **A close** waits for a
finished candle on a timeframe to close on the far side of it. Tyler's words:
rules "like price must cross line and close above or below it".

It is one card in the line's window, **Wait for a close**, built like every
rule on the DCA and grid windows: a box that turns the rule on, a chevron that
shows its settings, guidance behind the info icon rather than under the
controls, and the card's own answer — "4h", or "4h, 1.5×" — printed on the
right so a folded card still reads. Unticked is the touch alert.

A close on the far side is what most people mean by a break. Firing on the
touch means being woken by every wick.

- **The timeframe is picked from the same list the chart draws**, 1m through
  1d, and the card only offers it once the rule is on. The choice is kept when
  the rule goes off and on again, so comparing the two does not cost the
  timeframe each time.
- **Only finished candles count.** The bar still forming has a close that is
  just the price right now, so firing on it would be the Touch alert wearing a
  candle's name. The newest bar the engine will look at is the one whose whole
  period is already in the past.
- **Nothing that closed before the switch went on.** Arming a line while the
  last finished candle already sits past it would otherwise ring at once, on
  news that was old when the alert was made. The candle has to have closed
  after the moment the switch went on.
- **A trendline is read where it was when the candle closed**, not where it is
  now, so a sloping line is compared against the candle beside it rather than
  against a point it has since moved on to.
- **The break buffer still applies**, on the candle's close instead of on a
  live price. A close has to be that percentage past the line.
- **A market the store has no candles for waits.** The store fills from charts
  and backtests, never by walking a catalogue, so a coin nobody has opened can
  genuinely have no bars. Nothing fires and nothing is said; the line goes on
  waiting.
- **The store fills per timeframe, so pick one you have looked at.** Opening a
  market's 4h chart fills the store's 4h rows for it and nothing else. A Close
  alert set to 1m on a market whose 1m bars nobody has ever asked for has
  nothing to read, and waits until somebody opens that timeframe once. The
  refresh job tops up the pairs the store already covers; it does not invent
  new ones.
- **No live price is needed at all.** A Close line is judged on a candle, so a
  market whose pushed feed is quiet still fires. The engine does not even ask
  for that market's price.

**The candles come from the store, under the key that holds that coin's
history.** A Hyperliquid line on NEAR is judged on the NEAR bars the store
keeps, which come from Binance — the same rows the chart already draws behind
the venue's own recent slice. `candle-store.md` explains why the store keeps
one copy per coin rather than one per venue. What that means here is worth
saying plainly: **the volume compared below is the source's volume, not the
venue's**, and for a coin that trades far more on Binance than on the venue,
that is the better number anyway.

**The notice runs a little behind the close.** The store publishes some time
after a candle closes, and the engine checks once per pass, so the bell arrives
after the candle rather than on it. The lag belongs to the store's refresh, which
`candle-store.md` measures.

## Only on above-average volume

A break on thin volume is often a fake. Inside the same card, a box called
**Only on above-average volume** asks for the breaking candle to have carried
more trade than usual, with a multiple under it that starts at 1.5.

The engine compares that candle's volume against the average of the **20
finished candles before it**. At 1.5 the candle has to have one and a half
times the average. A 1h close past the line on half the usual volume fires
nothing; the next one at double fires, and the notice says the multiple.

- **The box lives inside the close card**, because a live price carries no
  volume of its own. A control that could never do anything is worse than no
  control.
- **It comes off when the close rule comes off**, rather than sitting there
  unread. The multiple is remembered, so turning the rule back on does not cost
  the number.
- **Emptying the multiple box is the same as switching the condition off.** A
  break that has to beat nothing is not a volume-confirmed break.
- **Fewer than 20 candles behind the break means no answer, and the line
  waits.** A coin listed this morning has three, and three candles are not an
  average.
- **An average of zero also means no answer, and the line waits.** Markets with
  nothing to borrow get minute bars built from watched prices, and a price
  carries no volume, so every one of those bars is zero. Without this the
  comparison would be "at least 1.5 times nothing", which every candle passes,
  and the filter would read as working while doing the opposite of what it says.
- **At most 100.** That ceiling is there because this is a number arriving from
  a browser, not because anybody would type near it.
- A hole in the store's rows is not an error here. The twenty candles are the
  twenty nearest the break that the store actually holds, which may span more
  than twenty periods.

## What the window says it is waiting for

The sentence at the foot of the window is written from the saved rules rather
than from a fixed string, so an armed line always says what it will actually
do:

- A touch: "Fires once when the price crosses up through the line, then
  switches itself off."
- A close: "Fires once when a finished 4h candle closes up through the line,
  then switches itself off."
- A close with volume: "…closes up through the line on volume at least 1.5x the
  average of the 20 candles before it, then switches itself off."

## The next line remembers Alert

Tyler's rule: "For the line tool. Make the alert on by default and it also
must remember its last selected".

New trendlines and horizontal drawing lines start with **Alert on** until the
account saves a manual choice. Switching Alert off on a line makes the next
line start off. Switching Alert on makes the next line start on. The choice
survives market changes and reloads through the saved chart options.

An alert firing does not change that preference. Existing drawings keep their
own alert state, and opening an old drawing does not apply the new-line
default to it. The existing remembered Break buffer still supplies the next
alert's buffer. Fib drawings do not carry alerts.

The drawing appears immediately. Its alert is enabled after the drawing saves,
using the current market price to choose its direction. A failed alert save
leaves the drawing with Alert off and reports the failure. A line without a
usable price, including a vertical trendline, stays off with the existing
explanation. Neither failure changes the remembered manual choice.

The Line alerts master switch still pauses evaluation. Creating a line does
not turn the account's master switch back on.

Deleting, clearing or moving a newly drawn line waits for its initial alert
save to finish. A late save must not bring back a deleted line or enable an
alert at the line's old position.

## What the switch does

On, the direction is fixed from the live price at that moment, the same rule
the purple price alerts use. A line above the price waits for a rise, and one
below waits for a fall. The switch flips at once and the server's answer
replaces it. A refused save puts the switch back and says why. On a
trendline, switching on also switches Continuous line on, in the same save.

The alert is stored on the drawing itself, in an `alert` field beside the
shape, not in a second table. Deleting the line deletes its alert. Moving the
line moves the alert, and when the screen knows the live price the direction
is set again from the line's new place, so a line dragged across the price
waits for the right side rather than firing on the next pass for nothing. An
alert that has already fired is never changed by a move.

## What fires it

The trading engine reads every armed line once per pass, beside the price
alerts. It works out where the line is at the moment being compared, a level's
own price or a trendline's slope carried on, and moves it by the break buffer
if the line carries one. A rise fires at or above that price, a fall at or
below it.

**Which moment that is depends on the close rule.** A line without it is
compared against the pushed price now, and a market with no pushed price waits.
A line with it is compared against the newest finished candle's close, at the
moment that candle closed; it needs no pushed price, and the engine only asks
the price feeds for the markets its touch lines are on.

**One read per market and timeframe**, however many lines share it, and all of
them together rather than one after another: each is a round trip to a database
a moment away, inside an engine pass with orders waiting behind it. Twenty-one
bars come back each time: the one that may have broken the line, and the twenty
behind it the volume condition averages over.

**A line keeps its close rule when it is armed again.** A line that has fired
holds on to its timeframe, its multiple and its buffer, so switching it back on
watches the same line the same way. Switching the alert off by hand is the
other thing entirely: that takes the record away, which is what switching it
off means, and the next arming starts from the account's remembered buffer.

Firing is claimed with one conditional update that names the line's points
and the alert as they were read. A line moved after the read, or an alert
switched off meanwhile, misses the claim and nothing fires. Two engine
containers cannot both announce the same line.

The bell and inbox say, for example, "BTC crossed your trendline at $61,200
(was rising)" or "BTC crossed your level at $61,200 (was falling)", the alert
sound plays, and the notice opens that market. A line with a close rule adds what
the candle had to do, in the order it was asked for: "A finished 1h candle
closed above it. Its volume was at least 1.5x the average of the 20 candles
before it." **A line with a description is
called by its description instead**: "BTC crossed 4h base (was rising)", with
the price moved into the sentence underneath. A price in a notice needs
translating and a description the person typed does not. The alert then
switches itself off and the line stays on the chart. Opening the window again
says when it fired, and the switch can go on again for one more.

## Alert expiry

A line alert can switch itself off after a number of days or at a trendline's second point.

- **Days:** Choose After a number of days, then type a positive whole number. Press Enter or leave the field to save.
- **Tyler's choice:** "I want to input a number of day instead of a preselected 1d, 1week".
- **Clock:** Days count as 24-hour periods from the server's save time. The saved deadline is absolute and survives reloads.
- **Reading the field:** Reopening shows the remaining days rounded up. The window also says, for example, "Expires in 4 days".
- **Never:** Removes the deadline. New alerts start with Never.
- **At line end:** Trendlines only. The second point must be in the future. Saving copies that point's time into the deadline.
- **Moving a line:** Moving either point afterward does not change a saved deadline. Choose Never, then At line end to use the moved endpoint.
- **Expiry:** At or after the deadline, the next engine pass removes the alert record before checking prices or candles. The drawing stays.
- **Silence:** Expiry creates no notice, sound, fired dot or Fired-list entry. Expiry also runs while alerts are paused or prices are missing.
- **Switching on again:** Starts a new alert without the old deadline. An expiry setting belongs to one activation of a line.
- **Invalid entries:** Zero, negative numbers, fractions and deadlines beyond the beginning of 2100 are refused. The typed value stays for correction.
- **Trying again:** Choosing another expiry option or submitting days clears the earlier error. A corrected value does not leave a stale red error over a successful save.
- **A past endpoint:** The error names the past endpoint and offers typed days or moving the second point into the future. Days work regardless of the line's endpoint dates.
- **Grid stops:** An expiring alert cannot become a grid stop. A linked grid stop cannot receive expiry until its grid releases the line.
- **Storage:** The drawing's existing alert JSON holds `expiresAt` and the optional `expiresAtLineEnd` marker. No database migration is needed.
- **Release:** Both web and trading engine need this code. Local validation does not update production.

### Testing alert expiry

1. Draw a level and open its alert settings. Switch Alert on if needed.
2. Choose After a number of days and enter 4. Leave the field and expect "Expires in 4 days".
3. Reload and reopen the level. Expect the same expiry, with remaining days rounded up.
4. Enter 0 or 1.5 and leave the field. Expect an error and the invalid value to remain. Enter a valid number again and expect the error to disappear.
5. Choose Never. Expect the countdown to disappear and stay absent after reload.
6. Draw a trendline with its second point in the future. Choose At line end and expect a countdown.
7. Run the focused drawing-alert tests to advance the clock to the exact deadline. Expect Alert off with the drawing retained and no notice.
8. Check a grid-linked alert. Adding expiry must fail; an expiring alert must be absent from grid-stop choices.

## The master switch in Settings

Settings → Sounds and alerts holds one switch, **Line alerts**, that belongs
to the account. Off pauses every line alert on it. Going away for a week
should not mean switching off twenty lines and remembering which ones to
switch back.

- **Every line keeps its armed state.** The switch pauses the engine, not the
  lines, and the line's own window still switches its alert on and off.
- **The line's window says "Paused in Settings"** above its own switch, so the
  reason a line is not firing is on the line rather than only in Settings.
- **A cross that happens while paused fires nothing, and does not fire later
  either.** The engine turns that line to face the price again, the same rule
  a dragged line follows, so the line then waits for the price to come back
  across it. Switching the master switch on with the price already past a line
  is silent. The next real cross fires once.
- Purple price alerts are not affected. This switch is only about lines.

## A level is not a purple price alert

They stay two things. A purple price alert is a one-use dashed purple line
placed from the right-click menu, with an Alert tag on the price axis, and it
says "reached" when it fires. A level is a drawing in the chart's line colour,
solid, with no tag, and it says "crossed your level" when it fires. A level
and a purple alert at the same price both fire, each once. Nothing on a
resting level says it is armed except the bell at the end of it. The cog is
the same grey as the rest, armed or not: it used to go the primary colour
while the line was armed, and the bell beside it now says that on its own.

## In the Alerts menu

Every armed line has a row in the header bell's Alert tab, beside the price
alerts, oldest first. The row says the coin, the line's description or else the word
trendline or level, where the line is right now in dollars, and the direction
it waits for. A fired line has
a row in Fired, newest first, priced at where the line was when it fired and
saying how long ago. Both tab counts include the lines.

Pressing a line row opens that market and picks the line out once its
drawings have arrived. The bin on an armed row switches the alert off, and
on a fired row clears it from the list. The line stays on the chart either
way.

The footer's **Clear all** asks for confirmation, then removes every line and
price alert from the tab on screen while leaving the other tab alone. Clearing
a line alert removes its alert state; the drawing stays on the chart.

The list reads every two seconds while any line is armed, so a fired line
moves to Fired on its own. Switching an alert on or off from the chart tells
the list to read again at once.

## Not yet

Waiting for a candle to close past the line, repeat firing, a full history of
every fire on one line, extending a trendline to the left, and orders from a
line. Each is its
own task in `workspace/tasks/Smart tools/`.


## Lines protecting Smart Grids

A manually placed Smart Grid can use one enabled drawing alert as its stop.
The chart labels that drawing Grid stop loss. A selected line keeps its own
alert direction and Break buffer. Moving the line changes its alert through
the same rules used by an ordinary drawing.

A linked alert cannot be disabled, deleted, turned into a fib or paused through
Settings. Clear drawings and the Alerts menu's Clear all follow the same rule.
Replace the grid's stop or close the grid first. Once the alert fires, its
closing instruction survives changes to the saved grid and engine restarts.
See `orders/grid-orders.md` for closure, reversal and rollout requirements.
