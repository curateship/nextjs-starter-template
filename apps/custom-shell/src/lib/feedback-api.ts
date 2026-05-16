const feedbackApiUrl = `${
  import.meta.env.VITE_CUSTOM_SHELL_API_URL ?? ""
}`.replace(/\/$/, "")

export type FeedbackType = "suggestion" | "bug_report" | "question" | "praise"

export type FeedbackItem = {
  id: string
  type: FeedbackType
  message: string
  author_name: string
  created_at: string
  updated_at: string
  vote_count: number
  has_voted: boolean
}

type FeedbackListResponse = {
  feedback: FeedbackItem[]
}

type FeedbackCreatePayload = {
  type: FeedbackType
  message: string
}

export function getFeedbackErrorMessage(error: unknown) {
  if (error instanceof TypeError && error.message === "Failed to fetch") {
    const apiTarget = feedbackApiUrl || "the same-origin custom-shell API"
    return `Could not reach ${apiTarget}. Run npm run dev:custom-shell.`
  }

  return error instanceof Error ? error.message : "Feedback request failed."
}

async function readFeedbackResponse<T>(response: Response) {
  if (!response.ok) {
    let detail = `Feedback request failed (${response.status}).`
    try {
      const data = (await response.json()) as { detail?: string }
      detail = data.detail ?? detail
    } catch {
      // Keep the status-based message.
    }
    throw new Error(detail)
  }

  return (await response.json()) as T
}

export async function listFeedback() {
  const response = await fetch(`${feedbackApiUrl}/api/v1/feedback`, {
    credentials: "include",
  })
  return readFeedbackResponse<FeedbackListResponse>(response)
}

export async function createFeedback(payload: FeedbackCreatePayload) {
  const response = await fetch(`${feedbackApiUrl}/api/v1/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  })

  return readFeedbackResponse<FeedbackItem>(response)
}

export async function toggleFeedbackVote(feedbackId: string) {
  const response = await fetch(
    `${feedbackApiUrl}/api/v1/feedback/${feedbackId}/vote`,
    {
      method: "POST",
      credentials: "include",
    }
  )

  return readFeedbackResponse<FeedbackItem>(response)
}
