import path from "node:path"
import { readFile, readdir, realpath } from "node:fs/promises"

// The worker uses esbuild, which does not expand Vite's page-discovery call.
// Transform this one registry while keeping its validation and descriptors.
export function workerPageRegistry(root) {
  const routes = path.join(root, "src/routes")
  return {
    name: "worker-page-registry",
    async setup(builder) {
      const registry = await realpath(
        path.join(root, "src/lib/pages/page-registry.ts"),
      )
      builder.onLoad(
        { filter: /[/\\]lib[/\\]pages[/\\]page-registry\.ts$/ },
        async ({ path: file }) => {
          if (file !== registry) return
          const source = await readFile(file, "utf8")
          const call =
            /import\.meta\.glob\("\/src\/routes\/\*\*\/\*\.page\.ts",\s*\{\s*eager:\s*true,?\s*\}\)/g
          if ([...source.matchAll(call)].length !== 1) {
            throw new Error(
              "Worker page discovery changed. Update the registry build transform before shipping.",
            )
          }
          const files = (await readdir(routes, { recursive: true }))
            .filter(
              (name) =>
                name.endsWith(".page.ts") &&
                !name.split(path.sep).some((part) => part.startsWith(".")),
            )
            .sort()
          const imports = files.map(
            (name, index) =>
              `import * as page${index} from ${JSON.stringify(path.join(routes, name))};`,
          )
          const entries = files.map(
            (name, index) =>
              `${JSON.stringify("/src/routes/" + name.split(path.sep).join("/"))}: page${index}`,
          )
          return {
            contents:
              imports.join("\n") +
              "\n" +
              source.replace(call, () => `{${entries.join(",\n")}}`),
            loader: "ts",
            resolveDir: path.dirname(registry),
          }
        },
      )
    },
  }
}
