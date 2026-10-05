import { z } from "zod"

import {
  APP_FRONT_PAGE_ROW_KIND,
  DEFAULT_FRONT_PAGE_DIVIDER_SHADE,
  DEFAULT_FRONT_PAGE_DIVIDER_SPACE,
  FRONT_PAGE_DIVIDER_STYLES,
  FRONT_PAGE_HERO_ACTIONS,
  FRONT_PAGE_HERO_BACKGROUND_MESSAGE,
  FRONT_PAGE_ROW_ALIGNMENTS,
  FRONT_PAGE_ROW_LAYOUTS,
  MAX_APP_FRONT_PAGE_ROW_KEY_LENGTH,
  MAX_APP_FRONT_PAGE_ROW_SETTINGS_LENGTH,
  MAX_FRONT_PAGE_DIVIDER_SHADE,
  MAX_FRONT_PAGE_DIVIDER_SPACE,
  MAX_FRONT_PAGE_FAQ_ANSWER_LENGTH,
  MAX_FRONT_PAGE_FAQ_ITEMS,
  MAX_FRONT_PAGE_FAQ_QUESTION_LENGTH,
  MAX_FRONT_PAGE_HERO_BACKGROUND_LENGTH,
  MAX_FRONT_PAGE_HERO_BUTTON_HREF_LENGTH,
  MAX_FRONT_PAGE_HERO_BUTTON_LABEL_LENGTH,
  MAX_FRONT_PAGE_HERO_NOTE_LENGTH,
  MAX_FRONT_PAGE_HERO_SPACING,
  MAX_FRONT_PAGE_HERO_STARS,
  MAX_FRONT_PAGE_IMAGE_ALT_LENGTH,
  MAX_FRONT_PAGE_IMAGE_URL_LENGTH,
  MAX_FRONT_PAGE_ITEM_NAME_LENGTH,
  MAX_FRONT_PAGE_ITEM_ROLE_LENGTH,
  MAX_FRONT_PAGE_LOGOS,
  MAX_FRONT_PAGE_ROW_HEADING_LENGTH,
  MAX_FRONT_PAGE_ROW_ID_LENGTH,
  MAX_FRONT_PAGE_ROW_INTRO_LENGTH,
  MAX_FRONT_PAGE_SCREENSHOT_CAPTION_LENGTH,
  MAX_FRONT_PAGE_SCREENSHOTS,
  MAX_FRONT_PAGE_TESTIMONIAL_QUOTE_LENGTH,
  MAX_FRONT_PAGE_TESTIMONIALS,
  normalizeFrontPageHeroBackground,
  normalizeFrontPageHeroHref,
  normalizeFrontPageImageUrl,
} from "@/lib/pages/front-page"
import { PUBLIC_DEVICES } from "@/lib/pages/public-device"

/**
 * What one block of a public page may hold, as it arrives from a browser.
 *
 * It lived inside the settings schema until 4 Oct 2026, wrapped in an array,
 * because the blocks were a settings field. They are rows of their own now and
 * they are saved one at a time, so the shape a save checks is one block.
 *
 * **Every new field a block gains belongs here as well as on the type.** A
 * field this file does not name is dropped between the editor and the
 * database, which looks exactly like a save that worked and wrote the old
 * value.
 */
const frontPageRowBaseShape = {
  id: z.string().max(MAX_FRONT_PAGE_ROW_ID_LENGTH),
  heading: z.string().max(MAX_FRONT_PAGE_ROW_HEADING_LENGTH),
  intro: z.string().max(MAX_FRONT_PAGE_ROW_INTRO_LENGTH),
  layout: z.enum(FRONT_PAGE_ROW_LAYOUTS),
  // Defaulted so a settings tab opened before these existed still saves, and
  // saves the row as it already looked.
  alignment: z.enum(FRONT_PAGE_ROW_ALIGNMENTS).default("inherit"),
  hidden: z.boolean(),
  showHeading: z.boolean().default(true),
  showIntro: z.boolean().default(true),
  showImage: z.boolean().default(true),
  showAction: z.boolean().default(true),
  showStars: z.boolean().default(true),
  showNote: z.boolean().default(true),
  showPictures: z.boolean().default(true),
  showRoles: z.boolean().default(true),
  showNumbers: z.boolean().default(true),
  showCaptions: z.boolean().default(true),
  device: z.enum(PUBLIC_DEVICES),
}

const frontPageItemIdSchema = z.string().max(MAX_FRONT_PAGE_ROW_ID_LENGTH)
const frontPageImageSchema = z
  .string()
  .trim()
  .max(MAX_FRONT_PAGE_IMAGE_URL_LENGTH)
  .refine(
    (value) => !value || normalizeFrontPageImageUrl(value) === value,
    "Choose an image from the media library."
  )

export const frontPageRowSchema = z.discriminatedUnion("kind", [
  z.object({
    ...frontPageRowBaseShape,
    kind: z.literal(APP_FRONT_PAGE_ROW_KIND),
    appKind: z
      .string()
      .max(MAX_APP_FRONT_PAGE_ROW_KEY_LENGTH)
      .regex(/^[a-z0-9][a-z0-9-]*$/),
    /**
     * The app's own fields, kept as they arrive. The shell does not know
     * what they mean, so it checks only that they are a plain object and
     * that they are small enough to travel inside every visitor's page.
     * Whatever reads them treats them as untrusted, the same as any other
     * stored value.
     */
    settings: z
      .record(z.string(), z.unknown())
      .refine(
        (value) =>
          JSON.stringify(value).length <=
          MAX_APP_FRONT_PAGE_ROW_SETTINGS_LENGTH,
        "That row holds too much to save."
      ),
  }),
  z.object({ ...frontPageRowBaseShape, kind: z.literal("text") }),
  z.object({
    ...frontPageRowBaseShape,
    kind: z.literal("words"),
    /**
     * Checked for shape only. `cleanWrittenPageBody` on the way into the
     * database is what decides which nodes survive, and it is the same
     * function the written page used, so an admin cannot widen what a page may
     * hold by sending a different tree.
     */
    body: z.record(z.string(), z.unknown()),
  }),
  z.object({
    ...frontPageRowBaseShape,
    kind: z.literal("divider"),
    // Defaulted for the same reason as the base's own switches: a settings
    // tab opened before this field existed still saves the row.
    dividerStyle: z.enum(FRONT_PAGE_DIVIDER_STYLES).default("line"),
    dividerShade: z
      .number()
      .int()
      .min(0)
      .max(MAX_FRONT_PAGE_DIVIDER_SHADE)
      .default(DEFAULT_FRONT_PAGE_DIVIDER_SHADE),
    dividerSpace: z
      .number()
      .int()
      .min(0)
      .max(MAX_FRONT_PAGE_DIVIDER_SPACE)
      .default(DEFAULT_FRONT_PAGE_DIVIDER_SPACE),
  }),
  z.object({ ...frontPageRowBaseShape, kind: z.literal("plans") }),
  z.object({
    ...frontPageRowBaseShape,
    kind: z.literal("hero"),
    action: z.enum(FRONT_PAGE_HERO_ACTIONS),
    image: frontPageImageSchema,
    alt: z.string().max(MAX_FRONT_PAGE_IMAGE_ALT_LENGTH),
    buttonLabel: z
      .string()
      .max(MAX_FRONT_PAGE_HERO_BUTTON_LABEL_LENGTH),
    buttonHref: z
      .string()
      .trim()
      .max(MAX_FRONT_PAGE_HERO_BUTTON_HREF_LENGTH)
      .refine(
        (value) => !value || normalizeFrontPageHeroHref(value) === value,
        "A button link starts with /, https://, mailto: or tel:."
      ),
    note: z.string().max(MAX_FRONT_PAGE_HERO_NOTE_LENGTH),
    stars: z.number().int().min(0).max(MAX_FRONT_PAGE_HERO_STARS),
    // A muted grey as `grey-<n>`, six hex digits, or nothing. A colour
    // that is none of those reaches the page as text inside a style,
    // which is a way to write CSS into every visitor's browser, so it is
    // refused here as well as dropped in `normalizeFrontPageRows`. The
    // slider's number is stored as the number and never as the CSS it
    // becomes.
    background: z
      .string()
      .trim()
      .max(MAX_FRONT_PAGE_HERO_BACKGROUND_LENGTH)
      .refine(
        (value) =>
          !value ||
          normalizeFrontPageHeroBackground(value) === value.toLowerCase(),
        FRONT_PAGE_HERO_BACKGROUND_MESSAGE
      ),
    backgroundUnderMenu: z.boolean(),
    spacing: z
      .number()
      .int()
      .min(0)
      .max(MAX_FRONT_PAGE_HERO_SPACING),
  }),
  z.object({
    ...frontPageRowBaseShape,
    kind: z.literal("testimonials"),
    items: z
      .array(
        z.object({
          id: frontPageItemIdSchema,
          quote: z.string().max(MAX_FRONT_PAGE_TESTIMONIAL_QUOTE_LENGTH),
          name: z.string().max(MAX_FRONT_PAGE_ITEM_NAME_LENGTH),
          role: z.string().max(MAX_FRONT_PAGE_ITEM_ROLE_LENGTH),
          picture: frontPageImageSchema,
        })
      )
      .max(MAX_FRONT_PAGE_TESTIMONIALS),
  }),
  z.object({
    ...frontPageRowBaseShape,
    kind: z.literal("faq"),
    items: z
      .array(
        z.object({
          id: frontPageItemIdSchema,
          question: z.string().max(MAX_FRONT_PAGE_FAQ_QUESTION_LENGTH),
          answer: z.string().max(MAX_FRONT_PAGE_FAQ_ANSWER_LENGTH),
        })
      )
      .max(MAX_FRONT_PAGE_FAQ_ITEMS),
  }),
  z.object({
    ...frontPageRowBaseShape,
    kind: z.literal("logos"),
    items: z
      .array(
        z.object({
          id: frontPageItemIdSchema,
          image: frontPageImageSchema,
          alt: z.string().max(MAX_FRONT_PAGE_IMAGE_ALT_LENGTH),
        })
      )
      .max(MAX_FRONT_PAGE_LOGOS),
  }),
  z.object({
    ...frontPageRowBaseShape,
    kind: z.literal("screenshots"),
    items: z
      .array(
        z.object({
          id: frontPageItemIdSchema,
          image: frontPageImageSchema,
          caption: z.string().max(MAX_FRONT_PAGE_SCREENSHOT_CAPTION_LENGTH),
        })
      )
      .max(MAX_FRONT_PAGE_SCREENSHOTS),
  }),
])
