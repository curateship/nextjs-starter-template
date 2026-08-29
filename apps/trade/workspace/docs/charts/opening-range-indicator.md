# The opening range indicator

At the start of a chosen session, price spends the first stretch — fifteen
minutes to begin with — finding a high and a low. Those two prices are the
**opening range**. The first candle afterwards to **close** above the high is a
breakout; the first to close below the low is a breakdown.

Three things are drawn, and nothing else:

- **The session**, as a faint tint the whole height of the chart, from the hour
  it opens to the hour it shuts. It is grey rather than a colour, and light
  enough that a chart with five of them on it still reads as candles.
- **The opening range**, as a violet box round the candles that made it, from
  its high to its low. Violet because nothing else on this chart is: teal and
  red already mean up and down here, green is the candles and blue is the entry
  line, and a range is none of those — it is the stretch the answer came out of.
  **It is found by its edge and not by its fill.** The box often covers only one
  or two candles, and those candles are the whole reason for drawing it, so the
  inside stays barely tinted — a fill strong enough to be seen on its own is a
  fill that has swallowed what it was pointing at.
- **One arrow** on the candle that closed outside the box. Teal and under the
  candle for a breakout, red and over it for a breakdown.

It does not trade. Whether a break is worth buying is a trading rule and lives
with whatever is trading.

## Where it is

The **Indicators** menu in the market header, beside the timeframe buttons. It
is called **Opening range**.

## Its settings

| Setting | What it does |
| --- | --- |
| When the session starts | New York 09:30–16:00, London 08:00–16:30, Tokyo 09:00–15:00, Sydney 10:00–16:00, the whole day, or hours you choose. |
| The session opens / shuts | Only read when the setting above says hours you choose. |
| How long the opening range lasts | Minutes. 15 to begin with. |
| Shade the session | The tint. |
| Show the range box | The violet rectangle. |
| Show the arrows | The arrows. |
| Watch for breakouts | The up side. |
| Watch for breakdowns | The down side. |

**A session that shuts before it opens runs past midnight** — 22:00 to 05:00 is
seven hours, not a negative number — and **one that shuts at the moment it opens
runs the whole 24 hours**. That last one is how the "whole day" preset is
written down, and it is how to get a break looked for at any hour.

**Every one of those times is read on the chart's own clock**, which the View
options next door set — see `timezone.md`. Put the chart on New York and
09:30 is the New York open. Put it on UTC and 09:30 is 09:30 UTC. The line under
the settings always says which, in words, because the clock is the one thing
about a session that can be wrong while every setting on the card looks right.

**Hiding and watching are different things.** "Show the arrows" hides a picture:
the break still happened, and the box is still there. "Watch for breakouts" is
the up side itself being off — a close above the high is then not a break at
all, so it does not use up the session's one break, and a fall through the low
an hour later still gets its arrow. The Base indicator draws the same line
between its two kinds of switch, for the same reason.

## The rules it follows

- **One break per session.** Once a range has broken, whichever way, it does not
  break again until the next session.
- **A break only counts while the session is open.** A close outside the range
  at three in the morning is not a New York session breaking out of anything, so
  the hunt stops when the session shuts. Set the session to the whole day to
  have every hour count.
- **One session per local day.** On the night the clocks go back and 01:30
  happens twice, that is still one session. The next session is also a hard stop
  whichever way the hours are set, so a 24-hour session cannot swallow the day
  after it.
- **The arrow is on the close, not the wick.** A candle that pokes outside the
  box and closes back inside it has not broken anything.
- **The range must be a whole number of the candles used to find it**, and the
  session's first candle must open exactly on the session's minute. On 1m, 5m
  and 15m charts those are the chart's candles. Hourly, four-hour and daily
  charts read 15m candles alongside their own, so a 09:30 range remains a real
  09:30 range rather than being guessed from the next oversized candle. A
  custom length that 15m candles cannot divide into draws nothing on those
  coarse charts and says why in the settings panel.
- **A day missing candles has no honest opening range.** If any candle of the
  range is absent, that session draws nothing rather than a range invented out
  of what arrived. This is also what stops a run that begins mid-session judging
  half a range: the session is skipped, not guessed at.
- **The session in progress draws what there is so far and no arrow.** A break
  out of a box that has not finished being a box is not something to point at.
  The tint stops at the last candle that has arrived rather than running off
  into empty chart.
- **A day whose range cannot be drawn is still shaded.** The hours are a fact
  about the clock and not about the candles, so a session with a gap in it gets
  its tint and no box — which is how you can see that the range is the thing
  that is missing, rather than the indicator being off.
- **The forming candle is never counted.** The chart hands the indicator its
  closed candles only. A range that keeps changing shape is not a range.

## The range on a coarse chart

Hourly, four-hour and daily charts keep their own candles on screen but find the
opening range from a second 15m read. The box, session and breakout arrow then
sit at their real time and price over the coarse chart. This extra read happens
only while Opening range is on. If it fails, the candles already on screen stay
put and the failure is reported with a retry.

## What is not here yet

- **The Asia / London / New York bands.** This shades the one session it is set
  to. An indicator that tints all three at once, with a high and a low dash for
  each, is `Indicators/session-shading-on-the-chart.md`.
- **Trading it.** The indicator has no `signals` function, so it is not offered
  on the automation Signals step. When it gets one it will map the arrows this
  pass already found — never walk the candles a second time following the same
  rule, which is how the Base indicator once ended up with the ladder following
  1,622 levels while the chart drew 1,387.
- No stop and no targets off the range.
- No volume filter on the break.
