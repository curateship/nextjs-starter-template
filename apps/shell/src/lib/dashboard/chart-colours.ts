/**
 * One colour, mixed down. Everything derives from the theme's primary so the
 * charts follow whatever the workspace is styled to, in both themes.
 *
 * This is a ramp of a single hue being used to tell categories apart, which
 * only works because nothing here carries identity by colour alone: every
 * series is also named beside it, on a bar's own axis label, a legend dot, or
 * a meter row. The list stops at five on purpose — a sixth generated step is
 * too close to the fifth to tell apart, so a sixth category folds into
 * "Other" rather than cycling into a colour nobody can name.
 */

export const shade = (percent: number) =>
  `color-mix(in oklch, var(--primary) ${percent}%, var(--background))`

const planColours = [
  "var(--primary)",
  shade(80),
  shade(60),
  shade(42),
  shade(30),
]

/** The colour for the nth series, wrapping rather than running off the end. */
export function seriesColour(index: number) {
  return planColours[index % planColours.length]!
}
