import * as React from "react"
import { PlayIcon } from "lucide-react"

import "@/components/video-editor/text-fonts.css"
import { Button } from "@/components/ui/button"
import { ColorSwatch } from "@/components/ui/color-swatch"
import { FieldLabel } from "@/components/ui/field-label"
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
  CAPTION_WORDS_MAX,
  CAPTION_Y_MAX,
  CAPTION_Y_MIN,
  captionClipStyle,
  captionText,
  type CaptionLook,
} from "@/lib/video/caption-look"
import {
  applyCaptionPreset,
  CAPTION_PRESETS,
  matchingCaptionPreset,
  type CaptionPresetId,
} from "@/lib/video/caption-presets"
import {
  SAFE_BOX_ASPECT,
  SAFE_BOX_PLATFORMS,
  safeBoxShares,
  type SafeBoxes,
  type SafeBoxPlatformId,
} from "@/lib/video/safe-box"
import {
  requireTextFont,
  TEXT_FONTS,
  type TextFontId,
} from "@/lib/video/text-fonts"
import {
  DEFAULT_TEXT_STROKE_WIDTH,
  TEXT_LINE_HEIGHT,
  TEXT_STROKE_WIDTH_MAX,
  textOutlineCss,
} from "@/lib/video/text-lines"
import type { AspectRatio } from "@/lib/video/timeline-schema"
import { DESIGN_HEIGHT } from "@/lib/video/timeline-utils"

/** The Select's value for a look that no longer matches a preset. */
const OWN_LOOK = "own"
/** The Select's value for keeping clear of no platform. */
const NO_PLATFORM = "none"

/**
 * The caption look's controls with a sample beside them, as the Captions
 * window and Settings → Captions show them.
 */
export function CaptionLookFields({
  idPrefix,
  look,
  onChange,
  safeBoxes,
  aspect,
}: {
  idPrefix: string
  look: CaptionLook
  onChange: (look: CaptionLook) => void
  /** The boxes the sample shades. */
  safeBoxes: SafeBoxes
  /** The project's shape, when there is a project; the box is tall only. */
  aspect?: AspectRatio
}) {
  function patch(next: Partial<CaptionLook>) {
    onChange({ ...look, ...next })
  }

  const preset = matchingCaptionPreset(look)
  const outlined = look.strokeWidth > 0
  const notTall = !!look.platform && !!aspect && aspect !== SAFE_BOX_ASPECT

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <CaptionLookSample look={look} safeBoxes={safeBoxes} aspect={aspect} />
      <div className="grid flex-1 gap-4">
        <div className="grid gap-2">
          <FieldLabel
            htmlFor={`${idPrefix}-preset`}
            hint="Fills in every setting below. Each one can still be changed after."
          >
            Preset
          </FieldLabel>
          <Select
            value={preset ?? OWN_LOOK}
            onValueChange={(next) => {
              if (next === OWN_LOOK) return
              onChange(applyCaptionPreset(look, next as CaptionPresetId))
            }}
          >
            <SelectTrigger id={`${idPrefix}-preset`} className="w-full">
              {/* The name only: a description would widen a phone's page. */}
              <SelectValue>
                {CAPTION_PRESETS.find((option) => option.id === preset)
                  ?.label ?? "Your own, changed from a preset"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {CAPTION_PRESETS.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}: {option.description}
                </SelectItem>
              ))}
              {preset ? null : (
                <SelectItem value={OWN_LOOK} disabled>
                  Your own, changed from a preset
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-font`}>Font</Label>
          <Select
            value={look.fontId}
            onValueChange={(next) =>
              patch({ fontId: requireTextFont(next as TextFontId).id })
            }
          >
            <SelectTrigger id={`${idPrefix}-font`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TEXT_FONTS.map((font) => (
                <SelectItem
                  key={font.id}
                  value={font.id}
                  style={{ fontFamily: font.family }}
                >
                  {font.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

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
          <Label htmlFor={`${idPrefix}-capitals`}>All in capitals</Label>
          <Switch
            id={`${idPrefix}-capitals`}
            checked={look.capitals}
            onCheckedChange={(capitals) => patch({ capitals })}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <Label htmlFor={`${idPrefix}-outline`}>Outline round the letters</Label>
          <Switch
            id={`${idPrefix}-outline`}
            checked={outlined}
            onCheckedChange={(on) =>
              patch({ strokeWidth: on ? DEFAULT_TEXT_STROKE_WIDTH : 0 })
            }
          />
        </div>
        {outlined ? (
          <>
            <div className="grid gap-2">
              <Label htmlFor={`${idPrefix}-outline-colour`}>Outline colour</Label>
              <ColorSwatch
                id={`${idPrefix}-outline-colour`}
                value={look.strokeColor}
                onChange={(event) => patch({ strokeColor: event.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <div className="flex items-baseline justify-between gap-3">
                <Label htmlFor={`${idPrefix}-outline-width`}>
                  Outline thickness
                </Label>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {look.strokeWidth} px
                </span>
              </div>
              <Slider
                id={`${idPrefix}-outline-width`}
                min={1}
                max={TEXT_STROKE_WIDTH_MAX}
                step={1}
                value={[look.strokeWidth]}
                onValueChange={([strokeWidth]) => patch({ strokeWidth })}
              />
            </div>
          </>
        ) : null}

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
                  {option.label}: {option.description}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between gap-4">
          <Label htmlFor={`${idPrefix}-word-highlight`}>
            Light up each word as it is said
          </Label>
          <Switch
            id={`${idPrefix}-word-highlight`}
            checked={look.wordHighlight}
            onCheckedChange={(wordHighlight) => patch({ wordHighlight })}
          />
        </div>
        {look.wordHighlight ? (
          <div className="grid gap-2">
            <Label htmlFor={`${idPrefix}-word-colour`}>
              Spoken word colour
            </Label>
            <ColorSwatch
              id={`${idPrefix}-word-colour`}
              value={look.wordColor}
              onChange={(event) => patch({ wordColor: event.target.value })}
            />
          </div>
        ) : null}

        <div className="grid gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <FieldLabel
              htmlFor={`${idPrefix}-words`}
              hint="A caption is cut at its word times, so captions from a typed translation keep their own length."
            >
              Words at a time
            </FieldLabel>
            <span className="text-sm text-muted-foreground tabular-nums">
              up to {look.wordsPerCaption}
            </span>
          </div>
          <Slider
            id={`${idPrefix}-words`}
            min={1}
            max={CAPTION_WORDS_MAX}
            step={1}
            value={[look.wordsPerCaption]}
            onValueChange={([wordsPerCaption]) => patch({ wordsPerCaption })}
          />
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

        <div className="grid gap-2">
          <FieldLabel
            htmlFor={`${idPrefix}-platform`}
            hint="New captions stay inside the part of a tall frame this platform leaves clear of its own buttons and text. The numbers are on Settings, Captions."
          >
            Keep clear of
          </FieldLabel>
          <Select
            value={look.platform ?? NO_PLATFORM}
            onValueChange={(next) =>
              patch({
                platform:
                  next === NO_PLATFORM ? null : (next as SafeBoxPlatformId),
              })
            }
          >
            <SelectTrigger
              id={`${idPrefix}-platform`}
              className="w-full"
              aria-describedby={notTall ? `${idPrefix}-platform-note` : undefined}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_PLATFORM}>No platform</SelectItem>
              {SAFE_BOX_PLATFORMS.map((platform) => (
                <SelectItem key={platform.id} value={platform.id}>
                  {platform.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {notTall ? (
            <p
              id={`${idPrefix}-platform-note`}
              className="text-sm text-muted-foreground"
            >
              This project is {aspect}. Only tall 9:16 projects keep inside a
              platform&apos;s box, so these captions sit where they always do.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/** Tall, because captions are mostly made for phone-shaped video. */
const SAMPLE_HEIGHT = 256
const SAMPLE_WIDTH = (SAMPLE_HEIGHT * 9) / 16
const SAMPLE_WORDS = "Said out loud"

/**
 * One caption on a small tall frame, drawn with the same rules the editor's
 * preview uses for a text clip: anchored at its middle, wrapping where the
 * look says, sized from the 1080-tall design space, and moved through its
 * entrance by the same numbers. With a platform picked, the parts of the
 * frame it covers are shaded and the words sit where a new caption would.
 * It plays the entrance again whenever the entrance is changed, or when the
 * button asks.
 */
function CaptionLookSample({
  look,
  safeBoxes,
  aspect = SAFE_BOX_ASPECT,
}: {
  look: CaptionLook
  safeBoxes: SafeBoxes
  /** On a wide project the captions keep their place, so no box is shown. */
  aspect?: AspectRatio
}) {
  const font = requireTextFont(look.fontId)
  const wordsRef = React.useRef<HTMLDivElement>(null)
  const [plays, setPlays] = React.useState(0)
  const playsSeen = React.useRef(plays)
  const animated = isAnimatedCaption(look.animation)
  const scale = SAMPLE_HEIGHT / DESIGN_HEIGHT
  const text = captionText(look, SAMPLE_WORDS)
  const place = captionClipStyle({ look, safeBoxes, aspect }, text)
  const box =
    look.platform && aspect === SAFE_BOX_ASPECT
      ? safeBoxShares(safeBoxes[look.platform])
      : null
  const [first, middle, last] = text.split(" ")

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
          surface of the app, which is why it does not follow the theme, and
          why the covered strips are a see-through black. */}
      <div
        aria-label="How a caption will look"
        role="img"
        className="relative shrink-0 overflow-hidden rounded-lg bg-[#6b7280]"
        style={{ width: SAMPLE_WIDTH, height: SAMPLE_HEIGHT }}
      >
        {box ? (
          <div
            aria-hidden="true"
            data-safe-box-sample=""
            className="absolute border border-dashed border-white/60"
            style={{
              top: `${box.top * 100}%`,
              bottom: `${box.bottom * 100}%`,
              left: `${box.left * 100}%`,
              right: `${box.right * 100}%`,
              boxShadow: "0 0 0 999px rgba(0,0,0,0.3)",
            }}
          />
        ) : null}
        <div
          ref={wordsRef}
          aria-hidden="true"
          className="absolute w-max text-center whitespace-pre-wrap"
          style={{
            left: `${place.x * 100}%`,
            top: `${place.y * 100}%`,
            maxWidth: `${(place.wrapWidth ?? 0.9) * 100}%`,
            transform: "translate(-50%, -50%)",
            color: look.color,
            fontFamily: font.family,
            fontWeight: font.weight,
            fontSize: look.fontSize * scale,
            lineHeight: TEXT_LINE_HEIGHT,
            ...textOutlineCss(
              place.strokeColor,
              place.strokeWidth,
              scale
            ),
            backgroundColor: look.boxed ? look.boxColor : undefined,
            padding: look.boxed ? "0.2em 0.45em" : undefined,
            borderRadius: look.boxed ? "0.14em" : undefined,
            textShadow: look.boxed ? undefined : "0 2px 12px rgba(0,0,0,0.45)",
          }}
        >
          {/* With word by word on, the middle word stands in for the one
              being said. */}
          {first}{" "}
          <span
            style={look.wordHighlight ? { color: look.wordColor } : undefined}
          >
            {middle}
          </span>{" "}
          {last}
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
