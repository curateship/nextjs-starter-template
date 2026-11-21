import * as React from "react"
import { LayoutTemplateIcon } from "lucide-react"

import { CrmListHeader } from "@/components/crm/crm-row"
import { CrmTable, CrmTableRow, MainCell } from "@/components/crm/crm-table"
import { EmptyRecord } from "@/components/crm/record-frame"
import { MiddleHeading, PanelReopenButton } from "@/components/shared/three-panels"
import { TableCell } from "@/components/ui/table"
import type { ViralLoaded } from "@/components/viral/dashboard/load-section"
import { NoMatches, useOpenFirstRow, type SectionProps } from "@/components/viral/dashboard/section-parts"
import { LibraryFormatPanel } from "@/components/viral/library-format-panel"
import type { ViralFormat } from "@/lib/api/viral/viral-library"
import { useListSearchNavigate } from "@/lib/nav/list-search"
import { segmentRoleLabels } from "@/lib/viral/viral-breakdown"
import { formatShortDay } from "@/lib/viral/viral-view"

type Data = Extract<ViralLoaded, { section: "formats" }>
type FormatColumn = "format" | "length" | "saved"

/**
 * The Formats row (task features/03), which was Library → Formats
 * (`workspace/docs/library.md`): every format saved from an analysis's
 * script. Formats belong to the person, not to a project, so the Projects
 * block on the left picks the project Write a script writes for rather than
 * narrowing the list. The open format is on the right in the shell's record
 * frame.
 */
export function FormatsSection({ data, search, frame }: SectionProps<Data>) {
  const setSearch = useListSearchNavigate()
  const { projects } = data
  const { scriptPrice } = data.library

  // A format renamed or deleted on the right shows in the list at once.
  const [edits, setEdits] = React.useState<Record<string, ViralFormat | null>>({})
  const [loadedFrom, setLoadedFrom] = React.useState(data.library.formats)
  if (loadedFrom !== data.library.formats) {
    setLoadedFrom(data.library.formats)
    setEdits({})
  }
  const formats = React.useMemo(
    () =>
      data.library.formats.flatMap((format) => {
        const edit = edits[format.id]
        return edit === null ? [] : [edit ?? format]
      }),
    [edits, data.library.formats]
  )
  const words = search.q?.toLowerCase() ?? ""
  const shown = words
    ? formats.filter((format) =>
        [format.name, format.sourceTitle ?? "", ...format.parts.map((part) => part.summary)].some((text) =>
          text.toLowerCase().includes(words)
        )
      )
    : formats
  const ids = shown.map((format) => format.id)
  useOpenFirstRow(ids, search.open)
  const openFormat = search.open ? (formats.find((format) => format.id === search.open) ?? null) : null

  const project = search.project ? (projects.find((one) => one.id === search.project) ?? null) : null
  const ownProjects = projects.filter((one) => !one.sample)
  const writeFor = project && !project.sample ? project : (ownProjects[0] ?? null)

  const middle = (
    <div className="@container flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <CrmListHeader
        tabs={<MiddleHeading icon={LayoutTemplateIcon} label="Formats" />}
        end={<PanelReopenButton side="right" label="Show the format" />}
        menuLabel="More for formats"
        search={{
          name: "formats-search",
          label: "Search the formats",
          placeholder: "Search formats",
          value: search.q ?? "",
          onChange: (text) => setSearch({ q: text.trim() ? text : undefined }),
        }}
        massSelect={null}
      />
      <CrmTable<FormatColumn>
        columns={[
          { key: "format", label: "Format", column: "main", className: "min-w-40", sortable: false },
          { key: "length", label: "Length", column: "meta", className: "hidden md:hidden @lg:table-cell", sortable: false },
          { key: "saved", label: "Saved", column: "meta", className: "hidden md:hidden @xl:table-cell", sortable: false },
        ]}
        sort="format"
        direction="asc"
        onSort={() => undefined}
        actions={false}
        empty={
          shown.length ? null : !formats.length ? (
            "Press Save format under an analysis's script, and the format lands here."
          ) : (
            <NoMatches words={search.q ?? ""} noun="formats" onClear={() => setSearch({ q: undefined })} />
          )
        }
      >
        {shown.map((format) => (
          <CrmTableRow key={format.id} open={format.id === openFormat?.id} label={format.name} onOpen={() => setSearch({ open: format.id })}>
            <MainCell
              lead={
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted">
                  <LayoutTemplateIcon className="size-3.5 text-muted-foreground" aria-hidden />
                </span>
              }
              name={format.name}
              line={format.parts.map((part) => segmentRoleLabels[part.role]).join(" · ")}
            />
            <TableCell column="mutedMeta" className="hidden tabular-nums md:hidden @lg:table-cell">
              {format.parts.reduce((sum, part) => sum + part.seconds, 0)}s
            </TableCell>
            <TableCell column="mutedMeta" className="hidden whitespace-nowrap md:hidden @xl:table-cell">
              {formatShortDay(format.createdAt)}
            </TableCell>
          </CrmTableRow>
        ))}
      </CrmTable>
    </div>
  )

  return frame({
    ids,
    showMiddleFor: search.q ?? "",
    showRightFor: search.open,
    middle,
    right: {
      label: "Format",
      showLabel: "Show the format",
      content: openFormat ? (
        <LibraryFormatPanel
          key={openFormat.id}
          format={openFormat}
          projects={ownProjects}
          writeForId={writeFor?.id ?? null}
          price={scriptPrice}
          onChanged={(format) => setEdits((was) => ({ ...was, [format.id]: format }))}
          onDeleted={(format) => {
            setEdits((was) => ({ ...was, [format.id]: null }))
            setSearch({ open: undefined })
          }}
        />
      ) : (
        <EmptyRecord
          title="Format"
          icon={<LayoutTemplateIcon aria-hidden />}
          line="Press Save format under an analysis's script, and it opens here."
          hideLabel="Hide the format"
        />
      ),
    },
  })
}
