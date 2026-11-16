import { useId, useLayoutEffect, useRef, useState, type RefObject } from "react"

import { cn } from "@/lib/utils"

/**
 * The Flowfly logo: the name in Grandstander Bold with a firefly drifting at
 * its top right, and a small version that is the letter f with the same
 * firefly. Tyler chose each part on 15 Nov 2026, see
 * `workspace/docs/brand-logo.md`.
 *
 * The letters are drawn shapes, not text, so the logo needs no font file. The
 * movement is CSS in `theme.css` under the `flowfly-` names, and it stops when
 * the device asks for less motion.
 */

/** "flowfly", 30 units tall on a baseline at 33, in a 123 by 44 box. */
const WORD_PATH =
  "M5.7 33.2Q5.7 32.9 5.6 32.2Q5.4 31.5 5.3 30.5Q5.2 29.5 5 28.4Q4.8 27.3 4.7 26.2Q4.4 26.2 3.8 26.4Q3.2 26.6 2.8 26.7Q2.5 26 2.4 24.9Q2.3 23.7 2.3 22.7Q2.4 22.6 2.7 22.5Q3 22.5 3.3 22.4Q3.7 22.3 4 22.2Q4.3 22.1 4.4 22.1Q4.3 21.5 4.3 20.8Q4.2 20.1 4.2 19.4Q4.2 17.6 4.9 16.1Q5.5 14.5 6.9 13.6Q8.3 12.6 10.3 12.6Q11.6 12.6 12.5 12.9Q13.4 13.2 14 13.6Q14.6 14 15 14.5Q15.3 14.9 15.5 15.2Q15.2 15.8 14.7 16.6Q14.2 17.3 13.8 18Q13.3 18.7 13.1 19Q13 18.7 12.7 18.4Q12.5 18.1 12.2 17.8Q11.9 17.6 11.5 17.4Q11.2 17.2 10.7 17.2Q10 17.2 9.6 17.6Q9.2 17.9 9 18.5Q8.8 19.1 8.8 19.8Q8.8 20.2 8.8 20.6Q8.9 21 8.9 21.4Q9.4 21.4 10.2 21.4Q10.9 21.4 11.6 21.4Q12.3 21.4 12.7 21.5Q12.8 22.2 12.8 23.3Q12.9 24.4 12.9 25.3Q12.7 25.3 12.1 25.3Q11.5 25.3 10.7 25.4Q10 25.4 9.5 25.5Q9.6 25.9 9.7 26.7Q9.8 27.6 10 28.5Q10.2 29.5 10.4 30.4Q10.5 31.3 10.7 32Q10.8 32.7 10.8 32.9Q10.2 33 9.3 33Q8.4 33.1 7.4 33.1Q6.5 33.1 5.7 33.2ZM25.1 32.3Q24.7 32.7 23.6 33.2Q22.4 33.6 21 33.6Q19.2 33.6 18.2 32.7Q17.3 31.9 17 30.3Q16.6 28.8 16.6 26.7Q16.6 25 16.7 23.4Q16.7 21.7 16.7 20.1Q16.8 18.5 16.9 17Q16.9 15.4 17 14.1Q17.1 12.7 17.1 11.6Q18.2 11.5 19.1 11.5Q19.7 11.5 20.3 11.5Q20.8 11.6 21.5 11.6Q21.4 12.9 21.3 14.5Q21.2 16.1 21.2 17.7Q21.1 19.4 21 20.9Q20.9 22.5 20.9 23.7Q20.9 25 20.9 25.7Q20.9 26.7 20.9 27.5Q21 28.4 21.3 28.9Q21.6 29.4 22.2 29.4Q22.7 29.4 23.1 29.2Q23.4 28.9 23.6 28.6Q23.7 28.8 23.9 29.3Q24.1 29.8 24.4 30.5Q24.7 31.1 24.9 31.6Q25.1 32.1 25.1 32.3ZM34.1 33.3Q30.1 33.3 28.1 31.2Q26.1 29.1 26.1 25.1Q26.1 22.4 27.2 20.6Q28.2 18.9 30 18Q31.9 17.1 34.3 17.1Q36.7 17.1 38.4 18.2Q40 19.3 40.8 21.3Q41.6 23.3 41.6 25.9Q41.6 28.1 40.7 29.8Q39.9 31.5 38.2 32.4Q36.5 33.3 34.1 33.3ZM33.9 29Q34.8 29 35.4 28.7Q36 28.5 36.5 27.9Q36.9 27.4 37.2 26.7Q37.4 25.9 37.4 25.1Q37.4 23.8 37 22.7Q36.6 21.7 35.9 21.1Q35.1 20.6 34 20.6Q32.9 20.6 32.1 21.1Q31.4 21.8 31 22.7Q30.6 23.7 30.6 24.8Q30.6 26.6 31.5 27.8Q32.3 29 33.9 29ZM49.2 32.9Q47.6 32.9 46.5 32.1Q45.4 31.4 44.8 30.1Q44.2 28.8 43.9 27Q43.7 25.3 43.7 23.4Q43.7 21.9 43.8 20.3Q43.9 18.7 44.1 17.1Q45 17.1 46.2 17.2Q47.4 17.2 48.4 17.3Q48.3 19.1 48.2 20.7Q48.1 22.4 48.1 23.7Q48.1 25.2 48.2 26.2Q48.4 27.3 48.7 27.9Q49.1 28.5 49.7 28.5Q50.3 28.5 50.7 28Q51.1 27.4 51.3 26.6Q51.6 25.7 51.7 24.5Q51.8 23.3 51.8 21.9Q51.8 20.9 51.8 19.7Q51.8 18.5 51.8 17.4Q52.2 17.4 53 17.4Q53.7 17.4 54.5 17.4Q55.3 17.4 55.8 17.5Q55.8 18 55.8 18.6Q55.8 19.1 55.8 19.7Q55.8 21.8 55.8 23.6Q55.9 25.3 56.1 26.5Q56.2 27.7 56.6 28.3Q57 29 57.7 29Q58.3 29 58.7 28.4Q59.2 27.9 59.4 26.9Q59.7 25.9 59.8 24.6Q59.9 23.2 59.9 21.7Q59.9 21.1 59.9 20.4Q59.9 19.6 59.9 18.9Q59.9 18.1 59.9 17.4Q60.3 17.4 60.8 17.4Q61.3 17.4 61.8 17.4Q62.3 17.4 63 17.4Q63.6 17.4 64 17.5Q64.1 18.1 64.1 19Q64.2 19.8 64.2 20.7Q64.2 21.5 64.2 22.1Q64.2 24 64 25.6Q63.8 27.2 63.3 28.6Q62.8 29.9 62.1 30.8Q61.4 31.8 60.3 32.3Q59.3 32.8 57.9 32.8Q56.7 32.8 55.9 32.4Q55.1 32 54.6 31.3Q54.1 30.7 53.8 30Q53.6 29.3 53.5 28.7Q53.4 28.1 53.3 27.7L54.2 27.9Q54.2 28.5 53.9 29.3Q53.6 30.2 53 31Q52.4 31.8 51.5 32.4Q50.6 32.9 49.2 32.9ZM69.2 33.2Q69.2 32.9 69 32.2Q68.9 31.5 68.8 30.5Q68.6 29.5 68.5 28.4Q68.3 27.3 68.2 26.2Q67.9 26.2 67.3 26.4Q66.7 26.6 66.2 26.7Q66 26 65.9 24.9Q65.8 23.7 65.7 22.7Q65.9 22.6 66.2 22.5Q66.5 22.5 66.8 22.4Q67.2 22.3 67.5 22.2Q67.8 22.1 67.9 22.1Q67.8 21.5 67.8 20.8Q67.7 20.1 67.7 19.4Q67.7 17.6 68.4 16.1Q69 14.5 70.4 13.6Q71.7 12.6 73.8 12.6Q75 12.6 76 12.9Q76.9 13.2 77.5 13.6Q78.1 14 78.4 14.5Q78.8 14.9 79 15.2Q78.7 15.8 78.2 16.6Q77.7 17.3 77.3 18Q76.8 18.7 76.6 19Q76.4 18.7 76.2 18.4Q75.9 18.1 75.6 17.8Q75.3 17.6 75 17.4Q74.6 17.2 74.2 17.2Q73.5 17.2 73.1 17.6Q72.6 17.9 72.4 18.5Q72.3 19.1 72.3 19.8Q72.3 20.2 72.3 20.6Q72.3 21 72.4 21.4Q72.9 21.4 73.6 21.4Q74.4 21.4 75.1 21.4Q75.8 21.4 76.2 21.5Q76.3 22.2 76.3 23.3Q76.3 24.4 76.3 25.3Q76.2 25.3 75.6 25.3Q75 25.3 74.2 25.4Q73.5 25.4 73 25.5Q73 25.9 73.2 26.7Q73.3 27.6 73.5 28.5Q73.7 29.5 73.8 30.4Q74 31.3 74.1 32Q74.3 32.7 74.3 32.9Q73.7 33 72.8 33Q71.9 33.1 70.9 33.1Q69.9 33.1 69.2 33.2ZM88.6 32.3Q88.2 32.7 87.1 33.2Q85.9 33.6 84.5 33.6Q82.7 33.6 81.7 32.7Q80.8 31.9 80.4 30.3Q80.1 28.8 80.1 26.7Q80.1 25 80.1 23.4Q80.2 21.7 80.2 20.1Q80.3 18.5 80.3 17Q80.4 15.4 80.5 14.1Q80.5 12.7 80.6 11.6Q81.7 11.5 82.6 11.5Q83.2 11.5 83.7 11.5Q84.3 11.6 85 11.6Q84.9 12.9 84.8 14.5Q84.7 16.1 84.6 17.7Q84.6 19.4 84.5 20.9Q84.4 22.5 84.4 23.7Q84.3 25 84.3 25.7Q84.3 26.7 84.4 27.5Q84.5 28.4 84.8 28.9Q85.1 29.4 85.7 29.4Q86.2 29.4 86.5 29.2Q86.9 28.9 87.1 28.6Q87.2 28.8 87.4 29.3Q87.6 29.8 87.9 30.5Q88.2 31.1 88.4 31.6Q88.6 32.1 88.6 32.3ZM95.2 40.9Q92.9 40.9 91.1 40.2Q89.3 39.5 88.1 38.7Q88.3 38.2 88.7 37.5Q89.1 36.7 89.5 36Q89.9 35.2 90.1 34.9Q90.7 35.2 91.5 35.7Q92.4 36.1 93.4 36.4Q94.4 36.7 95.4 36.7Q96.5 36.7 97.2 36.1Q98 35.6 98.4 34.6Q98.9 33.7 99.1 32.5Q99.3 31.4 99.3 30.2Q99 30.8 98.4 31.3Q97.8 31.8 97.1 32.1Q96.3 32.4 95.3 32.4Q93 32.4 91.8 31.2Q90.5 29.9 90 27.8Q89.5 25.6 89.5 23Q89.5 21.9 89.5 20.8Q89.6 19.7 89.6 18.5Q89.9 18.4 90.4 18.4Q90.9 18.4 91.5 18.4Q92.3 18.4 93.1 18.4Q93.9 18.5 94.2 18.5Q94.2 18.8 94.1 19.4Q94 20.1 93.9 21Q93.8 22 93.8 23Q93.8 23.9 93.9 24.8Q94 25.7 94.3 26.5Q94.5 27.2 94.9 27.7Q95.4 28.1 96 28.1Q97.1 28.1 97.7 27.4Q98.4 26.6 98.7 25.3Q99 23.9 99.1 22.2Q99.1 21.6 99.1 21Q99.1 20.5 99.1 20Q99.1 19.5 99.1 19.1Q99.1 18.8 99.1 18.6Q99.4 18.6 99.8 18.6Q100.1 18.6 100.5 18.6Q101.9 18.6 103.2 18.9Q103.3 20.6 103.3 22.7Q103.3 24.1 103.2 25.7Q103.2 27.3 103.2 28.9Q103.1 30.5 103 32.2Q102.9 34.7 102 36.7Q101.1 38.7 99.4 39.8Q97.7 40.9 95.2 40.9Z"

/** The letter f alone, centred at 15 in a 40 by 40 box. */
const LETTER_PATH =
  "M11.1 35.2Q11 34.9 10.9 34Q10.7 33.1 10.6 31.8Q10.4 30.5 10.2 29Q10 27.5 9.8 26.1Q9.4 26.2 8.6 26.4Q7.9 26.6 7.3 26.8Q7 25.9 6.8 24.4Q6.6 22.9 6.6 21.6Q6.8 21.5 7.2 21.4Q7.6 21.3 8 21.2Q8.4 21.1 8.8 21Q9.2 20.9 9.4 20.8Q9.3 20 9.2 19.1Q9.1 18.2 9.1 17.4Q9.1 15 10 13Q10.9 11 12.6 9.7Q14.4 8.5 17 8.5Q18.7 8.5 19.9 8.9Q21.1 9.2 21.9 9.8Q22.6 10.3 23.1 10.9Q23.6 11.5 23.8 11.9Q23.4 12.6 22.8 13.6Q22.2 14.6 21.6 15.5Q21 16.4 20.7 16.8Q20.5 16.4 20.2 16Q19.9 15.7 19.5 15.3Q19.1 14.9 18.6 14.7Q18.2 14.5 17.6 14.5Q16.7 14.5 16.1 14.9Q15.6 15.4 15.3 16.2Q15.1 16.9 15.1 17.9Q15.1 18.3 15.1 18.9Q15.2 19.5 15.3 19.9Q15.9 19.9 16.9 19.9Q17.8 19.9 18.8 19.9Q19.7 19.9 20.2 20Q20.3 21 20.3 22.4Q20.4 23.8 20.4 25Q20.2 25 19.4 25Q18.6 25 17.6 25.1Q16.7 25.1 16 25.2Q16.1 25.8 16.3 26.9Q16.5 27.9 16.7 29.2Q16.9 30.5 17.1 31.6Q17.3 32.8 17.5 33.7Q17.7 34.6 17.7 34.8Q17 35 15.8 35.1Q14.6 35.1 13.3 35.2Q12.1 35.2 11.1 35.2Z"

/**
 * The glow's fill. Each drawing needs its own id, hence the prop. The colours
 * are set in `theme.css`, not here, so a change of colour can fade.
 */
function GlowGradient({ id }: { id: string }) {
  return (
    <radialGradient id={id}>
      <stop offset="0" className="flowfly-glow-core-stop" />
      <stop offset=".3" className="flowfly-glow-stop" />
      <stop offset=".55" className="flowfly-glow-stop" stopOpacity=".45" />
      <stop offset="1" className="flowfly-glow-stop" stopOpacity="0" />
    </radialGradient>
  )
}

/**
 * The firefly, drawn in its own 40 by 40 space with its head at the top and
 * the middle of its glow at 20, 24. `transform` puts it where the caller
 * wants it. The green blob goes last so its glow covers the body (Tyler: "the
 * green blod should go over the firefly so we see less of it").
 */
function Firefly({ transform, glowId }: { transform: string; glowId: string }) {
  return (
    <g className="flowfly-drift-a">
      <g className="flowfly-drift-b">
        <g className="flowfly-drift-c">
          <g transform={transform}>
            <g className="flowfly-wing-left">
              <ellipse
                cx="10.5"
                cy="13"
                rx="8.5"
                ry="4.8"
                transform="rotate(28 10.5 13)"
                fill="var(--p-fly-wing)"
              />
            </g>
            <g className="flowfly-wing-right">
              <ellipse
                cx="29.5"
                cy="13"
                rx="8.5"
                ry="4.8"
                transform="rotate(-28 29.5 13)"
                fill="var(--p-fly-wing)"
              />
            </g>
            <ellipse cx="20" cy="18.5" rx="4.4" ry="3.6" fill="var(--p-fly-body)" />
            <circle cx="20" cy="12" r="5" fill="var(--p-fly-body)" />
            <circle
              className="flowfly-glow"
              cx="20"
              cy="24"
              r="17"
              fill={`url(#${glowId})`}
            />
          </g>
        </g>
      </g>
    </g>
  )
}

/**
 * The firefly riding the end of a timer ring's bar, for use inside the ring's
 * own `<svg>`. `fraction` is how much of the ring the bar still covers, 1 at
 * the start and 0 at the end, measured clockwise from the top like the bar.
 * The firefly's glow sits on the bar's end and its head points the way the
 * end is travelling. Its glow is teal while the timer runs and the bar's own
 * orange while it is paused or not started (`running` off). Each start
 * plays one back flip: a loop out from the ring and back. The turn takes the same 0.9 seconds as the bar's own
 * step, so the two stay together.
 */
export function RingFirefly({
  center,
  radius,
  fraction,
  running,
  scale = 1.3,
  perchRef,
  perched = false,
}: {
  center: number
  radius: number
  fraction: number
  running: boolean
  scale?: number
  /** The button the firefly circles while `perched` is on. */
  perchRef?: RefObject<HTMLElement | null>
  /** On from a pause until the next start. */
  perched?: boolean
}) {
  const glowId = useId()
  const flyerRef = useRef<SVGGElement>(null)
  const away = useFlightToPerch({
    flyerRef,
    perchRef,
    perched,
    center,
    radius,
    fraction,
  })
  // Each start plays one back flip, and a pause plays none (Tyler, 15 Nov
  // 2026: "actually dont make it flip from green to orange"). Counting the
  // starts gives the flipping group a new key, which is what makes the
  // animation play again, and zero means no start yet, so nothing flips.
  const [seenRunning, setSeenRunning] = useState(running)
  const [flips, setFlips] = useState(0)
  if (seenRunning !== running) {
    setSeenRunning(running)
    if (running) setFlips(flips + 1)
  }
  // The loop's middle, straight out from the ring above the firefly. It grows
  // with the firefly, so a small ring gets a small loop.
  const loopRadius = 17 * scale
  const colours = cn(
    "flowfly-logo flowfly-logo-letter",
    !running && "flowfly-logo-waiting"
  )
  return (
    <>
      <g
        className={colours}
        style={{
          transform: `rotate(${fraction * 360}deg)`,
          transformOrigin: `${center}px ${center}px`,
          transition: "transform .9s linear",
          opacity: away ? 0 : 1,
        }}
      >
        <defs>
          <GlowGradient id={glowId} />
        </defs>
        <g
          key={flips}
          className={flips > 0 ? "flowfly-flip" : undefined}
          style={{
            transformOrigin: `${center}px ${center - radius - loopRadius}px`,
          }}
        >
          <Firefly
            transform={`translate(${center} ${center - radius}) rotate(-90) scale(${scale}) translate(-20 -24)`}
            glowId={glowId}
          />
        </g>
      </g>
      {perchRef ? (
        // The same firefly, flown by `useFlightToPerch`. It is drawn from the
        // start, unseen, so its drift keeps time with the ring's and the swap
        // between the two does not jump.
        <g
          ref={flyerRef}
          className={colours}
          style={{ opacity: away ? 1 : 0 }}
        >
          <Firefly
            transform={`scale(${scale}) translate(-20 -24)`}
            glowId={glowId}
          />
        </g>
      ) : null}
    </>
  )
}

type Point = { x: number; y: number }

/** The flight over to the button, one turn around it, and the flight back. */
const OUT_MS = 1100
const LAP_MS = 2600
const BACK_MS = 900
/** How far outside the button's edge the firefly's glow circles, in ring units. */
const PERCH_GAP = 16

/**
 * How far along a leg the firefly is at `t`, from 0 to 1, when it leaves at
 * `startPace` and arrives at `endPace` (1 is the leg's average). Matching the
 * lap's pace on arrival is what keeps it from slowing to a stop at the button
 * and then setting off again (Tyler, 15 Nov 2026: "It flew there, pause and
 * then fly again").
 */
function along(t: number, startPace: number, endPace: number) {
  const t2 = t * t
  const t3 = t2 * t
  return (
    (t3 - 2 * t2 + t) * startPace + (-2 * t3 + 3 * t2) + (t3 - t2) * endPace
  )
}

/** A pace for `along`, kept where the leg still only moves forwards. */
function pace(unitsPerMs: number, legMs: number, reach: number) {
  return Math.min(2.5, Math.max(0, (unitsPerMs * legMs) / (3 * reach)))
}

function unit(v: Point): Point {
  const length = Math.hypot(v.x, v.y) || 1
  return { x: v.x / length, y: v.y / length }
}

/**
 * A curve that leaves `from` heading along `fromDir` and lands on `to` heading
 * along `toDir`, so the firefly turns smoothly at both ends. Answers the spot
 * and the heading at `t` from 0 to 1.
 */
function curveAt(from: Point, fromDir: Point, to: Point, toDir: Point, t: number) {
  const reach = curveReach(from, to)
  const a = from
  const b = { x: from.x + fromDir.x * reach, y: from.y + fromDir.y * reach }
  const c = { x: to.x - toDir.x * reach, y: to.y - toDir.y * reach }
  const d = to
  const u = 1 - t
  const at = (p: keyof Point) =>
    u * u * u * a[p] + 3 * u * u * t * b[p] + 3 * u * t * t * c[p] + t * t * t * d[p]
  const slope = (p: keyof Point) =>
    3 * u * u * (b[p] - a[p]) + 6 * u * t * (c[p] - b[p]) + 3 * t * t * (d[p] - c[p])
  return {
    at: { x: at("x"), y: at("y") },
    heading: unit({ x: slope("x"), y: slope("y") }),
  }
}

/** How far the curve's ends reach out along their headings, for `pace`. */
function curveReach(from: Point, to: Point) {
  return Math.hypot(to.x - from.x, to.y - from.y) * 0.45 + 20
}

/**
 * Flies the firefly over to a button and around it while `perched` is on, and
 * back to the end of the ring's bar when it goes off (Tyler, 15 Nov 2026: "add
 * an animation that when I pause the timer. The fly flies over and circle
 * around the start button"). Answers whether the firefly is away from the
 * ring, so the ring's own copy can hide.
 *
 * It runs frame by frame rather than in CSS, because both ends move: the
 * button is wherever the layout put it, and the bar's end keeps moving while
 * the firefly flies back. Positions are in the ring's own units, measured from
 * the `<svg>` the firefly is drawn in. Nothing flies with reduce motion on.
 */
function useFlightToPerch({
  flyerRef,
  perchRef,
  perched,
  center,
  radius,
  fraction,
}: {
  flyerRef: RefObject<SVGGElement | null>
  perchRef?: RefObject<HTMLElement | null>
  perched: boolean
  center: number
  radius: number
  fraction: number
}) {
  const [away, setAway] = useState(false)
  // The running flight reads these each frame instead of starting over.
  const latest = useRef({ perched, fraction })
  useLayoutEffect(() => {
    latest.current = { perched, fraction }
  }, [perched, fraction])

  if (perched && !away && perchRef) {
    const calm =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    if (!calm) setAway(true)
  }

  // Before the paint, so the firefly is already on the bar's end the first
  // time it shows.
  useLayoutEffect(() => {
    if (!away) return
    const flyer = flyerRef.current
    const svg = flyer?.ownerSVGElement
    if (!flyer || !svg) return

    // The bar's end and the way it travels, which is anticlockwise.
    const ringEnd = () => {
      const angle = latest.current.fraction * 2 * Math.PI
      return {
        at: {
          x: center + radius * Math.sin(angle),
          y: center - radius * Math.cos(angle),
        },
        heading: { x: -Math.cos(angle), y: -Math.sin(angle) },
      }
    }
    // The button's middle and the loop around it, in ring units.
    const perch = () => {
      const button = perchRef?.current
      if (!button || !button.isConnected) return null
      const box = svg.getBoundingClientRect()
      const target = button.getBoundingClientRect()
      if (!box.width || !target.width) return null
      const units = svg.viewBox.baseVal.width / box.width
      return {
        x: (target.left + target.width / 2 - box.left) * units,
        y: (target.top + target.height / 2 - box.top) * units,
        rx: (target.width / 2) * units + PERCH_GAP,
        ry: (target.height / 2) * units + PERCH_GAP,
      }
    }
    // Clockwise from the top of the loop.
    const loopAt = (loop: NonNullable<ReturnType<typeof perch>>, turn: number) => ({
      at: { x: loop.x + loop.rx * Math.sin(turn), y: loop.y - loop.ry * Math.cos(turn) },
      heading: unit({ x: loop.rx * Math.cos(turn), y: loop.ry * Math.sin(turn) }),
    })

    const start = ringEnd()
    let here = start.at
    let heading = start.heading
    let leg: "out" | "lap" | "back" = "out"
    let legStart = performance.now()
    let from = { at: here, heading, speed: 0 }
    let speed = 0
    let lastNow = legStart
    let frame = 0

    const switchTo = (next: typeof leg, now: number) => {
      leg = next
      legStart = now
      from = { at: here, heading, speed }
    }

    const step = (now: number) => {
      const before = here
      const loop = perch()
      const wanted = latest.current.perched && loop
      if (!wanted && leg !== "back") switchTo("back", now)
      if (wanted && leg === "back") switchTo("out", now)

      if (leg === "out" && loop) {
        const t = Math.min(1, (now - legStart) / OUT_MS)
        const landing = loopAt(loop, 0)
        const reach = curveReach(from.at, landing.at)
        // At the top of the loop the lap moves at its sideways radius times
        // its turning speed.
        const lapSpeed = (loop.rx * 2 * Math.PI) / LAP_MS
        const spot = curveAt(
          from.at,
          from.heading,
          landing.at,
          landing.heading,
          along(t, pace(from.speed, OUT_MS, reach), pace(lapSpeed, OUT_MS, reach))
        )
        here = spot.at
        heading = spot.heading
        if (t >= 1) switchTo("lap", now)
      } else if (leg === "lap" && loop) {
        const spot = loopAt(loop, ((now - legStart) / LAP_MS) * 2 * Math.PI)
        here = spot.at
        heading = spot.heading
      } else {
        const t = Math.min(1, (now - legStart) / BACK_MS)
        const end = ringEnd()
        const reach = curveReach(from.at, end.at)
        // It leaves at the pace it had and settles onto the bar's slow end.
        const spot = curveAt(
          from.at,
          from.heading,
          end.at,
          end.heading,
          along(t, pace(from.speed, BACK_MS, reach), 0)
        )
        here = spot.at
        heading = spot.heading
        if (t >= 1) {
          setAway(false)
          return
        }
      }

      if (now > lastNow)
        speed = Math.hypot(here.x - before.x, here.y - before.y) / (now - lastNow)
      lastNow = now

      // The firefly is drawn head up, so it turns by the heading's angle from
      // straight up.
      const degrees = (Math.atan2(heading.x, -heading.y) * 180) / Math.PI
      flyer.setAttribute(
        "transform",
        `translate(${here.x.toFixed(2)} ${here.y.toFixed(2)}) rotate(${degrees.toFixed(1)})`
      )
      frame = requestAnimationFrame(step)
    }
    step(performance.now())
    return () => cancelAnimationFrame(frame)
  }, [away, flyerRef, perchRef, center, radius])

  return away
}

export function FlowflyLogo({
  variant = "word",
  className,
}: {
  /** `word` is the whole name. `letter` is the f, for a square space. */
  variant?: "word" | "letter"
  className?: string
}) {
  const glowId = useId()
  const isWord = variant === "word"
  return (
    <svg
      viewBox={isWord ? "0 0 123 44" : "0 0 40 40"}
      className={cn(
        "flowfly-logo shrink-0 overflow-visible",
        !isWord && "flowfly-logo-letter",
        className
      )}
      fill="currentColor"
      aria-hidden="true"
    >
      <defs>
        <GlowGradient id={glowId} />
      </defs>
      <path d={isWord ? WORD_PATH : LETTER_PATH} />
      <Firefly
        transform={
          isWord
            ? "translate(112 9) scale(0.5) rotate(24) translate(-20 -21)"
            : "translate(30 10) scale(0.62) rotate(24) translate(-20 -21)"
        }
        glowId={glowId}
      />
    </svg>
  )
}
