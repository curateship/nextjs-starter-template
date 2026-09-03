import { createServerFn } from "@tanstack/react-start"
import { requireCurrentWorkspace, parseWorkspaceSettings } from "@/server/people/workspaces"
import { eq } from "drizzle-orm"
import { z } from "zod"

import { appPublicTheme } from "@/lib/app-options"
import {
  DASHBOARD_ROWS_PER_PAGE_OPTIONS,
  SHELL_ROLES,
  TOP_LEFT_NAV_LIMIT_OPTIONS,
  type ShellConfig,
} from "@/lib/custom-shell"
import {
  MAX_PUBLIC_SYSTEM_BODY_LENGTH,
  MAX_PUBLIC_SYSTEM_HEADING_LENGTH,
  MAX_SOCIAL_HANDLE_LENGTH,
  SOCIAL_CARD_TYPES,
} from "@/lib/pages/public-metadata"
import { normalizeDashboardWidgets } from "@/lib/dashboard/dashboard-widgets"
import type {
  PublicFaviconSet,
  PublicFaviconVariant,
} from "@/lib/favicon"
import type { PublicFontAsset } from "@/lib/public-font"
import {
  FRONT_PAGE_ROW_KINDS,
  FRONT_PAGE_ROW_LAYOUTS,
  MAX_FRONT_PAGE_ROW_HEADING_LENGTH,
  MAX_FRONT_PAGE_ROW_ID_LENGTH,
  MAX_FRONT_PAGE_ROW_INTRO_LENGTH,
  MAX_FRONT_PAGE_ROWS,
  normalizeFrontPageRows,
} from "@/lib/pages/front-page"
import {
  cleanPublicFooterCopyright,
  cleanPublicNavigationLinks,
  MAX_PUBLIC_FOOTER_COPYRIGHT_LENGTH,
  MAX_PUBLIC_NAVIGATION_HREF_LENGTH,
  MAX_PUBLIC_NAVIGATION_LABEL_LENGTH,
  MAX_PUBLIC_NAVIGATION_LINKS,
} from "@/lib/pages/public-navigation"
import { NOTIFICATION_TYPES } from "@/lib/notification-types"
import {
  MAX_PUBLIC_BACKGROUND_PATTERN_OPACITY,
  MAX_PUBLIC_MAIN_SPACING,
  MAX_PUBLIC_PAGE_WIDTH,
  MAX_PUBLIC_RADIUS,
  MIN_PUBLIC_PAGE_WIDTH,
  PUBLIC_BACKGROUND_PATTERNS,
  PUBLIC_BACKGROUND_PATTERN_SIZES,
  PUBLIC_BRAND_COLOR_PATTERN,
  PUBLIC_BRAND_OVERRIDE_KEYS,
  PUBLIC_BUTTON_CASINGS,
  PUBLIC_BUTTON_STYLES,
  PUBLIC_COLOR_SCHEMES,
  PUBLIC_CONTENT_ALIGNMENTS,
  PUBLIC_THEME_FONTS,
  normalizePublicBrandTheme,
  publicThemeForAppWideSave,
  publicThemeOverrides,
} from "@/lib/public-theme"
import { MAX_SIDEBAR_WIDTH, MIN_SIDEBAR_WIDTH } from "@/lib/layout/sidebar-width"
import { MAX_TOAST_SECONDS, MIN_TOAST_SECONDS } from "@/lib/toast/toast-seconds"
import { db } from "@/server/db"
import {
  dropWorkspaceCache,
  workspaceBaseDomain,
} from "@/server/workspaces/host"
import {
  findOwnedImageByUrl,
  isOwnedImageUrl,
} from "@/server/media/library"
import {
  createFaviconVariant,
  deleteReplacedFaviconFiles,
} from "@/server/media/favicon"
import {
  customShellSettings,
  customShellWorkspaces,
  DEFAULT_SETTINGS_KEY,
} from "@/server/schema"
import {
  parseShellGlobals,
  pickShellGlobals,
  readShellGlobals,
} from "@/server/shell-settings"
import { adminPost, userPost } from "@/server/guards"
import { now } from "@/server/auth/security"

const shellIconSchema = z.string().trim().min(1).max(2048)
const faviconSourceSchema = z.string().trim().max(2048)
const publicFontAssetSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    version: z.string().uuid(),
  })
  .nullable()

const shellRolesSchema = z.array(z.enum(SHELL_ROLES)).optional()

const shellChildItemSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  href: z.string(),
  icon: shellIconSchema.optional(),
  visible: z.boolean().optional(),
  roles: shellRolesSchema,
})

const shellEntrySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("item"),
    id: z.string().min(1),
    label: z.string(),
    href: z.string(),
    icon: shellIconSchema,
    visible: z.boolean(),
    roles: shellRolesSchema,
    children: z.array(shellChildItemSchema).optional(),
  }),
  z.object({
    type: z.literal("divider"),
    id: z.string().min(1),
    label: z.string(),
  }),
])

/** Both sidebars are the same shape — the admin's own, and the members'. */
const shellSectionSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  entries: z.array(shellEntrySchema),
})

/**
 * Both header rows are the same shape — the admin's own, and the members'. The
 * client normalizes what it reads (normalizeTopRightNavigation), so a save only
 * ever carries the two-way union, never the old `{ id, visible }` rows.
 */
const shellTopRightItemSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("builtIn"),
    id: z.enum(["feedback", "theme", "notifications"]),
    visible: z.boolean(),
  }),
  z.object({
    type: z.literal("app"),
    id: z.string().trim().min(1).max(64),
    visible: z.boolean(),
  }),
  z.object({
    type: z.literal("link"),
    id: z.string().min(1),
    label: z.string(),
    href: z.string(),
    icon: shellIconSchema,
  }),
])

const shellBackgroundSchema = z.object({
  mode: z.enum(["default", "muted", "custom"]),
  strength: z.number().int().min(0).max(100),
  color: z.string(),
})

const shellModalStylingSchema = z.object({
  background: shellBackgroundSchema,
  borderWidth: z.number().int().min(0).max(3),
  borderColor: shellBackgroundSchema,
  padding: z.number().int().min(0).max(48),
  overlayOpacity: z.number().int().min(0).max(100),
  cardBackground: shellBackgroundSchema,
  cardBorderWidth: z.number().int().min(0).max(3),
  cardBorderColor: shellBackgroundSchema,
})

const shellStylingSchema = z.object({
  gutter: z.number().int().min(0).max(48),
  cardBorderWidth: z.number().int().min(0).max(3),
  cardBorderColor: shellBackgroundSchema,
  dividerColor: shellBackgroundSchema,
  content: shellBackgroundSchema,
  chrome: shellBackgroundSchema,
  modal: shellModalStylingSchema,
})

const publicNavigationLinkSchema = z.object({
  label: z.string().max(MAX_PUBLIC_NAVIGATION_LABEL_LENGTH),
  href: z.string().max(MAX_PUBLIC_NAVIGATION_HREF_LENGTH),
})

const publicNavigationSchema = z
  .array(publicNavigationLinkSchema)
  .max(MAX_PUBLIC_NAVIGATION_LINKS)
  .transform(cleanPublicNavigationLinks)

const publicBrandOverridesSchema = z.object(
  Object.fromEntries(
    PUBLIC_BRAND_OVERRIDE_KEYS.map((key) => [
      key,
      z.string().regex(PUBLIC_BRAND_COLOR_PATTERN).optional(),
    ])
  ) as Record<
    (typeof PUBLIC_BRAND_OVERRIDE_KEYS)[number],
    z.ZodOptional<z.ZodString>
  >
)

const publicThemeSchema = z.object({
  brandColor: z.union([
    z.literal(""),
    z.string().regex(PUBLIC_BRAND_COLOR_PATTERN),
  ]),
  brandOverrides: publicBrandOverridesSchema,
  canvasColor: z.union([
    z.literal(""),
    z.string().regex(PUBLIC_BRAND_COLOR_PATTERN),
  ]),
  pageWidth: z
    .number()
    .int()
    .min(MIN_PUBLIC_PAGE_WIDTH)
    .max(MAX_PUBLIC_PAGE_WIDTH),
  mainSpacing: z.number().int().min(0).max(MAX_PUBLIC_MAIN_SPACING),
  contentAlignment: z.enum(PUBLIC_CONTENT_ALIGNMENTS),
  backgroundPattern: z.enum(PUBLIC_BACKGROUND_PATTERNS),
  backgroundPatternSize: z.enum(PUBLIC_BACKGROUND_PATTERN_SIZES),
  backgroundPatternOpacity: z
    .number()
    .int()
    .min(0)
    .max(MAX_PUBLIC_BACKGROUND_PATTERN_OPACITY),
  buttonStyle: z.enum(PUBLIC_BUTTON_STYLES),
  buttonCasing: z.enum(PUBLIC_BUTTON_CASINGS),
  headerBorder: z.boolean(),
  footerBorder: z.boolean(),
  colorScheme: z.enum(PUBLIC_COLOR_SCHEMES),
  useCustomFont: z.boolean(),
  font: z.enum(PUBLIC_THEME_FONTS),
  radius: z.number().int().min(0).max(MAX_PUBLIC_RADIUS),
})

const frontPageRowsSchema = z
  .array(
    z.object({
      id: z.string().max(MAX_FRONT_PAGE_ROW_ID_LENGTH),
      heading: z.string().max(MAX_FRONT_PAGE_ROW_HEADING_LENGTH),
      intro: z.string().max(MAX_FRONT_PAGE_ROW_INTRO_LENGTH),
      kind: z.enum(FRONT_PAGE_ROW_KINDS),
      layout: z.enum(FRONT_PAGE_ROW_LAYOUTS),
    })
  )
  .max(MAX_FRONT_PAGE_ROWS)
  .transform(normalizeFrontPageRows)

/**
 * Each slot as written, checked for shape only: `normalizeDashboardWidgets` in
 * the handler is what decides which ids survive, and it drops anything no
 * widget answers to along with any widget placed twice.
 *
 * Deliberately not an enum of today's widget ids. A tab left open from before a
 * widget was retired would then fail this whole request — taking every other
 * settings edit on the page down with it — where dropping the dead id quietly
 * is both safer and what the row ends up holding either way. The lengths are
 * capped because this is the only door into that row.
 */
const widgetSlotSchema = z.array(z.string().max(64)).max(50)

const dashboardWidgetsSchema = z.object({
  top: widgetSlotSchema,
  left: widgetSlotSchema,
  right: widgetSlotSchema,
})

const shellConfigSchema = z.object({
  appName: z.string(),
  workspaceName: z.string(),
  dashboardRowsPerPage: z.number().int().refine((value) =>
    DASHBOARD_ROWS_PER_PAGE_OPTIONS.includes(
      value as (typeof DASHBOARD_ROWS_PER_PAGE_OPTIONS)[number]
    )
  ),
  toastSeconds: z
    .number()
    .int()
    .min(MIN_TOAST_SECONDS)
    .max(MAX_TOAST_SECONDS),
  topLeftNavLimit: z.number().int().refine((value) =>
    TOP_LEFT_NAV_LIMIT_OPTIONS.includes(
      value as (typeof TOP_LEFT_NAV_LIMIT_OPTIONS)[number]
    )
  ),
  // Per-workspace sidebar width. Always populated with a valid value by the
  // loader (workspace settings default it), so a plain required field is fine.
  sidebarWidth: z.number().int().min(MIN_SIDEBAR_WIDTH).max(MAX_SIDEBAR_WIDTH),
  adminRoute: z.string().catch(""),
  memberHomeRoute: z.string().catch(""),
  favicon: faviconSourceSchema,
  faviconDark: faviconSourceSchema,
  logo: z.string(),
  logoDark: z.string(),
  shareImage: z.string().trim().max(2048),
  // Carried by the client for the full config shape. The handler always takes
  // the saved version or writes a fresh timestamp instead of trusting this.
  shareImageVersion: z.string().max(64),
  socialCardType: z.enum(SOCIAL_CARD_TYPES),
  socialHandle: z
    .string()
    .max(MAX_SOCIAL_HANDLE_LENGTH)
    .regex(/^[A-Za-z0-9_]*$/),
  publicSystemCopy: z.object({
    notFoundHeading: z.string().max(MAX_PUBLIC_SYSTEM_HEADING_LENGTH),
    notFoundBody: z.string().max(MAX_PUBLIC_SYSTEM_BODY_LENGTH),
    maintenanceHeading: z.string().max(MAX_PUBLIC_SYSTEM_HEADING_LENGTH),
    maintenanceBody: z.string().max(MAX_PUBLIC_SYSTEM_BODY_LENGTH),
  }),
  frontPageRows: frontPageRowsSchema,
  publicNavigation: publicNavigationSchema,
  publicFooter: publicNavigationSchema,
  publicFooterCopyright: z
    .string()
    .max(MAX_PUBLIC_FOOTER_COPYRIGHT_LENGTH)
    .transform(cleanPublicFooterCopyright),
  publicFont: publicFontAssetSchema,
  publicTheme: publicThemeSchema,
  topRightNavigation: z.array(shellTopRightItemSchema),
  memberTopRightNavigation: z.array(shellTopRightItemSchema),
  sections: z.array(shellSectionSchema),
  memberSections: z.array(shellSectionSchema),
  liveNotifications: z.boolean(),
  notificationTypes: z.object(
    Object.fromEntries(
      NOTIFICATION_TYPES.map((type) => [type, z.boolean()])
    ) as Record<(typeof NOTIFICATION_TYPES)[number], z.ZodBoolean>
  ),
  maintenance: z.object({
    enabled: z.boolean(),
  }),
  // Carried in the config for display only; the save below never writes it.
  sessionPolicy: z.object({
    maxAgeDays: z.number().int().min(0),
    idleMinutes: z.number().int().min(0),
  }),
  styling: shellStylingSchema,
  dashboardWidgets: dashboardWidgetsSchema,
})

export function getShellSettingsErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Shell settings request failed."
}

const saveShellSettingsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(shellConfigSchema)
  .handler(async ({ data, context }) => {
    const updatedAt = now()
    const workspace = await requireCurrentWorkspace(context.user.id)
    const workspaceSettings = parseWorkspaceSettings(workspace.settings)
    const workspaceName = data.workspaceName.trim()
    if (!workspaceName) {
      throw new Error("Workspace name is required")
    }

    let previousFaviconSet: PublicFaviconSet | null = null
    let savedFaviconSet: PublicFaviconSet | null = null
    let savedPublicFont: PublicFontAsset | null = null
    const generatedFaviconSet: PublicFaviconSet = {}
    const startingGlobals = await readShellGlobals()

    try {
      generatedFaviconSet.light = await generateFaviconVariantForSave({
        source: data.favicon,
        saved: startingGlobals.faviconSet?.light,
        mode: "light",
        userId: context.user.id,
      })
      generatedFaviconSet.dark = await generateFaviconVariantForSave({
        source: data.faviconDark,
        saved: startingGlobals.faviconSet?.dark,
        mode: "dark",
        userId: context.user.id,
      })
    } catch (error) {
      await deleteReplacedFaviconFiles(generatedFaviconSet, null).catch(
        () => undefined
      )
      throw error
    }

    await db.transaction(async (tx) => {
      await tx
        .update(customShellWorkspaces)
        .set({
          name: workspaceName.slice(0, 255),
          settings: {
            ...workspaceSettings,
            sidebarWidth: data.sidebarWidth,
            publicTheme: normalizePublicBrandTheme(data.publicTheme),
            publicNavigation: data.publicNavigation,
            publicFooter: data.publicFooter,
            publicFooterCopyright: data.publicFooterCopyright,
            topRightNavigation: data.topRightNavigation,
            sections: data.sections,
            styling: data.styling,
            dashboardWidgets: normalizeDashboardWidgets(data.dashboardWidgets),
          },
          updatedAt,
        })
        // Admin-only endpoint, and an admin may edit any workspace — including
        // one another admin made, which is the whole point of them being shared.
        .where(eq(customShellWorkspaces.id, workspace.id))

      const [existing] = await tx
        .select({
          key: customShellSettings.key,
          settings: customShellSettings.settings,
        })
        .from(customShellSettings)
        .where(eq(customShellSettings.key, DEFAULT_SETTINGS_KEY))
        .limit(1)
        // Locked because the maintenance switch writes this same row (see
        // server/maintenance.ts); without it the two saves could each write
        // back what they read and one would lose its changes.
        .for("update")

      // The maintenance switch is only ever flipped by its own confirmed
      // action (lib/api/maintenance.ts). An admin whose settings page loaded
      // before somebody turned it on must not switch it back off by renaming
      // the app, so the switch keeps whatever the row already says. The
      // session policy and the automations kill switch are kept whole for the
      // same reason — their one writer each is lib/api/auth/session-policy.ts
      // and lib/api/automations/automation-pause.ts.
      const existingGlobals = parseShellGlobals(existing?.settings)
      previousFaviconSet = existingGlobals.faviconSet
      savedPublicFont = existingGlobals.publicFont

      // The logos are drawn on the signed-out pages, so what gets stored has to
      // be a picture somebody here really uploaded — not any address a browser
      // felt like sending. Only a changed logo is checked: the settings page
      // saves the whole config, so a second admin renaming the app must not be
      // refused because the picture was uploaded from another account.
      for (const [next, saved] of [
        [data.logo, existingGlobals.logo],
        [data.logoDark, existingGlobals.logoDark],
      ]) {
        if (
          next &&
          next !== saved &&
          !(await isOwnedImageUrl(context.user.id, next, tx))
        ) {
          throw new Error(
            "That logo is no longer in your media library. Pick another one."
          )
        }
      }

      if (
        data.shareImage &&
        data.shareImage !== existingGlobals.shareImage &&
        !(await isOwnedImageUrl(context.user.id, data.shareImage, tx))
      ) {
        throw new Error(
          "That share image is no longer in your media library. Pick another one."
        )
      }

      const light = faviconVariantForLockedSave(
        data.favicon,
        existingGlobals.faviconSet?.light,
        generatedFaviconSet.light
      )
      const dark = faviconVariantForLockedSave(
        data.faviconDark,
        existingGlobals.faviconSet?.dark,
        generatedFaviconSet.dark
      )
      savedFaviconSet = light || dark
        ? {
            ...(light ? { light } : {}),
            ...(dark ? { dark } : {}),
          }
        : null

      const nextPublicTheme = publicThemeForAppWideSave(
        data.publicTheme,
        existingGlobals.publicTheme,
        Boolean(workspaceBaseDomain())
      )
      const globalSettings = {
        // The kill switch is not in this request's shape at all, on purpose:
        // the settings page never sends it, so there is no version of this
        // save — not even from a tab left open across a deploy — that can
        // start every automation running again.
        ...pickShellGlobals({
          ...data,
          faviconSet: savedFaviconSet,
          // A dedicated upload action owns the stored font. A stale settings
          // tab may choose whether to use it, but cannot replace its identity.
          publicFont: existingGlobals.publicFont,
          shareImageVersion:
            data.shareImage === existingGlobals.shareImage
              ? existingGlobals.shareImageVersion
              : data.shareImage
                ? updatedAt.toISOString()
                : "",
          publicTheme: nextPublicTheme,
          automationPause: existingGlobals.automationPause,
        }),
        publicTheme: publicThemeOverrides(nextPublicTheme, appPublicTheme()),
        maintenance: {
          enabled: existingGlobals.maintenance.enabled,
        },
        sessionPolicy: existingGlobals.sessionPolicy,
      }

      if (existing) {
        await tx
          .update(customShellSettings)
          .set({ settings: globalSettings, updatedAt })
          .where(eq(customShellSettings.key, DEFAULT_SETTINGS_KEY))
      } else {
        await tx.insert(customShellSettings).values({
          key: DEFAULT_SETTINGS_KEY,
          settings: globalSettings,
          createdAt: updatedAt,
          updatedAt,
        })
      }
    }).catch(async (error) => {
      await deleteReplacedFaviconFiles(generatedFaviconSet, null).catch(
        () => undefined
      )
      throw error
    })

    await deleteReplacedFaviconFiles(
      previousFaviconSet,
      savedFaviconSet
    ).catch((error) => {
      console.error("Replaced favicon files could not be removed", error)
    })
    await deleteReplacedFaviconFiles(
      generatedFaviconSet,
      savedFaviconSet
    ).catch((error) => {
      console.error("Unused favicon files could not be removed", error)
    })

    // The public pages, the feed and the sitemap all read a site's name and
    // navigation out of the host cache, which has no expiry — so without this
    // a rename saved here would not reach a signed-out visitor until the
    // server restarted. After the commit, never before: a failed write must
    // not throw away a cache that still matches the database.
    dropWorkspaceCache()

    return { faviconSet: savedFaviconSet, publicFont: savedPublicFont }
  })

export function saveShellSettings(settings: ShellConfig) {
  return saveShellSettingsFn({ data: settings })
}

async function generateFaviconVariantForSave({
  source,
  saved,
  mode,
  userId,
}: {
  source: string
  saved: PublicFaviconVariant | undefined
  mode: "light" | "dark"
  userId: string
}): Promise<PublicFaviconVariant | undefined> {
  if (!source || saved?.source === source) return undefined

  const media = await findOwnedImageByUrl(userId, source)
  if (!media) {
    throw new Error(
      "That favicon is no longer in your media library. Pick another one."
    )
  }

  try {
    return await createFaviconVariant(media, mode)
  } catch {
    throw new Error(
      "The favicon sizes could not be created. Try another image."
    )
  }
}

function faviconVariantForLockedSave(
  source: string,
  saved: PublicFaviconVariant | undefined,
  generated: PublicFaviconVariant | undefined
) {
  if (!source) return undefined
  if (saved?.source === source) return saved
  if (generated?.source === source) return generated

  throw new Error(
    "The favicon changed while these settings were saving. Try again."
  )
}

// Lightweight, per-user save for the draggable sidebar width. Unlike the full
// shell save this is not admin-gated — any signed-in user can persist their own
// workspace's sidebar width by dragging the rail.
//
// No `dropWorkspaceCache()` here, on purpose. This writes the same `settings`
// column the save above does, but the only thing the host cache serves out of
// it is what a signed-out visitor sees — the site's name, its public menu and
// its footer. Nothing reads `sidebarWidth` through the cache, and dropping it
// on every drag of the rail would rebuild it dozens of times a minute for no
// visible difference.
const saveSidebarWidthFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      sidebarWidth: z
        .number()
        .int()
        .min(MIN_SIDEBAR_WIDTH)
        .max(MAX_SIDEBAR_WIDTH),
    })
  )
  .handler(async ({ data, context }) => {
    const workspace = await requireCurrentWorkspace(context.user.id)
    const settings = parseWorkspaceSettings(workspace.settings)

    const [updated] = await db
      .update(customShellWorkspaces)
      .set({
        settings: { ...settings, sidebarWidth: data.sidebarWidth },
        updatedAt: now(),
      })
      // Admin-only endpoint, and an admin may edit any workspace.
      .where(eq(customShellWorkspaces.id, workspace.id))
      .returning({ id: customShellWorkspaces.id })

    if (!updated) {
      throw new Error("Workspace not found")
    }

    return data
  })

export function saveSidebarWidth(sidebarWidth: number) {
  return saveSidebarWidthFn({ data: { sidebarWidth } })
}
