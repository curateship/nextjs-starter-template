import { createFileRoute } from "@tanstack/react-router"

import {
  isPublicReadAuthorized,
  isValidWorkspaceId,
  listPublicDirectories,
} from "@/server/public-directories"

export const Route = createFileRoute(
  "/api/v1/public/workspaces/$workspaceId/directories"
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

        const url = new URL(request.url)
        const data = await listPublicDirectories({
          cursor: url.searchParams.get("cursor"),
          limit: url.searchParams.get("limit"),
          workspaceId: params.workspaceId,
        })

        return Response.json({ data })
      },
    },
  },
})
