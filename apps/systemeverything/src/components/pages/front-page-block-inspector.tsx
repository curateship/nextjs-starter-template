import * as React from "react"
import { SlidersHorizontalIcon, XIcon } from "lucide-react"

import { AppFrontPageRowEditor } from "@/components/pages/app-front-page-row-editor"
import { FrontPageRowContentEditor } from "@/components/pages/front-page-row-content-editor"
import {
  FrontPageListedPagesEditor,
  type FrontPageListedPageChoice,
} from "@/components/pages/front-page-listed-pages-editor"
import {
  InspectorCard,
  InspectorCollapseAllButton,
  InspectorCollapseAllProvider,
  useInspectorCollapseAll,
} from "@/components/shared/inspector-card"
import { SettingsSliderRow } from "@/components/settings/settings-slider-row"
import { SettingsSwitchRow } from "@/components/settings/settings-switch-row"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ColorSwatch } from "@/components/ui/color-swatch"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { appFrontPageRowKind } from "@/lib/app-options"
import {
  APP_FRONT_PAGE_ROW_KIND,
  DEFAULT_FRONT_PAGE_DIVIDER_SHADE,
  DEFAULT_FRONT_PAGE_DIVIDER_SPACE,
  DEFAULT_FRONT_PAGE_HERO_GREY,
  DEFAULT_FRONT_PAGE_HERO_SPACING,
  FRONT_PAGE_ROW_ALIGNMENT_HINTS,
  FRONT_PAGE_ROW_ALIGNMENT_LABELS,
  FRONT_PAGE_ROW_ALIGNMENTS,
  FRONT_PAGE_ROW_KIND_LABELS,
  FRONT_PAGE_ROW_LAYOUT_HINTS,
  FRONT_PAGE_ROW_LAYOUT_LABELS,
  FRONT_PAGE_ROW_LAYOUTS,
  MAX_FRONT_PAGE_HERO_GREY,
  MAX_FRONT_PAGE_ROW_HEADING_LENGTH,
  MAX_FRONT_PAGE_ROW_INTRO_LENGTH,
  MAX_FRONT_PAGE_ROW_SPACE,
  frontPageHeroBandColors,
  frontPageHeroGrey,
  normalizeFrontPageHeroBackground,
  type FrontPageRowAlignment,
  type FrontPageRowCommonFields,
  type FrontPageRowDraft,
  type FrontPageRowKind,
  type FrontPageRowLayout,
} from "@/lib/pages/front-page"
import {
  PUBLIC_DEVICE_HINTS,
  PUBLIC_DEVICE_LABELS,
  PUBLIC_DEVICES,
  type PublicDevice,
} from "@/lib/pages/public-device"
import { emptyWrittenPageBody } from "@/lib/pages/written-page-body"
import { PUBLIC_FRONT_PAGE_ROW_GAP_PHONE_SHARE } from "@/lib/public-theme"

/** One kind of draft, narrowed by its `kind`. */
type DraftOfKind<K extends FrontPageRowDraft["kind"]> = Extract<
  FrontPageRowDraft,
  { kind: K }
>

/**
 * A field every kind has, changed without asking which kind this is.
 *
 * Spreading a discriminated union loses the link between `kind` and the fields
 * beside it, so the result has to be named again. `part` is typed to the common
 * fields alone, so the only thing the cast covers is that link.
 */
function patchCommon(
  draft: FrontPageRowDraft,
  part: Partial<FrontPageRowCommonFields>
): FrontPageRowDraft {
  return { ...draft, ...part } as FrontPageRowDraft
}

/** A hero's own field. Anything but a hero is handed back untouched. */
function patchHero(
  draft: FrontPageRowDraft,
  part: Partial<DraftOfKind<"hero">>
): FrontPageRowDraft {
  return draft.kind === "hero" ? { ...draft, ...part } : draft
}

/**
 * The right panel of the front page editor: every field of the one block that
 * is selected.
 *
 * It is the window that used to open over the settings page, unwrapped. The
 * cards, their order and their contents are the same, and so is the gate on
 * Save: a block only joins the page once it holds enough to draw. That gate is
 * not decoration — `normalizeFrontPageRows` drops a testimonials block with no
 * testimonials in it, so a half-built block written straight to the settings
 * would be deleted by its own save.
 */
export function FrontPageBlockInspector({
  draft,
  first,
  pageGap,
  heldBack,
  pageChoices,
  onChange,
  onClose,
}: {
  draft: FrontPageRowDraft
  /**
   * True when this block is the top one on the page. Only that block sits
   * under the site menu, so only that one may carry its colour up behind it.
   */
  first: boolean
  /**
   * The page's own Space between blocks, which is what a side the block has
   * not set follows. Halved for each side, so the two halves of one gap add
   * back up to this number.
   */
  pageGap: number
  /**
   * True while this block is still waiting on something before it can go on
   * the page. Only the kinds that need an entry of their own ever are, and the
   * block list is what says so; the panel marks the empty entry and otherwise
   * stays quiet.
   */
  heldBack: boolean
  /** The pages a Pages list block may show: every page added to this site. */
  pageChoices: readonly FrontPageListedPageChoice[]
  onChange: (draft: FrontPageRowDraft) => void
  /** Closes the panel and goes back to the page's own settings. */
  onClose: () => void
}) {
  const [headingTouched, setHeadingTouched] = React.useState(false)
  /**
   * Whether anything in this block has been typed since the panel opened.
   *
   * A brand-new FAQ block is held off the page the moment it is picked, and
   * painting its fields red before a character is typed is a telling-off for
   * nothing. The panel is keyed per block, so the draft it first saw is the
   * one to compare against.
   */
  const [openedWith] = React.useState(() => JSON.stringify(draft))
  const touched = JSON.stringify(draft) !== openedWith

  const appKind =
    draft.kind === APP_FRONT_PAGE_ROW_KIND
      ? appFrontPageRowKind(draft.appKind)
      : null
  // An app block has none of the shell's own content, so the shell's half of
  // the panel falls back to the plainest kind while the app's card does the
  // rest.
  const kind: FrontPageRowKind =
    draft.kind === APP_FRONT_PAGE_ROW_KIND ? "text" : draft.kind
  const hero = draft.kind === "hero" ? draft : null
  const divider = draft.kind === "divider" ? draft : null

  const headingInvalid = !draft.heading.trim() && headingTouched
  // Which of the two kinds of background the block holds. It stores one
  // Every card in this panel, shut or opened from the one button above them.
  const collapseAll = useInspectorCollapseAll()

  // string: `grey-<n>` is the slider, a `#` is a fixed colour, empty is no
  // band at all.
  const heroBackground = hero?.background ?? ""
  const heroGrey = frontPageHeroGrey(heroBackground)
  const heroBackgroundChoice: "none" | "grey" | "custom" =
    !heroBackground.trim() ? "none" : heroGrey !== null ? "grey" : "custom"
  const heroBand = frontPageHeroBandColors(heroBackground)
  // A block owns half the gap on each side, so the page's number splits in two
  // and the halves of one gap add back up to it.
  const pageHalf = Math.round(pageGap / 2)

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-card">
      <DashboardCardTitleHeader
        icon={<SlidersHorizontalIcon className="size-4" />}
        title={draft.heading.trim() || "Untitled block"}
        meta={appKind ? appKind.label : FRONT_PAGE_ROW_KIND_LABELS[kind]}
        action={
          <div className="flex items-center gap-1">
            <InspectorCollapseAllButton
              nextOpen={collapseAll.nextOpen}
              onPress={() => collapseAll.setAll(collapseAll.nextOpen)}
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label="Close the block's settings"
                  onClick={onClose}
                >
                  <XIcon className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Close the block's settings</TooltipContent>
            </Tooltip>
          </div>
        }
      />
      <ScrollArea className="min-h-0 flex-1">
        <InspectorCollapseAllProvider signal={collapseAll.signal}>
          <div className="grid gap-4 p-4 sm:p-5">
            <InspectorCard
              storageId="front-page-row-content"
              title="Block content"
              description="Every block uses a fixed shape, so the front page stays consistent on phones and larger screens."
            >
              <div className="grid gap-2">
                <FieldLabel
                  htmlFor="front-page-row-heading"
                  hint={
                    kind === "divider"
                      ? "Only the name this block goes by in the list beside it. A divider never shows words on the page."
                      : undefined
                  }
                >
                  {kind === "divider" ? "Name" : "Heading"}
                </FieldLabel>
                <Input
                  id="front-page-row-heading"
                  value={draft.heading}
                  maxLength={MAX_FRONT_PAGE_ROW_HEADING_LENGTH}
                  placeholder={
                    kind === "divider" ? "Divider" : "Welcome to our site"
                  }
                  aria-invalid={headingInvalid || undefined}
                  onBlur={() => setHeadingTouched(true)}
                  onChange={(event) =>
                    onChange(patchCommon(draft, { heading: event.target.value }))
                  }
                />
              </div>

              {kind === "divider" ? null : (
                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor="front-page-row-intro"
                    hint="One short line beneath the heading. Leave it empty to show no introduction."
                  >
                    Introduction
                  </FieldLabel>
                  <Textarea
                    id="front-page-row-intro"
                    rows={1}
                    value={draft.intro}
                    maxLength={MAX_FRONT_PAGE_ROW_INTRO_LENGTH}
                    onChange={(event) =>
                      onChange(patchCommon(draft, { intro: event.target.value }))
                    }
                  />
                </div>
              )}

              <div className="grid gap-2">
                <FieldLabel
                  htmlFor="front-page-row-layout"
                  hint={FRONT_PAGE_ROW_LAYOUT_HINTS[draft.layout]}
                >
                  Layout
                </FieldLabel>
                <Select
                  value={draft.layout}
                  onValueChange={(value) =>
                    onChange(
                      patchCommon(draft, { layout: value as FrontPageRowLayout })
                    )
                  }
                >
                  <SelectTrigger
                    id="front-page-row-layout"
                    className="w-full sm:w-fit"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FRONT_PAGE_ROW_LAYOUTS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {FRONT_PAGE_ROW_LAYOUT_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <FieldLabel
                  htmlFor="front-page-row-alignment"
                  hint={FRONT_PAGE_ROW_ALIGNMENT_HINTS[draft.alignment]}
                >
                  Alignment
                </FieldLabel>
                <Select
                  value={draft.alignment}
                  onValueChange={(value) =>
                    onChange(
                      patchCommon(draft, {
                        alignment: value as FrontPageRowAlignment,
                      })
                    )
                  }
                >
                  <SelectTrigger
                    id="front-page-row-alignment"
                    className="w-full sm:w-fit"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FRONT_PAGE_ROW_ALIGNMENTS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {FRONT_PAGE_ROW_ALIGNMENT_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {hero ? (
                <>
                  <div className="grid gap-2">
                    <FieldLabel
                      htmlFor="front-page-row-hero-background"
                      hint="Painted in a band right across the window, behind this block only, whatever its Layout says. A muted grey is the only one that changes with the mode."
                    >
                      Background colour
                    </FieldLabel>
                    <Select
                      value={heroBackgroundChoice}
                      onValueChange={(value) => {
                        if (value === "none") {
                          onChange(
                            patchHero(draft, {
                              background: "",
                              backgroundUnderMenu: false,
                            })
                          )
                          return
                        }
                        if (value === "grey") {
                          onChange(
                            patchHero(draft, {
                              background: `grey-${DEFAULT_FRONT_PAGE_HERO_GREY}`,
                            })
                          )
                          return
                        }
                        // A fresh fixed colour starts on the pale grey the band
                        // draws by default, so switching to it changes nothing
                        // until a colour is chosen.
                        onChange(patchHero(draft, { background: "#f4f4f5" }))
                      }}
                    >
                      <SelectTrigger
                        id="front-page-row-hero-background"
                        className="w-full sm:w-fit"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No colour</SelectItem>
                        <SelectItem value="grey">Muted grey</SelectItem>
                        <SelectItem value="custom">Fixed colour</SelectItem>
                      </SelectContent>
                    </Select>
                    {heroBackgroundChoice === "grey" ? (
                      <div className="grid gap-3 pt-1">
                        <SettingsSliderRow
                          label="How strong"
                          value={heroGrey ?? DEFAULT_FRONT_PAGE_HERO_GREY}
                          min={0}
                          max={MAX_FRONT_PAGE_HERO_GREY}
                          step={1}
                          valueLabel={`${heroGrey ?? DEFAULT_FRONT_PAGE_HERO_GREY}`}
                          onChange={(value) =>
                            onChange(
                              patchHero(draft, { background: `grey-${value}` })
                            )
                          }
                          help="All the way left the band is barely off the page. Drag right and it steps further away from it. In dark mode the same drag lightens the band instead of darkening it, so one slider sets both."
                        />
                        {/* Both bands at once, because the one you are not
                            looking at is the one that usually goes wrong. */}
                        <div
                          className="flex max-w-sm overflow-hidden rounded-md border"
                          aria-hidden="true"
                        >
                          <div
                            className="h-10 flex-1"
                            style={{ backgroundColor: heroBand.light }}
                          />
                          <div
                            className="h-10 flex-1"
                            style={{ backgroundColor: heroBand.dark }}
                          />
                        </div>
                      </div>
                    ) : null}
                    {heroBackgroundChoice === "custom" ? (
                      <div className="flex items-center gap-2">
                        <ColorSwatch
                          value={hero.background || "#ffffff"}
                          onChange={(event) =>
                            onChange(
                              patchHero(draft, { background: event.target.value })
                            )
                          }
                          aria-label="Pick a background colour"
                        />
                        <Input
                          id="front-page-row-hero-background-hex"
                          value={hero.background}
                          placeholder="#f4f4f5"
                          className="w-40"
                          aria-label="Background colour hex code"
                          aria-invalid={
                            (hero.background.trim() &&
                              !normalizeFrontPageHeroBackground(
                                hero.background
                              )) ||
                            undefined
                          }
                          onChange={(event) =>
                            onChange(
                              patchHero(draft, { background: event.target.value })
                            )
                          }
                        />
                      </div>
                    ) : null}
                  </div>

                  <SettingsSwitchRow
                    id="front-page-row-hero-background-under-menu"
                    checked={hero.backgroundUnderMenu}
                    disabled={!hero.background || !first}
                    onCheckedChange={(next) =>
                      onChange(patchHero(draft, { backgroundUnderMenu: next }))
                    }
                    label="Run the colour under the menu"
                    hint={
                      !first
                        ? "Only the top block of the page sits under the menu. Drag this block to the top to use this."
                        : !hero.background
                          ? "Choose a background colour first. There is nothing to run under the menu until there is one."
                          : "The colour starts at the very top of the window and passes behind the menu. The menu itself is not changed: it keeps its own colour, and its blur now blurs this colour instead of the page."
                    }
                  />
                </>
              ) : null}

              <div className="grid gap-2">
                <FieldLabel
                  htmlFor="front-page-row-device"
                  hint={PUBLIC_DEVICE_HINTS[draft.device]}
                >
                  Shown on
                </FieldLabel>
                <Select
                  value={draft.device}
                  onValueChange={(value) =>
                    onChange(
                      patchCommon(draft, { device: value as PublicDevice })
                    )
                  }
                >
                  <SelectTrigger
                    id="front-page-row-device"
                    className="w-full sm:w-fit"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PUBLIC_DEVICES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {PUBLIC_DEVICE_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </InspectorCard>

            {appKind && draft.kind === APP_FRONT_PAGE_ROW_KIND ? (
              <AppFrontPageRowEditor
                kind={appKind}
                settings={draft.settings}
                onChange={(settings) => onChange({ ...draft, settings })}
              />
            ) : null}

            {draft.kind === "pages" ? (
              <FrontPageListedPagesEditor
                choices={pageChoices}
                pageIds={draft.pageIds}
                onChange={(pageIds) => onChange({ ...draft, pageIds })}
              />
            ) : null}

            <FrontPageRowContentEditor
              kind={kind}
              heroAction={hero?.action ?? "button"}
              heroImage={hero?.image ?? ""}
              heroAlt={hero?.alt ?? ""}
              heroButtonLabel={hero?.buttonLabel ?? ""}
              heroButtonHref={hero?.buttonHref ?? ""}
              heroNote={hero?.note ?? ""}
              heroStars={hero?.stars ?? 0}
              heroSpacing={hero?.spacing ?? DEFAULT_FRONT_PAGE_HERO_SPACING}
              testimonials={draft.kind === "testimonials" ? draft.items : []}
              faqItems={draft.kind === "faq" ? draft.items : []}
              logos={draft.kind === "logos" ? draft.items : []}
              screenshots={draft.kind === "screenshots" ? draft.items : []}
              dividerStyle={divider?.dividerStyle ?? "line"}
              dividerShade={
                divider?.dividerShade ?? DEFAULT_FRONT_PAGE_DIVIDER_SHADE
              }
              dividerSpace={
                divider?.dividerSpace ?? DEFAULT_FRONT_PAGE_DIVIDER_SPACE
              }
              words={draft.kind === "words" ? draft.body : emptyWrittenPageBody()}
              onWordsChange={(body) =>
                onChange(draft.kind === "words" ? { ...draft, body } : draft)
              }
              heldBack={touched && heldBack}
              onHeroActionChange={(action) =>
                onChange(patchHero(draft, { action }))
              }
              onHeroImageChange={(image) => onChange(patchHero(draft, { image }))}
              onHeroAltChange={(alt) => onChange(patchHero(draft, { alt }))}
              onHeroButtonLabelChange={(buttonLabel) =>
                onChange(patchHero(draft, { buttonLabel }))
              }
              onHeroButtonHrefChange={(buttonHref) =>
                onChange(patchHero(draft, { buttonHref }))
              }
              onHeroNoteChange={(note) => onChange(patchHero(draft, { note }))}
              onHeroStarsChange={(stars) => onChange(patchHero(draft, { stars }))}
              onHeroSpacingChange={(spacing) =>
                onChange(patchHero(draft, { spacing }))
              }
              onTestimonialsChange={(next) =>
                onChange(
                  draft.kind === "testimonials" ? { ...draft, items: next } : draft
                )
              }
              onFaqItemsChange={(next) =>
                onChange(draft.kind === "faq" ? { ...draft, items: next } : draft)
              }
              onLogosChange={(next) =>
                onChange(
                  draft.kind === "logos" ? { ...draft, items: next } : draft
                )
              }
              onScreenshotsChange={(next) =>
                onChange(
                  draft.kind === "screenshots" ? { ...draft, items: next } : draft
                )
              }
              onDividerStyleChange={(dividerStyle) =>
                onChange(
                  draft.kind === "divider" ? { ...draft, dividerStyle } : draft
                )
              }
              onDividerShadeChange={(dividerShade) =>
                onChange(
                  draft.kind === "divider" ? { ...draft, dividerShade } : draft
                )
              }
              onDividerSpaceChange={(dividerSpace) =>
                onChange(
                  draft.kind === "divider" ? { ...draft, dividerSpace } : draft
                )
              }
            />

            <InspectorCard
              storageId="front-page-row-spacing"
              title="Spacing"
              description="How much air this block keeps above and below itself, instead of the page's own."
            >
              <SettingsSliderRow
                label="Space above"
                value={draft.spaceAbove ?? pageHalf}
                min={0}
                max={MAX_FRONT_PAGE_ROW_SPACE}
                step={4}
                valueLabel={
                  draft.spaceAbove === null
                    ? `${pageHalf}px · Page default`
                    : `${draft.spaceAbove}px`
                }
                onChange={(spaceAbove) =>
                  onChange(patchCommon(draft, { spaceAbove }))
                }
                help={`Each block keeps its own half of the gap, so a page set to ${pageGap}px gives every block ${pageHalf}px above and ${pageHalf}px below and two blocks still sit ${pageGap}px apart. The two halves add up: set this to 0 and the block above it to 0 and they touch.`}
              />

              <SettingsSliderRow
                label="Space below"
                value={draft.spaceBelow ?? pageHalf}
                min={0}
                max={MAX_FRONT_PAGE_ROW_SPACE}
                step={4}
                valueLabel={
                  draft.spaceBelow === null
                    ? `${pageHalf}px · Page default`
                    : `${draft.spaceBelow}px`
                }
                onChange={(spaceBelow) =>
                  onChange(patchCommon(draft, { spaceBelow }))
                }
                help={`A phone draws ${Math.round(
                  PUBLIC_FRONT_PAGE_ROW_GAP_PHONE_SHARE * 100
                )}% of whatever these two say, the same share the page's own number gets. Flat mode collapses them both, because flat is the whole site asking for no air.`}
              />

              {/* Only when there is something to go back from. A side nobody has
                  touched already follows the page and says so. */}
              {draft.spaceAbove !== null || draft.spaceBelow !== null ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="justify-self-start"
                  onClick={() =>
                    onChange(
                      patchCommon(draft, { spaceAbove: null, spaceBelow: null })
                    )
                  }
                >
                  Follow the page again
                </Button>
              ) : null}
            </InspectorCard>

            <InspectorCard
              storageId="front-page-row-visibility"
              title="Visibility"
              description="Switch off a part of the block to leave it out of the public page. The part keeps whatever you typed into it, so switching it back on brings the same words back."
            >
              <SettingsSwitchRow
                id="front-page-row-hidden"
                checked={draft.hidden}
                onCheckedChange={(hidden) =>
                  onChange(patchCommon(draft, { hidden }))
                }
                label="Hide this block from visitors"
                hint="The whole block is left out of the page, words and all, so nothing in it can be read out of the page source."
              />
              {/* A divider draws neither, so switching them would do nothing. */}
              {kind === "divider" ? null : (
                <>
                  <SettingsSwitchRow
                    id="front-page-row-show-heading"
                    checked={draft.showHeading}
                    onCheckedChange={(showHeading) =>
                      onChange(patchCommon(draft, { showHeading }))
                    }
                    label="Show the heading"
                  />
                  <SettingsSwitchRow
                    id="front-page-row-show-intro"
                    checked={draft.showIntro}
                    onCheckedChange={(showIntro) =>
                      onChange(patchCommon(draft, { showIntro }))
                    }
                    label="Show the introduction line"
                  />
                </>
              )}
              {kind === "hero" ? (
                <>
                  <SettingsSwitchRow
                    id="front-page-row-show-image"
                    checked={draft.showImage}
                    onCheckedChange={(showImage) =>
                      onChange(patchCommon(draft, { showImage }))
                    }
                    label="Show the picture"
                    hint="With the picture off, the words run across the page instead of sitting in one column."
                  />
                  <SettingsSwitchRow
                    id="front-page-row-show-action"
                    checked={draft.showAction}
                    onCheckedChange={(showAction) =>
                      onChange(patchCommon(draft, { showAction }))
                    }
                    label="Show the button or email box"
                  />
                  <SettingsSwitchRow
                    id="front-page-row-show-stars"
                    checked={draft.showStars}
                    onCheckedChange={(showStars) =>
                      onChange(patchCommon(draft, { showStars }))
                    }
                    label="Show the stars"
                  />
                  <SettingsSwitchRow
                    id="front-page-row-show-note"
                    checked={draft.showNote}
                    onCheckedChange={(showNote) =>
                      onChange(patchCommon(draft, { showNote }))
                    }
                    label="Show the line under the button"
                  />
                </>
              ) : null}
              {kind === "testimonials" ? (
                <>
                  <SettingsSwitchRow
                    id="front-page-row-show-pictures"
                    checked={draft.showPictures}
                    onCheckedChange={(showPictures) =>
                      onChange(patchCommon(draft, { showPictures }))
                    }
                    label="Show each person's picture"
                  />
                  <SettingsSwitchRow
                    id="front-page-row-show-roles"
                    checked={draft.showRoles}
                    onCheckedChange={(showRoles) =>
                      onChange(patchCommon(draft, { showRoles }))
                    }
                    label="Show each person's role"
                  />
                </>
              ) : null}
              {kind === "faq" ? (
                <SettingsSwitchRow
                  id="front-page-row-show-numbers"
                  checked={draft.showNumbers}
                  onCheckedChange={(showNumbers) =>
                    onChange(patchCommon(draft, { showNumbers }))
                  }
                  label="Number the questions"
                />
              ) : null}
              {kind === "screenshots" ? (
                <SettingsSwitchRow
                  id="front-page-row-show-captions"
                  checked={draft.showCaptions}
                  onCheckedChange={(showCaptions) =>
                    onChange(patchCommon(draft, { showCaptions }))
                  }
                  label="Show the captions"
                />
              ) : null}
            </InspectorCard>
          </div>
        </InspectorCollapseAllProvider>
      </ScrollArea>
    </div>
  )
}
