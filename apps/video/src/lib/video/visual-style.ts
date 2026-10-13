/**
 * A project's look: one written style and, if wanted, one reference picture,
 * both kept on the project row and set in Project settings. Every AI picture
 * or clip made for the project starts from them (see
 * workspace/docs/visual-style.md).
 */

export const MAX_STYLE_LENGTH = 500

export const LOOK_PICTURE_NOT_AN_IMAGE_MESSAGE =
  "Pick a picture from your Media library for the look."

/**
 * The prompt an AI request is sent with when a project's look applies. The
 * style line goes first, because the models weigh the opening of a prompt
 * most and because a person reading a logged prompt should see the look
 * before the scene. A look picture is always the last reference sent, so the
 * prompt can point at it by position. With no look the prompt is unchanged.
 */
export function styledPrompt(
  look: { style?: string | null; hasPicture?: boolean },
  prompt: string
) {
  const style = look.style?.trim()
  const lines: string[] = []
  if (style) lines.push(`Style: ${style}`)
  if (look.hasPicture) {
    lines.push(
      "Copy the look of the last picture supplied: its colours, lighting and drawing style, not what is in it."
    )
  }
  return [...lines, prompt].join("\n\n")
}

/**
 * One picture request with a project's look laid over it: the style line
 * first in the prompt and the look picture after every other reference. With
 * no look it is the request as it was.
 */
export function withLook<Picture>(
  look: { style: string | null; picture: Picture | null },
  prompt: string,
  references: Picture[]
) {
  return {
    prompt: styledPrompt(
      { style: look.style, hasPicture: look.picture !== null },
      prompt
    ),
    references: look.picture ? [...references, look.picture] : references,
  }
}
