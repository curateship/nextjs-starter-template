import * as React from "react"
import { PlayIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ColorSwatch } from "@/components/ui/color-swatch"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import {
  CAPTION_ANIM_ENTRANCE_MS,
  CAPTION_ANIMATIONS,
  captionEntranceProgress,
  captionWordAnimation,
  captionWordTransformCss,
  isAnimatedCaption,
  resolveCaptionAnimation,
} from "@/lib/video/caption-animations"
import {
  CAPTION_FONT_SIZE_MAX,
  CAPTION_FONT_SIZE_MIN,
  CAPTION_Y_MAX,
  CAPTION_Y_MIN,
  type CaptionLook,
} from "@/lib/video/caption-look"
import { DESIGN_HEIGHT } from "@/lib/video/timeline-utils"
import { requireTextFont } from "@/lib/video/text-fonts"

/**
 * The caption look's controls with a sample beside them. The brand kit uses it
 * to save the look, and the captions window uses it to start from that look,
 * so the two can never offer different choices or draw a different sample.
 */
export function CaptionLookFields({
  idPrefix,
  look,
  onChange,
}: {
  idPrefix: string
  look: CaptionLook
  onChange: (look: CaptionLook) => void
}) {
  function patch(next: Partial<CaptionLook>) {
    onChange({ ...look, ...next })
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <CaptionLookSample look={look} />
      <div className="grid flex-1 gap-4">
        <div className="grid gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <Label htmlFor={`${idPrefix}-size`}>Size</Label>
            <span className="text-sm text-muted-foreground tabular-nums">
              {look.fontSize} px
            </span>
          </div>
          <Slider
            id={`${idPrefix}-size`}
            min={CAPTION_FONT_SIZE_MIN}
            max={CAPTION_FONT_SIZE_MAX}
            step={2}
            value={[look.fontSize]}
            onValueChange={([fontSize]) => patch({ fontSize })}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-colour`}>Colour</Label>
          <ColorSwatch
            id={`${idPrefix}-colour`}
            value={look.color}
            onChange={(event) => patch({ color: event.target.value })}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <Label htmlFor={`${idPrefix}-boxed`}>Box behind the words</Label>
          <Switch
            id={`${idPrefix}-boxed`}
            checked={look.boxed}
            onCheckedChange={(boxed) => patch({ boxed })}
          />
        </div>
        {look.boxed ? (
          <div className="grid gap-2">
            <Label htmlFor={`${idPrefix}-box-colour`}>Box colour</Label>
            <ColorSwatch
              id={`${idPrefix}-box-colour`}
              value={look.boxColor}
              onChange={(event) => patch({ boxColor: event.target.value })}
            />
          </div>
        ) : null}

        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-entrance`}>How they arrive</Label>
          <Select
            value={look.animation}
            onValueChange={(next) =>
              patch({ animation: resolveCaptionAnimation(next) })
            }
          >
            <SelectTrigger id={`${idPrefix}-entrance`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CAPTION_ANIMATIONS.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label} — {option.description}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <Label htmlFor={`${idPrefix}-height`}>How far down</Label>
            <span className="text-sm text-muted-foreground tabular-nums">
              {Math.round(look.y * 100)}% of the frame
            </span>
          </div>
          <Slider
            id={`${idPrefix}-height`}
            min={Math.round(CAPTION_Y_MIN * 100)}
            max={Math.round(CAPTION_Y_MAX * 100)}
            step={1}
            value={[Math.round(look.y * 100)]}
            onValueChange={([percent]) => patch({ y: percent / 100 })}
          />
        </div>
      </div>
    </div>
  )
}

/** Tall, because captions are mostly made for phone-shaped video. */
const SAMPLE_HEIGHT = 256
const SAMPLE_WIDTH = (SAMPLE_HEIGHT * 9) / 16

/**
 * One caption on a small tall frame, drawn with the same rules the editor's
 * preview uses for a text clip: anchored at its middle, wrapping at 90% of
 * the frame, sized from the 1080-tall design space, and moved through its
 * entrance by the same numbers. It plays the entrance again whenever the
 * entrance is changed, or when the button asks.
 */
function CaptionLookSample({ look }: { look: CaptionLook }) {
  const font = requireTextFont("inter")
  const wordsRef = React.useRef<HTMLDivElement>(null)
  const [plays, setPlays] = React.useState(0)
  const playsSeen = React.useRef(plays)
  const animated = isAnimatedCaption(look.animation)

  React.useEffect(() => {
    const element = wordsRef.current
    if (!element) return
    const rest = "translate(-50%, -50%)"
    // Reduced motion stops the replay that follows a change, but a press of
    // the button is asking to see it, so that still plays.
    const pressed = plays !== playsSeen.current
    playsSeen.current = plays
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches
    if (!isAnimatedCaption(look.animation) || (reduceMotion && !pressed)) {
      element.style.transform = rest
      element.style.opacity = ""
      return
    }
    let frame = 0
    const startedAt = performance.now()
    const step = (now: number) => {
      const elapsed = now - startedAt
      const at = captionWordAnimation(
        look.animation,
        captionEntranceProgress(elapsed, 0)
      )
      element.style.transform = `${rest} ${captionWordTransformCss(at)}`
      element.style.opacity = String(at.opacity)
      if (elapsed < CAPTION_ANIM_ENTRANCE_MS) {
        frame = requestAnimationFrame(step)
      }
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [look.animation, plays])

  return (
    <div className="grid justify-items-center gap-2">
      {/* A plain mid grey stands in for the picture, so both white words and
          a black box show up on it. It is a drawing of a frame, not a
          surface of the app, which is why it does not follow the theme. */}
      <div
        aria-label="How a caption will look"
        role="img"
        className="relative shrink-0 overflow-hidden rounded-lg bg-[#6b7280]"
        style={{ width: SAMPLE_WIDTH, height: SAMPLE_HEIGHT }}
      >
        <div
          ref={wordsRef}
          aria-hidden="true"
          className="absolute max-w-[90%] text-center font-semibold whitespace-pre-wrap"
          style={{
            left: "50%",
            top: `${look.y * 100}%`,
            transform: "translate(-50%, -50%)",
            color: look.color,
            fontFamily: font.family,
            fontWeight: font.weight,
            fontSize: (look.fontSize * SAMPLE_HEIGHT) / DESIGN_HEIGHT,
            lineHeight: 1.15,
            backgroundColor: look.boxed ? look.boxColor : undefined,
            padding: look.boxed ? "0.2em 0.45em" : undefined,
            borderRadius: look.boxed ? "0.14em" : undefined,
            textShadow: look.boxed ? undefined : "0 2px 12px rgba(0,0,0,0.45)",
          }}
        >
          Said out loud
        </div>
      </div>
      {animated ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setPlays((count) => count + 1)}
        >
          <PlayIcon />
          Play the entrance
        </Button>
      ) : null}
    </div>
  )
}
