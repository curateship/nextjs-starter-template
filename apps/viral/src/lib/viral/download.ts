/**
 * Download to computer (`workspace/docs/vault.md`, more-features task part
 * 5): the signed-in route sends Viral's kept copy as a file named after the
 * title (`src/routes/api/v1/viral/download/$source/$id.ts`). `video` is a
 * saved video's id, `idea` a vault idea's. A link with `download` saves the
 * file rather than opening it.
 */
export function downloadToComputer(source: "video" | "idea", id: string) {
  const link = document.createElement("a")
  link.href = `/api/v1/viral/download/${source}/${encodeURIComponent(id)}`
  link.download = ""
  link.rel = "noopener"
  document.body.append(link)
  link.click()
  link.remove()
}
