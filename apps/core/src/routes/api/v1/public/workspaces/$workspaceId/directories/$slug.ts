import { createFileRoute } from "@tanstack/react-router"

import {
  getPublicDirectoryBySlug,
  isPublicReadAuthorized,
  isValidDirectorySlug,
  isValidWorkspaceId,
} from "@/server/public-directories"

export const Route = createFileRoute(
  "/api/v1/public/workspaces/$workspaceId/directories/$slug"
)({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        if (!isValidWorkspaceId(params.workspaceId)) {
          return Response.json({ detail: "Invalid workspace ID" }, { status: 400 })
        }

        if (!(await isPublicReadAuthorized(request, params.workspaceId))) {
          return Response.json({ detail: "Unauthorized" }, { status: 401 })
        }

        if (!isValidDirectorySlug(params.slug)) {
          return Response.json({ detail: "Invalid directory slug" }, { status: 400 })
        }

        const item = await getPublicDirectoryBySlug(
          params.workspaceId,
          params.slug
        )

        if (!item) {
          return Response.json({ detail: "Directory not found" }, { status: 404 })
        }

        return Response.json({ data: item })
      },
    },
  },
})
