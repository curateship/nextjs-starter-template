import type { Extension } from "@codemirror/state"

import { SHARED_SKILLS_PATH } from "@/app/constants"

const languageCache = new Map<string, Promise<Extension[]>>()

type LanguageLoader = {
  key: string
  load: () => Promise<Extension[]>
}

export function loadLanguageForPath(path: string): Promise<Extension[]> {
  const loader = languageLoaderForPath(path)
  if (!loader) return Promise.resolve([])

  const cached = languageCache.get(loader.key)
  if (cached) return cached

  const promise = loader.load().catch((error) => {
    languageCache.delete(loader.key)
    throw error
  })
  languageCache.set(loader.key, promise)
  return promise
}

function languageLoaderForPath(path: string): LanguageLoader | null {
  const extension = path.split(".").pop()?.toLowerCase()

  if (path.startsWith("workspace/tasks/") || path.startsWith(`${SHARED_SKILLS_PATH}/`)) {
    return null
  }

  if (["ts", "tsx"].includes(extension ?? "")) {
    const key = extension === "tsx" ? "tsx" : "ts"
    return {
      key,
      load: () =>
        import("@codemirror/lang-javascript").then(({ javascript }) => [
          javascript({ jsx: extension === "tsx", typescript: true }),
        ]),
    }
  }

  if (["js", "jsx", "mjs", "cjs"].includes(extension ?? "")) {
    const key = extension === "jsx" ? "jsx" : "js"
    return {
      key,
      load: () =>
        import("@codemirror/lang-javascript").then(({ javascript }) => [
          javascript({ jsx: extension === "jsx" }),
        ]),
    }
  }

  if (extension === "json") {
    return {
      key: "json",
      load: () => import("@codemirror/lang-json").then(({ json }) => [json()]),
    }
  }
  if (["css", "scss", "sass"].includes(extension ?? "")) {
    return {
      key: "css",
      load: () => import("@codemirror/lang-css").then(({ css }) => [css()]),
    }
  }
  if (["html", "htm"].includes(extension ?? "")) {
    return {
      key: "html",
      load: () => import("@codemirror/lang-html").then(({ html }) => [html()]),
    }
  }
  if (["md", "mdx"].includes(extension ?? "")) {
    return {
      key: "markdown",
      load: () => import("@codemirror/lang-markdown").then(({ markdown }) => [markdown()]),
    }
  }
  if (extension === "py") {
    return {
      key: "python",
      load: () => import("@codemirror/lang-python").then(({ python }) => [python()]),
    }
  }
  if (extension === "rs") {
    return {
      key: "rust",
      load: () => import("@codemirror/lang-rust").then(({ rust }) => [rust()]),
    }
  }
  if (["sql", "sqlite"].includes(extension ?? "")) {
    return {
      key: "sql",
      load: () => import("@codemirror/lang-sql").then(({ sql }) => [sql()]),
    }
  }

  return null
}
