# Chart indicators

**An indicator is a chart control, so it lives in the chart's controls.** There
is no indicators page and no dashboard behind them. The indicator button sits
in the market header beside the timeframe, and the badge on its icon says how
many are switched on.

- **Each indicator has three separate controls.** Its switch turns the drawing
  on or off. A small mark previews its line colours. The settings button opens
  its window without changing whether the indicator is on.
- **The switches here are a tenth smaller than everywhere else**, 40 by 22
  instead of 44 by 24. This is the one place in the app that is not the shared
  size. Everywhere else a switch is the biggest thing on a settings row; here it
  sits in a 32px strip beside a 12px label and a colour chip, and at full size
  it was the loudest thing in a menu that is mostly words.
- **Indicator settings open in a window, not inside the dropdown.** Every
  indicator uses the same header, card, field and footer layout. The cards keep
  each indicator's own groups, such as **Settings** and **Visibility** for Base
  or **The session** and **Visibility** for Opening range.
- **The cards in that window are the shared `Card`, the same one every modal
  uses** — not a hand-drawn grey block. The EMA window's cards were already
  the shared one, and one window holding two kinds of card is what got this
  fixed. The same cards draw the indicator settings on the automation canvas's
  Signals step, white against the panel's grey.
- Every setting explains itself through the info icon beside its label.
  **Reset to defaults** resets the open indicator's draft. **Cancel** throws the
  draft away, and **Save changes** applies it to the chart and remembers it.
- **Reset all** at the bottom of the dropdown switches every indicator off and
  puts every setting back at its default.
- **Which indicators are on is remembered against the account**, not the market
  and not the browser — the same rule as the zoom, and for the same reason: an
  indicator is how you read a chart, not a fact about one coin. It carries onto
  the next market, the next timeframe and the other machine.
- **The eye after the indicator button opens the View options dropdown.** It
  was a window with Save and Cancel buttons until 29 Aug 2026; now it is a
  small dropdown like the Indicators menu, and every change lands as it is
  made. Chart, Your activity and Timezone are its three sections. The five
  checkboxes show or hide the chart grid, volume bars, crosshair, order arrows
  and your drawings.
  All five start on, and each choice follows the account onto the next market,
  visit and machine. When order arrows are on, **Previous trades** accepts any
  positive whole number for how many finished trades to keep, and an empty
  field keeps them all. Fills from the position still open are never trimmed,
  and picking an older Journal row brings that trade's own arrows back while it
  is selected. Hiding drawings leaves every line saved in place, clears the
  picked line and switches off the paint tools until drawings are shown again.
  The bin still appears when hidden drawings exist because clearing and hiding
  are different actions.
- **Switches in the Indicators dropdown take effect at once.** Settings inside
  either window stay in a draft until **Save changes** is pressed. A save that
  does not land is said in a toast and does not undo what is already on the
  chart.
- **The layer takes no clicks.** An indicator is something to look at: the
  chart underneath still pans, zooms and shows its crosshair straight through
  it, and a drawn line or a stop sitting under a dash is still what the pointer
  finds. It also draws first, so nothing somebody put on the chart themselves
  ever ends up behind it.
- **Levels are worked out from closed candles only.** The bar the feed is still
  filling in cannot confirm a level anyway, and redoing every level on every
  tick would be work for an answer that cannot have changed.

**Base** is the first one, ported from the old Trading app with the same six
settings. It marks the floors price keeps bouncing off (a teal dash and a green
arrow up) and the ceilings it keeps getting turned away from (a red dash and a
red arrow down). The arrow lands on the candle that finished the wait, which is
usually well above the level itself — timing an entry near a level is a
different job.

Two of its settings only thin out the arrows and never the dashes, which is the
answer to "why does that level have a dash but no arrow": **Only mark levels
going the right way** (a base has to be above the base before it) and **Fewest
candles between arrows**.

