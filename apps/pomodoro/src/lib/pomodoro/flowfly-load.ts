import {
  loadPomodoroReportsPage,
  loadPomodoroRoomRepeatsPage,
  loadPomodoroRoomsPage,
  loadPomodoroSessionsPage,
  loadPomodoroTaskRepeatsPage,
  loadPomodoroTasksPage,
} from "@/lib/api/pomodoro/admin"
import { loadPomodoroAchievementsPage } from "@/lib/api/pomodoro/admin-achievements"
import { loadCatalogPage } from "@/lib/api/pomodoro/admin-catalog"
import { loadPomodoroProfilesPage } from "@/lib/api/pomodoro/admin-profiles"
import { loadPomodoroProjectsPage } from "@/lib/api/pomodoro/admin-projects"
import { listPomodoroRoomPresets, loadPomodoroInvitesPage } from "@/lib/api/pomodoro/admin-rooms"
import { loadPomodoroSafetyPage } from "@/lib/api/pomodoro/admin-safety"
import { loadSimulatedWatchPage } from "@/lib/api/pomodoro/admin-simulated"
import { loadPomodoroBlocksPage, loadPomodoroFollowsPage, loadPomodoroGroupsPage } from "@/lib/api/pomodoro/admin-social"
import {
  loadPomodoroGenerationsPage,
  loadPomodoroTagsPage,
  loadPomodoroUploadsPage,
} from "@/lib/api/pomodoro/admin-uploads-tags"
import { loadPomodoroSettings } from "@/lib/api/pomodoro/app-settings"
import type { FlowflySearch, FlowflyTab } from "@/lib/pomodoro/flowfly-search"

/**
 * The first page of the tab showing, read the way that list's own page read
 * it before it moved into the Flowfly dashboard, with the same defaults. Only
 * the tab showing is read; each list asks again in place after that.
 */
export async function loadFlowflyTab(tab: FlowflyTab, search: FlowflySearch) {
  // The address was checked by `readFlowflySearch` against this tab's own lists.
  const s = search as Record<string, never>
  const q = (search.q as string | undefined) ?? ""
  const direction = search.direction
  const page = search.page ?? 1
  switch (tab) {
    case "rooms":
      return { tab, data: await loadPomodoroRoomsPage({ search: q, phase: s.phase ?? "all", visibility: s.visibility ?? "all", sort: s.sort ?? "created", direction: direction ?? "desc", page }) }
    case "weekly":
      return { tab, data: await loadPomodoroRoomRepeatsPage({ search: q, status: s.status ?? "all", sort: s.sort ?? "created", direction: direction ?? "desc", page }) }
    case "invites":
      return { tab, data: await loadPomodoroInvitesPage({ search: q, status: s.status ?? "all", sort: s.sort ?? "created", direction: direction ?? "desc", page }) }
    case "presets": {
      const [presets, { catalog }] = await Promise.all([listPomodoroRoomPresets(), loadPomodoroSettings()])
      return { tab, data: { presets, catalog } }
    }
    case "profiles":
      return { tab, data: await loadPomodoroProfilesPage({ search: q, visibility: s.visibility ?? "all", sort: s.sort ?? "updated", direction: direction ?? "desc", page }) }
    case "badges":
      return { tab, data: await loadPomodoroAchievementsPage({ search: q, badgeId: s.badge, userId: s.user, sort: s.sort ?? "earned", direction: direction ?? "desc", page }) }
    case "madeup":
      return {
        tab,
        data: await loadSimulatedWatchPage({ tab: s.tab ?? "today", search: q, sort: s.sort ?? "hours", direction: direction ?? "desc", page, linesPage: (s.lines as number | undefined) ?? 1 }),
      }
    case "reports":
      return { tab, data: await loadPomodoroReportsPage({ search: q, status: s.status ?? "all", sort: s.sort ?? "created", direction: direction ?? "desc", page, person: s.person }) }
    case "bans":
      return { tab, data: await loadPomodoroSafetyPage({ tab: s.tab ?? "bans", search: q, page }) }
    case "blocks":
      return { tab, data: await loadPomodoroBlocksPage({ tab: s.tab ?? "blocks", search: q, user: s.user, page }) }
    case "groups":
      return { tab, data: await loadPomodoroGroupsPage({ search: q, user: s.user, sort: s.sort ?? "created", direction: direction ?? "desc", page }) }
    case "follows":
    case "cheers":
      return {
        tab,
        data: await loadPomodoroFollowsPage({ tab: tab === "cheers" ? "cheers" : "follows", search: q, user: s.user, sort: s.sort ?? "created", direction: direction ?? "desc", page }),
      }
    case "tasks":
      return { tab, data: await loadPomodoroTasksPage({ search: q, status: s.status ?? "all", userId: s.user ?? null, sort: s.sort ?? "created", direction: direction ?? "desc", page }) }
    case "sessions":
      return {
        tab,
        data: await loadPomodoroSessionsPage({ search: q, mode: s.mode ?? "all", status: s.status ?? "all", userId: s.user ?? null, sort: s.sort ?? "started", direction: direction ?? "desc", page }),
      }
    case "repeats":
      return { tab, data: await loadPomodoroTaskRepeatsPage({ search: q, userId: s.user ?? null, sort: s.sort ?? "created", direction: direction ?? "desc", page }) }
    case "projects":
      return {
        tab,
        data: await loadPomodoroProjectsPage({
          search: q,
          user: s.user,
          state: s.state ?? "all",
          visibility: s.visibility ?? "all",
          target: s.target ?? "all",
          sort: s.sort ?? "created",
          direction: direction ?? "desc",
          page,
        }),
      }
    case "tags":
      return { tab, data: await loadPomodoroTagsPage({ search: q, user: s.user, sort: s.sort ?? "tasks", direction: direction ?? "desc", page }) }
    case "backgrounds":
    case "sounds":
      return {
        tab,
        data: await loadCatalogPage({
          kind: tab === "sounds" ? "sound" : "theme",
          search: q,
          status: s.status ?? "all",
          access: s.access ?? "all",
          tag: s.tag ?? null,
          sort: s.sort ?? "position",
          direction: direction ?? "asc",
          page,
        }),
      }
    case "uploads":
      return {
        tab,
        data: await loadPomodoroUploadsPage({ search: q, purpose: s.purpose ?? "all", user: s.user, sharing: s.sharing ?? "all", sort: s.sort ?? "created", direction: direction ?? "desc", page }),
      }
    case "generations":
      return {
        tab,
        data: await loadPomodoroGenerationsPage({ search: q, kind: s.kind ?? "all", status: s.status ?? "all", user: s.user, sort: s.sort ?? "created", direction: direction ?? "desc", page }),
      }
  }
}

export type FlowflyTabData = Awaited<ReturnType<typeof loadFlowflyTab>>
