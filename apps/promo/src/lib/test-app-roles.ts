import type { AppOptions } from "@/lib/app-options"

/**
 * The app roles the shell's own tests use. Custom Shell declares none, so a
 * test that needs one mocks `@/app/options` with this:
 *
 *     vi.mock("@/app/options", async () => ({
 *       appOptions: (await import("@/lib/test-app-roles")).testAppRoleOptions,
 *     }))
 *
 * `employee` gets nothing of the shell, which is where every app role starts.
 * `editor` gets Feedback and Changelog, so a test can tell "has none" from
 * "has some". Nothing outside a test imports this file.
 */
export const testAppRoleOptions: AppOptions = {
  roles: [
    {
      id: "employee",
      label: "Employee",
      landing: "/dashboard",
      menu: [
        {
          id: "section-employee",
          title: "Work",
          entries: [
            {
              type: "item",
              id: "item-employee-dashboard",
              label: "My dashboard",
              href: "/dashboard",
              icon: "house",
              visible: true,
            },
          ],
        },
      ],
    },
    {
      id: "editor",
      label: "Editor",
      landing: "/editing",
      features: ["feedback", "changelog"],
      menu: [],
    },
  ],
}
