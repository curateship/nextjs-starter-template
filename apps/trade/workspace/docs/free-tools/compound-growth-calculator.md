# Compound growth calculator

`/tools/compound-growth` is a free public calculator. $1,000 at 1% a day for
365 days becomes $37,783. Turning $1,000 into $100,000 in 365 days needs 1.27%
every single day. It opens without an account and works everything out in the
browser, so nothing a visitor types is sent anywhere.

## The two tabs

- **What it grows to:** a starting amount, a gain every day, week or month, a
  length in days, weeks, months or years, and money added every month. It
  shows the end amount, the money put in, the money made (or lost), a chart and
  a month-by-month table.
- **What a goal needs:** a starting amount, a goal and a date. It shows the gain
  needed each day, and the average gain needed each week and each month. The
  chart and table show the path at that gain.
- **Shared between tabs:** the starting amount and the losing-days settings
  carry over when you switch tabs.

## The formulas

The maths lives in `src/lib/free-tools/compound-growth.ts`. Everything runs
one day at a time.

- **A year is 365 days, and a month is 365 ÷ 12 = 30.42 days.** Six months is
  183 days, rounded to the nearest day. The longest run is fifty years.
- **A gain per week or month becomes a daily gain that compounds to it.** 7% a
  week is 0.97% a day, because 1.0097 to the 7th power is 1.07. Picking week
  or month therefore gives the same answer as the matching daily figure.
- **Forwards:** each day multiplies the balance by (1 + daily gain). $1,000 ×
  1.01^365 = $37,783.
- **Money added each month** goes in at the end of every full month, after that
  day's gain. The twelfth payment of a one-year run goes in on day 365, so it
  earns nothing.
- **Backwards:** daily gain = (goal ÷ start)^(1 ÷ days) − 1. ($100,000 ÷
  $1,000)^(1 ÷ 365) − 1 = 1.27%.
- **The week and month figures in the backwards tab** are averages: (goal ÷
  start)^(7 ÷ days) − 1 and the same with 30.42 days. They do not change when
  losing days are switched on, because the goal and the date have not changed.
- **Backwards ignores money added each month.** The tab has no field for it.

## How losing days are mixed in

The switch "Mix in losing days" asks how many days out of every 100 lose, and
how much each one loses. A losing day takes that loss in place of the day's
gain.

- **Order:** losing days are spread as evenly as whole days allow. Day number n
  (counting from 0) loses when floor((n + 1) × losing ÷ 100) is bigger than
  floor(n × losing ÷ 100). With 40 out of 100, the 3rd, 5th, 8th and 10th days
  lose, and every run of 100 days holds exactly 40.
- **Why the order hardly matters:** with no money added, the end amount is the
  same product of gains and losses in any order. The order changes the answer
  only through money added mid-way and through the month-end figures.
- **Worked example:** 40 out of 100 days lose 1% and the rest gain 1%. In 365
  days, 146 days lose and 219 gain. $1,000 × 1.01^219 × 0.99^146 = $2,037.60,
  which the page shows as $2,038.
- **Backwards with losing days:** the gaining days have to make up for the
  losing ones. Gain on each gaining day = ((goal ÷ start) ÷ (1 − loss)^losing
  days)^(1 ÷ gaining days) − 1. For $1,000 to $100,000 in 365 days with 40 out
  of 100 days losing 1%, each gaining day needs 2.81%.
- **Goals nothing can reach:** with 100 losing days out of 100, or a 100% loss
  on a losing day, the page says no gain can reach the goal.

## The plain line

Every answer carries one line saying that real trading never gains the same
amount every day, and that after a 50% loss a 100% gain only gets you back to
where you started. The line names no figure about real traders. Any such figure
has to come from Trade's own records and say which ones, and none is wired in.

## What the page refuses

- **Limits:** starting amount and goal from $1 to $1,000,000,000, gain from 0%
  to 1,000% a period, and up to fifty years.
- **A number outside the limits, or text that is not a number:** the field is
  marked. Leaving it shows an error saying what is allowed. The answer keeps
  using the last number that fit.
- **Dates:** the goal date must be after today and within fifty years. Today is
  the visitor's own calendar day.
- **A goal at or below the starting amount:** the page asks for a bigger goal.
- **Amounts past $1 quadrillion** read "Over $1 quadrillion". 1% a day for 50
  years gets there.

## Where it is listed

The entry in `src/lib/free-tools/registry.ts` is marked shipped, so its card
shows on `/tools`. `src/routes/tools_.compound-growth.page.ts` declares the
page, which puts it in the sitemap and on the Pages dashboard. Its title and
share preview come from that declaration through `freeToolHead`
(`src/lib/free-tools/tool-head.ts`).
