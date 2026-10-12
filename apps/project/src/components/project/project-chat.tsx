import * as React from "react"
import { getRouteApi } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"

import { ChatThread } from "@/components/project/task-chat"
import type { Change } from "@/components/project/task-body"
import { Button } from "@/components/ui/button"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { loadProjectChatPage, type ChatMessage } from "@/lib/api/project/chat"
import type { ProjectPage } from "@/lib/api/project/projects"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { usePeopleRoom } from "@/lib/project/use-people-room"
import { useProjectLive } from "@/lib/project/use-project-live"

const authenticatedRoute = getRouteApi("/_authenticated")

type Loaded =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; messages: ChatMessage[]; earlier: boolean }

function cursorOf(message: ChatMessage | undefined) {
  return message ? { at: message.createdAt, id: message.id } : undefined
}

/**
 * The project's own chat, the Chat tab beside Board, List and Activity: talk
 * about the project as a whole, with the same @ tags, # links, reactions,
 * replies, files, editing and deleting as a task's chat. Only people who can
 * see the project read or write it, and a message tells the project's
 * members only when they're tagged or replied to. It is talk; the team's
 * announcement on the Team dashboard is the one pinned message to everyone.
 * See `workspace/docs/projects-and-tasks.md`, "The project's chat".
 */
export function ProjectChat({ page }: { page: ProjectPage }) {
  const me = authenticatedRoute.useLoaderData().user
  const projectId = page.project.id
  const [loaded, setLoaded] = React.useState<Loaded>({ state: "loading" })
  const [loadingEarlier, setLoadingEarlier] = React.useState(false)
  const [run] = useAsyncAction(getProjectErrorMessage)
  const room = usePeopleRoom()
  // The oldest message showing, so a refresh brings back every one from it on.
  const oldest = React.useRef<{ at: string; id: string } | undefined>(undefined)
  const people = React.useMemo(
    () => page.members.map((member) => ({ id: member.userId, name: member.name, avatarUrl: member.avatarUrl })),
    [page.members]
  )

  const reload = React.useCallback(async () => {
    try {
      const chat = await loadProjectChatPage(projectId, { from: oldest.current })
      oldest.current = cursorOf(chat.messages[0])
      setLoaded({ state: "ready", messages: chat.messages, earlier: chat.earlier })
    } catch (error) {
      setLoaded((current) =>
        current.state === "ready" ? current : { state: "error", message: getProjectErrorMessage(error) }
      )
    }
  }, [projectId])

  React.useEffect(() => {
    void reload()
  }, [reload])

  useProjectLive(projectId, (change) => change === "chat", () => void reload())

  const change: Change = async (work, successText) => {
    const ok = await run(work, successText)
    if (ok) await reload()
    return ok
  }

  async function showEarlier() {
    if (loaded.state !== "ready" || loadingEarlier) return
    const before = cursorOf(loaded.messages[0])
    setLoadingEarlier(true)
    await run(async () => {
      const chat = await loadProjectChatPage(projectId, { before })
      setLoaded((current) => {
        if (current.state !== "ready") return current
        const messages = [...chat.messages, ...current.messages]
        oldest.current = cursorOf(messages[0])
        return { state: "ready", messages, earlier: chat.earlier }
      })
    })
    setLoadingEarlier(false)
  }

  if (loaded.state === "loading") return <LoadingRow label="Loading the chat…" />
  if (loaded.state === "error") {
    return (
      <ErrorRow
        message={loaded.message}
        onRetry={() => {
          setLoaded({ state: "loading" })
          void reload()
        }}
      />
    )
  }
  return (
    <ChatThread
      chat={{ projectId }}
      messages={loaded.messages}
      people={people}
      myUserId={me.id}
      readOnly={page.project.archived}
      change={change}
      room={room}
      fileRoom={null}
      fill
      emptyText={
        page.project.archived
          ? "Nobody wrote in this project's chat."
          : "No messages yet. This chat is for the project as a whole; a task's own chat is inside the task. Type @ to tag someone, and they get a notice."
      }
      earlier={
        loaded.earlier ? (
          <div className="flex justify-center">
            <Button type="button" variant="outline" size="sm" disabled={loadingEarlier} onClick={() => void showEarlier()}>
              {loadingEarlier ? <Loader2Icon className="size-4 animate-spin" /> : null}
              Show earlier messages
            </Button>
          </div>
        ) : null
      }
    />
  )
}
