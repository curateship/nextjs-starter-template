import { css } from "@codemirror/lang-css"
import { html } from "@codemirror/lang-html"
import { javascript } from "@codemirror/lang-javascript"
import { json } from "@codemirror/lang-json"
import { markdown } from "@codemirror/lang-markdown"
import { python } from "@codemirror/lang-python"
import { rust } from "@codemirror/lang-rust"
import { sql } from "@codemirror/lang-sql"
import type { Extension } from "@codemirror/state"

import { SHARED_SKILLS_PATH } from "@/app/constants"

export function languageForPath(path: string): Extension[] {
  const extension = path.split(".").pop()?.toLowerCase()

  if (path.startsWith("workspace/tasks/") || path.startsWith(`${SHARED_SKILLS_PATH}/`)) return []

  if (["ts", "tsx"].includes(extension ?? "")) {
    return [javascript({ jsx: extension === "tsx", typescript: true })]
  }

  if (["js", "jsx", "mjs", "cjs"].includes(extension ?? "")) {
    return [javascript({ jsx: extension === "jsx" })]
  }

  if (extension === "json") return [json()]
  if (["css", "scss", "sass"].includes(extension ?? "")) return [css()]
  if (["html", "htm"].includes(extension ?? "")) return [html()]
  if (["md", "mdx"].includes(extension ?? "")) return [markdown()]
  if (extension === "py") return [python()]
  if (extension === "rs") return [rust()]
  if (["sql", "sqlite"].includes(extension ?? "")) return [sql()]

  return []
}
