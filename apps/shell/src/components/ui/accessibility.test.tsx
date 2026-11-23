import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { DashboardContent } from "@/components/shell/dashboard-content"
import { InspectorCard as AutomationInspectorCard } from "@/components/automations/inspector-card"
import { InspectorCard as BroadcastInspectorCard } from "@/components/broadcasts/inspector-fields"
import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { StickyHeaderLeftNav } from "@/components/shell/sticky-header/sticky-header-left-nav"
import { ImageUpload } from "@/components/shared/image-upload"
import { CardTitle } from "@/components/ui/card"
import { FieldLabel } from "@/components/ui/field-label"
import {
  SidebarMenuButton,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"

describe("shared accessibility structure", () => {
  it("marks only the link that is current, separately from its highlight", () => {
    const sidebar = renderToStaticMarkup(
      <TooltipProvider>
        <SidebarProvider>
          <SidebarMenuButton asChild isActive isCurrent>
            <a href="/current">Current</a>
          </SidebarMenuButton>
          <SidebarMenuButton asChild isActive>
            <a href="/section">Highlighted section</a>
          </SidebarMenuButton>
        </SidebarProvider>
      </TooltipProvider>
    )
    const header = renderToStaticMarkup(
      <StickyHeaderLeftNav
        navLinks={[
          { label: "Current", href: "https://example.com/current", active: true },
          { label: "Other", href: "https://example.com/other" },
        ]}
      />
    )

    expect(sidebar.match(/aria-current="page"/g)).toHaveLength(1)
    expect(header.match(/aria-current="page"/g)).toHaveLength(1)
  })

  it("gives the page and its sections a real heading outline", () => {
    const markup = renderToStaticMarkup(
      <DashboardContent pageTitle="Overview">
        <CardTitle>Accounts</CardTitle>
        <CardTitle as="h3">Security</CardTitle>
      </DashboardContent>
    )

    expect(markup).toContain('<h1 class="sr-only">Overview</h1>')
    expect(markup).toContain("<h2")
    expect(markup).toContain(">Accounts</h2>")
    expect(markup).toContain("<h3")
    expect(markup).toContain(">Security</h3>")
  })

  it("keeps a collapsible heading short and puts the description on its button", () => {
    const markup = renderToStaticMarkup(
      <CollapsibleSettingsCard
        storageId="test"
        title="General settings"
        description="Set the app and workspace names."
      >
        Fields
      </CollapsibleSettingsCard>
    )

    expect(markup).toContain('aria-label="General settings"')
    expect(markup).toMatch(/aria-describedby="([^"]+)"/)
    expect(markup).not.toMatch(/<button[^>]*>[^]*<h[1-6]/)
  })

  it("puts editor collapse buttons inside their headings", () => {
    const markup = renderToStaticMarkup(
      <>
        <AutomationInspectorCard title="Timing">Fields</AutomationInspectorCard>
        <BroadcastInspectorCard title="Appearance">
          Fields
        </BroadcastInspectorCard>
      </>
    )

    expect(markup.match(/<h2/g)).toHaveLength(2)
    expect(markup.match(/<h2[^>]*><button/g)).toHaveLength(2)
    expect(markup).not.toMatch(/<button[^>]*><h[1-6]/)
  })

  it("includes a hint in the field label without adding a tab stop", () => {
    const markup = renderToStaticMarkup(
      <TooltipProvider>
        <FieldLabel htmlFor="password" hint="Use at least 12 characters.">
          Password
        </FieldLabel>
        <input id="password" />
      </TooltipProvider>
    )

    expect(markup).toContain(
      '<span class="sr-only">. Use at least 12 characters.</span>'
    )
    expect(markup).toContain('type="button"')
    expect(markup).toContain('tabindex="-1"')
  })

  it("links an image hint to the upload button", () => {
    const markup = renderToStaticMarkup(
      <TooltipProvider>
        <ImageUpload
          label="Logo"
          value=""
          hint="Shown on signed-out pages."
          onChange={() => undefined}
        />
      </TooltipProvider>
    )

    const labelId = markup.match(/<label[^>]*id="([^"]+)"/)?.[1]
    const buttonId = markup.match(/<button[^>]*id="([^"]+)"/)?.[1]

    expect(labelId).toBeTruthy()
    expect(buttonId).toBeTruthy()
    expect(markup).toContain(`for="${buttonId}"`)
    expect(markup).toContain(`aria-labelledby="${labelId}"`)
    expect(markup).toContain(". Shown on signed-out pages.")
  })
})
