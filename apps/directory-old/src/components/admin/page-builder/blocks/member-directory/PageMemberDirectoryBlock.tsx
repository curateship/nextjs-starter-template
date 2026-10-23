"use client"

import { Card, CardContent, CardGroup } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { BlockEditorSection, BlockTabs } from "@/components/admin/layout/builder/block-tabs"
import { VisibilitySettings } from "@/components/admin/layout/builder/VisibilitySettings"

interface PageMemberDirectoryBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  onBack?: () => void
}

const MEMBER_DIRECTORY_ROLES = [
  ["owner", "Owners"],
  ["admin", "Admins"],
  ["member", "Members"],
] as const

function numberValue(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function PageMemberDirectoryBlock({
  content,
  onContentChange,
  onBack,
}: PageMemberDirectoryBlockProps) {
  const includedRoles: string[] = Array.isArray(content.includedRoles) && content.includedRoles.length
    ? content.includedRoles
    : MEMBER_DIRECTORY_ROLES.map(([role]) => role)
  const columns = Math.min(4, Math.max(1, numberValue(content.columns, 3)))
  const itemsPerPage = Math.min(100, Math.max(1, numberValue(content.itemsPerPage, 24)))
  const visibility = content.visibility && typeof content.visibility === "object" ? content.visibility : {}

  const toggleRole = (role: string, checked: boolean) => {
    const next = checked
      ? [...new Set([...includedRoles, role])]
      : includedRoles.filter((item) => item !== role)

    onContentChange("includedRoles", next.length ? next : includedRoles)
  }

  return (
    <BlockTabs
      onBack={onBack}
      headerClassName="pt-0"
      tabs={[
        {
          value: "content",
          label: "Content",
          content: (
            <CardGroup className="grid">
              <Card>
                <CardContent>
                  <BlockEditorSection heading="Header">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="member-directory-title">Title</Label>
                        <Input
                          id="member-directory-title"
                          value={content.title ?? ""}
                          onChange={(event) => onContentChange("title", event.target.value)}
                          placeholder="Members"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="member-directory-subtitle">Subtitle</Label>
                        <Input
                          id="member-directory-subtitle"
                          value={content.subtitle ?? ""}
                          onChange={(event) => onContentChange("subtitle", event.target.value)}
                          placeholder="Optional subtitle"
                        />
                      </div>
                    </div>
                  </BlockEditorSection>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <BlockEditorSection heading="Included Roles">
                    <div className="grid gap-3 md:grid-cols-3">
                      {MEMBER_DIRECTORY_ROLES.map(([role, label]) => (
                        <div key={role} className="flex items-center gap-2">
                          <Checkbox
                            id={`member-directory-role-${role}`}
                            checked={includedRoles.includes(role)}
                            onCheckedChange={(checked) => toggleRole(role, checked === true)}
                          />
                          <Label htmlFor={`member-directory-role-${role}`} className="cursor-pointer">
                            {label}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </BlockEditorSection>
                </CardContent>
              </Card>
            </CardGroup>
          ),
        },
        {
          value: "settings",
          label: "Settings",
          content: (
            <CardGroup className="grid">
              <Card>
                <CardContent>
                  <BlockEditorSection heading="Layout">
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label htmlFor="member-directory-layout">Layout</Label>
                        <Select
                          value={content.layout === "list" ? "list" : "grid"}
                          onValueChange={(value) => onContentChange("layout", value)}
                        >
                          <SelectTrigger id="member-directory-layout" size="button">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="grid">Grid</SelectItem>
                            <SelectItem value="list">List</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="member-directory-columns">Columns</Label>
                        <Input
                          id="member-directory-columns"
                          type="number"
                          min={1}
                          max={4}
                          value={columns}
                          onChange={(event) => {
                            onContentChange("columns", Math.min(4, Math.max(1, numberValue(event.target.value, 3))))
                          }}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="member-directory-items-per-page">Items per page</Label>
                        <Input
                          id="member-directory-items-per-page"
                          type="number"
                          min={1}
                          max={100}
                          value={itemsPerPage}
                          onChange={(event) => {
                            onContentChange("itemsPerPage", Math.min(100, Math.max(1, numberValue(event.target.value, 24))))
                          }}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="member-directory-sort-by">Sort by</Label>
                        <Select
                          value={content.sortBy === "joined" ? "joined" : "name"}
                          onValueChange={(value) => onContentChange("sortBy", value)}
                        >
                          <SelectTrigger id="member-directory-sort-by" size="button">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="name">Name</SelectItem>
                            <SelectItem value="joined">Date Joined</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="member-directory-sort-order">Sort order</Label>
                        <Select
                          value={content.sortOrder === "desc" ? "desc" : "asc"}
                          onValueChange={(value) => onContentChange("sortOrder", value)}
                        >
                          <SelectTrigger id="member-directory-sort-order" size="button">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="asc">Ascending</SelectItem>
                            <SelectItem value="desc">Descending</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </BlockEditorSection>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <BlockEditorSection heading="Filters">
                    <div className="grid gap-3 md:grid-cols-2">
                      {[
                        ["showSearch", "Show search"],
                        ["showRoleChips", "Show role chips"],
                      ].map(([field, label]) => (
                        <div key={field} className="flex min-h-16 items-center justify-between gap-3 rounded-md border p-3">
                          <Label htmlFor={`member-directory-${field}`} className="cursor-pointer">
                            {label}
                          </Label>
                          <Switch
                            id={`member-directory-${field}`}
                            className="shrink-0"
                            checked={content[field] !== false}
                            onCheckedChange={(checked) => onContentChange(field, checked)}
                          />
                        </div>
                      ))}
                    </div>
                  </BlockEditorSection>
                </CardContent>
              </Card>

              <VisibilitySettings
                visibility={visibility}
                onChange={(value) => onContentChange("visibility", value)}
                useCard
                fields={[
                  { key: "title", label: "Title" },
                  { key: "subtitle", label: "Subtitle" },
                ]}
              />
            </CardGroup>
          ),
        },
      ]}
    />
  )
}
