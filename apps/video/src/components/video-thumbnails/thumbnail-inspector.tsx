import * as React from "react"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  EraserIcon,
  ScanEyeIcon,
  SlidersHorizontal,
  SparklesIcon,
  Trash2Icon,
  WandSparklesIcon,
} from "lucide-react"

import {
  ColorField,
  InspectorCard,
  SliderField,
  SwitchField,
} from "@/components/broadcasts/inspector-fields"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  useSelectedLayer,
  useThumbnails,
} from "@/components/video-thumbnails/thumbnail-store"
import { LengthCounter } from "@/components/video-assets/length-counter"
import { aiUnitCostCents } from "@/lib/ai/ai-models"
import { changePicture } from "@/lib/api/video/thumbnail-ai"
import {
  PICTURE_EDIT_LABELS,
  PICTURE_EDIT_WORDS_MAX,
  WORDED_EDITS,
  type PictureEditKind,
} from "@/lib/video/picture-edits"
import { formatCents } from "@/lib/video/project-spend"
import { MAX_SHAPE_LINE_WIDTH, MIN_SHAPE_LINE_WIDTH } from "@/lib/video/shapes"
import { TEXT_FONTS, type TextFontId } from "@/lib/video/text-fonts"
import {
  hasTextLook,
  OUTLINE_WIDTH_MAX,
  SHADOW_BLUR_MAX,
  SHADOW_OFFSET_MAX,
  SHADOW_SPREAD_MAX,
  SHADOW_STRENGTH_MAX,
  TEXT_SHADOW_DEFAULTS,
  textShadowOf,
  TEXT_LOOK_LABELS,
  TEXT_LOOKS,
  withoutTextLook,
  withTextLook,
  type ThumbnailLayer,
  type ThumbnailPicture,
  type ThumbnailShapeLayer,
  type ThumbnailText,
} from "@/lib/video/thumbnails"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The Thumbnail board's right-hand panel (thumbnails.md): the picked layer's
 * settings, which save themselves, or the board's own colour when nothing is
 * picked. It takes the clip inspector's place while the section is open.
 */
export function ThumbnailInspector() {
  const { open, design, change, selectedLayerIds } = useThumbnails()
  const layer = useSelectedLayer()
  // In the order they were picked, so the first one picked shows its values.
  const several = design
    ? selectedLayerIds.flatMap((id) => design.layers.find((one) => one.id === id) ?? [])
    : []
  const severalWords = several.length > 1 && several.every((one) => one.type === "text") ? (several as ThumbnailText[]) : null

  function patch(next: Partial<ThumbnailLayer>) {
    if (!layer) return
    change((current) => ({
      ...current,
      layers: current.layers.map((one) =>
        one.id === layer.id ? ({ ...one, ...next } as ThumbnailLayer) : one
      ),
    }))
  }

  /** The same change on every picked layer (Tyler, 26 Nov 2026). */
  function patchAll(next: Partial<ThumbnailLayer>) {
    change((current) => ({
      ...current,
      layers: current.layers.map((one) =>
        selectedLayerIds.includes(one.id) ? ({ ...one, ...next } as ThumbnailLayer) : one
      ),
    }))
  }

  const title = several.length > 1
    ? severalWords
      ? `${several.length} words layers`
      : `${several.length} layers`
    : !layer
    ? "Board"
    : layer.type === "text"
      ? "Words"
      : layer.type === "image"
        ? "Picture"
        : layer.type === "shape"
          ? layer.shape === "arrow"
            ? "Arrow"
            : "Circle"
          : layer.type === "spot"
            ? "Picture spot"
            : "Shade"

  return (
    <div data-screen-label="Inspector" className="flex h-full min-h-0 flex-col">
      <DashboardCardTitleHeader icon={<SlidersHorizontal className="size-4" />} title={title} />
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid auto-rows-min gap-3 p-3">
          {!open || !design ? (
            <p className="text-sm text-muted-foreground">Make a thumbnail on the left to start.</p>
          ) : severalWords ? (
            <>
              <TextCards layers={severalWords} patch={patchAll} />
              <SeveralLayersCard count={several.length} words />
            </>
          ) : several.length > 1 ? (
            <SeveralLayersCard count={several.length} />
          ) : !layer ? (
            <InspectorCard title="Board" description="Pick a layer on the board to change it.">
              <ColorField
                label="Background"
                value={design.backgroundColor}
                onChange={(backgroundColor) => change((current) => ({ ...current, backgroundColor }))}
              />
            </InspectorCard>
          ) : (
            <>
              {layer.type === "text" ? <TextCards layers={[layer]} patch={patch} /> : null}
              {layer.type === "image" ? <PictureCards layer={layer} patch={patch} /> : null}
              {layer.type === "shape" ? <ShapeCard layer={layer} patch={patch} /> : null}
              {layer.type === "spot" ? (
                <p className="text-sm text-muted-foreground">
                  A template left this spot for a picture. Add a picture on the left and put it here.
                </p>
              ) : null}
              <LayerCard layer={layer} />
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

/**
 * A words layer's settings. Given several, it shows the first one's values
 * and every change goes to all of them; the words themselves stay each
 * layer's own, so their box is left out.
 */
function TextCards({
  layers,
  patch,
}: {
  layers: ThumbnailText[]
  patch: (next: Partial<ThumbnailLayer>) => void
}) {
  const { change } = useThumbnails()
  const layer = layers[0]
  const one = layers.length === 1
  const ids = new Set(layers.map((each) => each.id))
  /** A look put on, or taken off, every one of them. */
  function toggleLook(look: (typeof TEXT_LOOKS)[number], on: boolean) {
    change((current) => ({
      ...current,
      layers: current.layers.map((each) =>
        ids.has(each.id) && each.type === "text" ? (on ? withoutTextLook(each, look) : withTextLook(each, look)) : each
      ),
    }))
  }
  return (
    <>
      <InspectorCard title={one ? "Words" : "Words, for all of them"}>
        {one ? (
          <>
            <Label htmlFor="thumbnail-words" className="sr-only">
              Words
            </Label>
            <Textarea
              id="thumbnail-words"
              rows={1}
              maxLength={2_000}
              value={layer.text}
              // Words typed afresh drop marks that no longer line up with them.
              onChange={(event) => patch({ text: event.target.value, marks: undefined })}
            />
            <LengthCounter length={layer.text.length} max={2_000} />
          </>
        ) : null}
        <div className="grid gap-2">
          <Label htmlFor="thumbnail-font">Font</Label>
          <Select value={layer.fontId} onValueChange={(fontId) => patch({ fontId: fontId as TextFontId })}>
            <SelectTrigger id="thumbnail-font" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TEXT_FONTS.map((font) => (
                <SelectItem key={font.id} value={font.id}>
                  {font.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <SliderField id="thumbnail-size" label="Size" value={layer.fontSize} min={8} max={220} onChange={(fontSize) => patch({ fontSize })} />
        <ColorField label="Colour" value={layer.color} onChange={(color) => patch({ color })} />
        <Tabs value={layer.align} onValueChange={(align) => patch({ align: align as ThumbnailText["align"] })}>
          <TabsList aria-label="Line up">
            <TabsTrigger value="left">Left</TabsTrigger>
            <TabsTrigger value="center">Middle</TabsTrigger>
            <TabsTrigger value="right">Right</TabsTrigger>
          </TabsList>
        </Tabs>
      </InspectorCard>
      <InspectorCard title="Styles" description="Ready-made thumbnail looks. Press one again to take it off.">
        <div className="grid grid-cols-2 gap-2">
          {TEXT_LOOKS.map((look) => {
            // On only when every one of them wears it.
            const on = layers.every((each) => hasTextLook(each, look))
            return (
              <Button
                key={look}
                type="button"
                variant={on ? "secondary" : "outline"}
                aria-pressed={on}
                onClick={() => toggleLook(look, on)}
              >
                {TEXT_LOOK_LABELS[look]}
              </Button>
            )
          })}
        </div>
        {layers.every((each) => hasTextLook(each, "accent")) ? (
          <ColorField label="The one word's colour" value={layer.accentColor ?? "#ffd60a"} onChange={(accentColor) => patch({ accentColor })} />
        ) : null}
        {layers.every((each) => hasTextLook(each, "outline")) ? (
          <>
            <ColorField label="Outline colour" value={layer.outlineColor ?? "#000000"} onChange={(outlineColor) => patch({ outlineColor })} />
            <SliderField id="thumbnail-text-outline" label="Outline" value={layer.outlineWidth ?? 0} min={0} max={24} onChange={(outlineWidth) => patch({ outlineWidth })} />
          </>
        ) : null}
        {layers.every((each) => hasTextLook(each, "shadow")) ? <ShadowFields layer={layer} patch={patch} /> : null}
        {layers.every((each) => hasTextLook(each, "box")) ? (
          <ColorField label="Box colour" value={layer.boxColor ?? "#000000"} onChange={(boxColor) => patch({ boxColor })} />
        ) : null}
      </InspectorCard>
    </>
  )
}

/** A drop shadow's colour, how dark, how soft and where it falls. */
function ShadowFields({
  layer,
  patch,
}: {
  layer: ThumbnailText
  patch: (next: Partial<ThumbnailLayer>) => void
}) {
  const shadow = textShadowOf(layer)
  const changed =
    shadow.color !== TEXT_SHADOW_DEFAULTS.color ||
    shadow.opacity !== TEXT_SHADOW_DEFAULTS.opacity ||
    shadow.blur !== TEXT_SHADOW_DEFAULTS.blur ||
    shadow.x !== TEXT_SHADOW_DEFAULTS.x ||
    shadow.y !== TEXT_SHADOW_DEFAULTS.y ||
    shadow.spread !== TEXT_SHADOW_DEFAULTS.spread
  return (
    <>
      <ColorField label="Shadow colour" value={shadow.color} onChange={(shadowColor) => patch({ shadowColor })} />
      <SliderField id="thumbnail-shadow-strength" label="Strength" unit="%" value={Math.round(shadow.opacity * 100)} min={0} max={SHADOW_STRENGTH_MAX * 100} onChange={(value) => patch({ shadowOpacity: Math.round(value) / 100 })} />
      <SliderField id="thumbnail-shadow-spread" label="Spread" value={shadow.spread} min={0} max={SHADOW_SPREAD_MAX} onChange={(shadowSpread) => patch({ shadowSpread })} />
      <SliderField id="thumbnail-shadow-softness" label="Softness" value={shadow.blur} min={0} max={SHADOW_BLUR_MAX} onChange={(shadowBlur) => patch({ shadowBlur })} />
      <SliderField id="thumbnail-shadow-across" label="Across" value={shadow.x} min={-SHADOW_OFFSET_MAX} max={SHADOW_OFFSET_MAX} onChange={(shadowX) => patch({ shadowX })} />
      <SliderField id="thumbnail-shadow-down" label="Down" value={shadow.y} min={-SHADOW_OFFSET_MAX} max={SHADOW_OFFSET_MAX} onChange={(shadowY) => patch({ shadowY })} />
      {changed ? (
        <Button
          type="button"
          variant="ghost"
          onClick={() => patch({ shadowColor: undefined, shadowOpacity: undefined, shadowBlur: undefined, shadowX: undefined, shadowY: undefined, shadowSpread: undefined })}
        >
          Reset shadow
        </Button>
      ) : null}
    </>
  )
}

const IMPROVE_KINDS: PictureEditKind[] = ["brighter", "cleaner", "cutout", "background", "own"]

function PictureCards({
  layer,
  patch,
}: {
  layer: ThumbnailPicture
  patch: (next: Partial<ThumbnailLayer>) => void
}) {
  const { open, run, busy, tries, model, addVersion, setBeforeAfter, selectLayer } = useThumbnails()
  const [improve, setImprove] = React.useState<PictureEditKind>("brighter")
  const [words, setWords] = React.useState("")
  const [objectWords, setObjectWords] = React.useState("")
  const price = formatCents(aiUnitCostCents(model, tries))

  function press(kind: PictureEditKind, typed?: string) {
    if (!open) return
    if (WORDED_EDITS.has(kind) && !typed?.trim()) {
      showErrorToast("Say what should change first.")
      return
    }
    void run(`${PICTURE_EDIT_LABELS[kind]}, ${tries} ${tries === 1 ? "version" : "versions"}…`, async () => {
      const rows = await changePicture({ thumbnailId: open.id, layerId: layer.id, kind, words: typed?.trim(), model, tries })
      for (const row of [...rows].reverse()) addVersion(row)
      // The first new version opens with the slider over the changed picture.
      selectLayer(layer.id)
      setBeforeAfter({ layerId: layer.id, beforeUrl: layer.url })
    })
  }

  return (
    <>
      <InspectorCard title="Picture">
        <Tabs value={layer.fit} onValueChange={(fit) => patch({ fit: fit as ThumbnailPicture["fit"] })}>
          <TabsList aria-label="Fit">
            <TabsTrigger value="cover">Fill</TabsTrigger>
            <TabsTrigger value="contain">Fit</TabsTrigger>
          </TabsList>
        </Tabs>
        <SliderField id="thumbnail-brightness" label="Brightness" unit="" value={Math.round((layer.brightness ?? 0) * 100)} min={-50} max={50} onChange={(value) => patch({ brightness: value / 100 })} />
        <SliderField id="thumbnail-contrast" label="Contrast" unit="%" value={Math.round((layer.contrast ?? 1) * 100)} min={50} max={200} onChange={(value) => patch({ contrast: Math.round(value) / 100 })} />
        <SliderField id="thumbnail-saturation" label="Saturation" unit="%" value={Math.round((layer.saturation ?? 1) * 100)} min={0} max={200} onChange={(value) => patch({ saturation: Math.round(value) / 100 })} />
        {layer.brightness || (layer.contrast ?? 1) !== 1 || (layer.saturation ?? 1) !== 1 ? (
          <Button type="button" variant="ghost" onClick={() => patch({ brightness: undefined, contrast: undefined, saturation: undefined })}>
            Reset colour
          </Button>
        ) : null}
      </InspectorCard>

      <InspectorCard title="Outline and glow" description="For a cut-out: a line round its edge, the classic sticker look.">
        <SwitchField
          id="thumbnail-outline"
          label="Outline"
          checked={!!layer.outlineColor}
          onChange={(on) => patch(on ? { outlineColor: "#ffffff", outlineWidth: 10 } : { outlineColor: undefined, outlineWidth: undefined })}
        />
        {layer.outlineColor ? (
          <>
            <ColorField label="Outline colour" value={layer.outlineColor} onChange={(outlineColor) => patch({ outlineColor })} />
            <SliderField id="thumbnail-outline-width" label="Thickness" value={layer.outlineWidth ?? 0} min={0} max={OUTLINE_WIDTH_MAX} onChange={(outlineWidth) => patch({ outlineWidth })} />
          </>
        ) : null}
        <SwitchField
          id="thumbnail-glow"
          label="Glow"
          checked={!!layer.glowColor}
          onChange={(on) => patch({ glowColor: on ? "#ffd60a" : undefined })}
        />
        {layer.glowColor ? (
          <ColorField label="Glow colour" value={layer.glowColor} onChange={(glowColor) => patch({ glowColor })} />
        ) : null}
      </InspectorCard>

      <InspectorCard title="Improve with AI" description={`Makes ${tries} new ${tries === 1 ? "thumbnail" : "thumbnails"} to pick from. Change how many under AI pictures on the left.`}>
        <Select value={improve} onValueChange={(next) => setImprove(next as PictureEditKind)}>
          <SelectTrigger aria-label="How to improve it" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {IMPROVE_KINDS.map((kind) => (
              <SelectItem key={kind} value={kind}>
                {PICTURE_EDIT_LABELS[kind]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {WORDED_EDITS.has(improve) ? (
          <Input
            aria-label={improve === "background" ? "What goes behind" : "What to change"}
            value={words}
            maxLength={PICTURE_EDIT_WORDS_MAX}
            placeholder={improve === "background" ? "a bright red wall" : "make the sky orange"}
            onChange={(event) => setWords(event.target.value)}
          />
        ) : null}
        <Button type="button" disabled={busy !== null} onClick={() => press(improve, words)}>
          <WandSparklesIcon />
          {PICTURE_EDIT_LABELS[improve]} · {price}
        </Button>
      </InspectorCard>

      <InspectorCard title="Clean up">
        <Button type="button" variant="outline" disabled={busy !== null} onClick={() => press("sharpen")}>
          <ScanEyeIcon />
          Sharpen and enlarge · {price}
        </Button>
        <Button type="button" variant="outline" disabled={busy !== null} onClick={() => press("reflection")}>
          <SparklesIcon />
          Remove reflection · {price}
        </Button>
        <div className="grid gap-2">
          <Input
            aria-label="What should go?"
            value={objectWords}
            maxLength={PICTURE_EDIT_WORDS_MAX}
            placeholder="What should go? the cup"
            onChange={(event) => setObjectWords(event.target.value)}
          />
          <Button type="button" variant="outline" disabled={busy !== null} onClick={() => press("object", objectWords)}>
            <EraserIcon />
            Remove it · {price}
          </Button>
        </div>
      </InspectorCard>
    </>
  )
}

function ShapeCard({
  layer,
  patch,
}: {
  layer: ThumbnailShapeLayer
  patch: (next: Partial<ThumbnailLayer>) => void
}) {
  return (
    <InspectorCard title={layer.shape === "arrow" ? "Arrow" : "Circle"} description="Its box on the board is where it is drawn.">
      <Tabs value={layer.shape} onValueChange={(shape) => patch({ shape: shape as ThumbnailShapeLayer["shape"] })}>
        <TabsList aria-label="Which shape">
          <TabsTrigger value="arrow">Arrow</TabsTrigger>
          <TabsTrigger value="circle">Circle</TabsTrigger>
        </TabsList>
      </Tabs>
      {layer.shape === "arrow" ? (
        <Tabs
          value={layer.fromX < layer.toX ? "right" : "left"}
          onValueChange={(side) =>
            patch(side === "right" ? { fromX: 0, toX: 1 } : { fromX: 1, toX: 0 })
          }
        >
          <TabsList aria-label="Which way it points">
            <TabsTrigger value="right">Points right</TabsTrigger>
            <TabsTrigger value="left">Points left</TabsTrigger>
          </TabsList>
        </Tabs>
      ) : null}
      <ColorField label="Colour" value={layer.color} onChange={(color) => patch({ color })} />
      <SliderField id="thumbnail-line" label="Thickness" value={layer.lineWidth} min={MIN_SHAPE_LINE_WIDTH} max={MAX_SHAPE_LINE_WIDTH} onChange={(lineWidth) => patch({ lineWidth })} />
    </InspectorCard>
  )
}

/**
 * Several layers picked by shift-click: they move together on the board, and
 * go together here or with Delete.
 */
function SeveralLayersCard({ count, words = false }: { count: number; words?: boolean }) {
  const { change, selectLayer, selectedLayerIds } = useThumbnails()
  return (
    <InspectorCard
      title={`${count} layers picked`}
      description={`${words ? "Changes above go to all of them. " : ""}Drag any of them to move them together. Shift-click a layer to add it or take it off.`}
    >
      <Button
        type="button"
        variant="ghost"
        className="text-destructive"
        onClick={() => {
          change((current) => ({ ...current, layers: current.layers.filter((one) => !selectedLayerIds.includes(one.id)) }))
          selectLayer(null)
        }}
      >
        <Trash2Icon />
        Delete {count} layers
      </Button>
    </InspectorCard>
  )
}

/** Order and delete, the same for every layer. */
function LayerCard({ layer }: { layer: ThumbnailLayer }) {
  const { change, selectLayer } = useThumbnails()
  function reorder(step: 1 | -1) {
    change((current) => {
      const sorted = [...current.layers].sort((a, b) => a.zIndex - b.zIndex)
      const index = sorted.findIndex((one) => one.id === layer.id)
      const swap = sorted[index + step]
      if (!swap) return current
      return {
        ...current,
        layers: current.layers.map((one) =>
          one.id === layer.id
            ? ({ ...one, zIndex: swap.zIndex } as ThumbnailLayer)
            : one.id === swap.id
              ? ({ ...one, zIndex: layer.zIndex } as ThumbnailLayer)
              : one
        ),
      }
    })
  }
  return (
    <InspectorCard title="Layer">
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={() => reorder(1)}>
          <ArrowUpIcon />
          Forward
        </Button>
        <Button type="button" variant="outline" className="flex-1" onClick={() => reorder(-1)}>
          <ArrowDownIcon />
          Back
        </Button>
      </div>
      <Button
        type="button"
        variant="ghost"
        className="text-destructive"
        onClick={() => {
          change((current) => ({ ...current, layers: current.layers.filter((one) => one.id !== layer.id) }))
          selectLayer(null)
        }}
      >
        <Trash2Icon />
        Delete the layer
      </Button>
    </InspectorCard>
  )
}
