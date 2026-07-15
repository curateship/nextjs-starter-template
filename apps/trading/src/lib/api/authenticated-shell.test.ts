import { describe, expect, it } from "vitest"

import { createWorkspaceListResponse } from "@/lib/api/authenticated-shell"
import type { WorkspaceItem } from "@/lib/api/workspaces"

describe("authenticated shell response", () => {
  it("keeps workspaces inside the list response expected by the shell", () => {
    const workspace = {
      id: "workspace-1",
      name: "Main",
      icon: "briefcaseBusiness",
      favicon: "",
      active: true,
      created_at: "2026-07-15T00:00:00.000Z",
      updated_at: "2026-07-15T00:00:00.000Z",
    } satisfies WorkspaceItem

    expect(createWorkspaceListResponse([workspace])).toEqual({
      workspaces: [workspace],
    })
  })
})
