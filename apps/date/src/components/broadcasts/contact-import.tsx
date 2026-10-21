import * as React from "react"
import {
  ChevronDownIcon,
  DownloadIcon,
  FileDownIcon,
  Loader2Icon,
  UploadIcon,
} from "lucide-react"
import { toast } from "sonner"

import { ContactTagsBox } from "@/components/broadcasts/contact-tags-box"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { FormDialog } from "@/components/ui/form-dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { getContactErrorMessage, importContacts } from "@/lib/api/people/contacts"
import {
  CONTACT_IMPORT_BATCH,
  CONTACT_IMPORT_MAX_ROWS,
  guessImportField,
  IMPORT_FIELD_LABELS,
  parseCsv,
  readImportRows,
  SAMPLE_CONTACTS_CSV,
  type ImportField,
} from "@/lib/contacts/contact-csv"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

const IMPORT_FIELDS = Object.keys(IMPORT_FIELD_LABELS) as ImportField[]

/** A file read and matched, ready to send. */
type ReadFile = {
  name: string
  headings: string[]
  rows: string[][]
  fields: ImportField[]
}

/**
 * Import, the borderless button left of New contact (Tyler's mock, 20 Oct
 * 2026): a menu of "Upload a CSV file", which opens the import window, and
 * "Download a sample file".
 */
export function ContactImportMenu({
  knownTags,
  onImported,
}: {
  knownTags: string[]
  /** Re-reads the list once the people are in. */
  onImported: () => Promise<void>
}) {
  const [windowOpen, setWindowOpen] = React.useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {/* Words where there is room; an icon with its name in a narrow panel. */}
          {/* Ghost, no border (Tyler, 20 Oct 2026), like Filter beside it. */}
          <Button type="button" variant="ghost" className="@max-3xl:size-8 @max-3xl:px-0" aria-label="Import">
            <DownloadIcon className="size-4" />
            <span className="@max-3xl:hidden">Import</span>
            <ChevronDownIcon className="size-4 text-muted-foreground @max-3xl:hidden" />
          </Button>
        </DropdownMenuTrigger>
        {/* Wide enough that neither item wraps. */}
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={() => setWindowOpen(true)}>
            <UploadIcon />
            Upload a CSV file
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={downloadSample}>
            <FileDownIcon />
            Download a sample file
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {windowOpen ? (
        <ContactImportDialog
          knownTags={knownTags}
          onClose={() => setWindowOpen(false)}
          onImported={onImported}
        />
      ) : null}
    </>
  )
}

function downloadSample() {
  const url = URL.createObjectURL(new Blob([SAMPLE_CONTACTS_CSV], { type: "text/csv" }))
  const link = document.createElement("a")
  link.href = url
  link.download = "contacts-sample.csv"
  link.click()
  // A tick later: some browsers start the download after the click returns.
  setTimeout(() => URL.revokeObjectURL(url))
}

/**
 * The import window: pick a CSV file, check what each column is read as, add
 * tags for everybody if wanted, then import.
 *
 * Each column's field is guessed from its heading, so the usual file needs no
 * matching. The rows go to the server 500 at a time; a batch that fails stops
 * the import and says how far it got, and the people already sent stay in.
 * Nobody already on the list changes status: see `importWorkspaceContacts`.
 */
function ContactImportDialog({
  knownTags,
  onClose,
  onImported,
}: {
  knownTags: string[]
  onClose: () => void
  onImported: () => Promise<void>
}) {
  const [file, setFile] = React.useState<ReadFile | null>(null)
  const [tags, setTags] = React.useState<string[]>([])
  const [sent, setSent] = React.useState<number | null>(null)
  const [dragging, setDragging] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const busy = sent !== null

  const read = file ? readImportRows(file.rows, file.fields, tags) : null
  const hasEmail = file?.fields.includes("email") ?? false

  const pick = async (picked: File | undefined) => {
    if (!picked) return
    const text = await picked.text().catch(() => null)
    const table = text === null ? [] : parseCsv(text)
    const [headings, ...rows] = table
    if (!headings || rows.length === 0) {
      showErrorToast(`${picked.name} has no rows to import. It needs a heading row and at least one person.`)
      return
    }
    if (rows.length > CONTACT_IMPORT_MAX_ROWS) {
      showErrorToast(
        `${picked.name} has ${rows.length.toLocaleString()} rows. One file can hold up to ${CONTACT_IMPORT_MAX_ROWS.toLocaleString()}, so split it and import each part.`
      )
      return
    }
    const fields = headings.map(guessImportField)
    // Only one column can be the address; a second guess is left out.
    const firstEmail = fields.indexOf("email")
    setFile({
      name: picked.name,
      headings,
      rows,
      fields: fields.map((field, index) => (field === "email" && index !== firstEmail ? "skip" : field)),
    })
  }

  const setField = (column: number, field: ImportField) =>
    setFile((current) =>
      current
        ? {
            ...current,
            // Picking the address for one column takes it off any other.
            fields: current.fields.map((existing, index) =>
              index === column ? field : field === "email" && existing === "email" ? "skip" : existing
            ),
          }
        : current
    )

  const start = async () => {
    if (!file || !read) {
      showErrorToast("Choose a CSV file first.")
      return
    }
    if (!hasEmail) {
      showErrorToast("Pick which column holds the email address.")
      return
    }
    if (read.rows.length === 0) {
      showErrorToast("None of the rows has a real email address, so there is nobody to import.")
      return
    }
    const totals = { added: 0, updated: 0, unchanged: 0 }
    setSent(0)
    for (let at = 0; at < read.rows.length; at += CONTACT_IMPORT_BATCH) {
      const batch = read.rows.slice(at, at + CONTACT_IMPORT_BATCH)
      try {
        const result = await importContacts(batch)
        totals.added += result.added
        totals.updated += result.updated
        totals.unchanged += result.unchanged
        setSent(at + batch.length)
      } catch (error) {
        setSent(null)
        showErrorToast(
          at === 0
            ? getContactErrorMessage(error)
            : `Stopped after ${at.toLocaleString()} of ${read.rows.length.toLocaleString()} people, who are in. ${getContactErrorMessage(error)}`
        )
        await onImported()
        return
      }
    }
    toast.success(describeImport(totals, read.invalid))
    onClose()
    await onImported()
  }

  return (
    <FormDialog open dirty={file !== null} busy={busy} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Import contacts</DialogTitle>
            <DialogDescription>
              New addresses join the list. People already on it gain the file's tags and names, and keep their
              status, so nobody who opted out is put back.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void start()
            }}
          >
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>The file</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div
                    className={cn(
                      "grid justify-items-center gap-2 rounded-lg border border-dashed p-6 text-center",
                      dragging && "bg-muted"
                    )}
                    onDragOver={(event) => {
                      event.preventDefault()
                      setDragging(true)
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(event) => {
                      event.preventDefault()
                      setDragging(false)
                      void pick(event.dataTransfer.files[0])
                    }}
                  >
                    <p className="text-sm">
                      {file
                        ? `${file.name}, ${file.rows.length.toLocaleString()} ${file.rows.length === 1 ? "row" : "rows"}`
                        : "Drop a CSV file here, or choose one."}
                    </p>
                    <Button type="button" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
                      <UploadIcon className="size-4" />
                      {file ? "Choose another file" : "Choose a CSV file"}
                    </Button>
                    <input
                      ref={inputRef}
                      type="file"
                      accept=".csv,text/csv"
                      className="sr-only"
                      tabIndex={-1}
                      aria-label="CSV file"
                      onChange={(event) => {
                        void pick(event.target.files?.[0])
                        event.target.value = ""
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
              {file ? (
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>What each column holds</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    {file.headings.map((heading, column) => (
                      <div key={column} className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                        <div className="min-w-0">
                          <Label htmlFor={`import-column-${column}`} className="truncate">
                            {heading.trim() || `Column ${column + 1}`}
                          </Label>
                          <p className="truncate text-xs text-muted-foreground">
                            {file.rows[0]?.[column]?.trim() || "Empty in the first row"}
                          </p>
                        </div>
                        <Select
                          value={file.fields[column] ?? "skip"}
                          onValueChange={(value) => setField(column, value as ImportField)}
                          disabled={busy}
                        >
                          <SelectTrigger id={`import-column-${column}`} className="sm:w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {IMPORT_FIELDS.map((field) => (
                              <SelectItem key={field} value={field}>
                                {IMPORT_FIELD_LABELS[field]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                    <div className="grid gap-2">
                      <Label htmlFor="import-tags">Tag everybody in this file with</Label>
                      <ContactTagsBox
                        id="import-tags"
                        tags={tags}
                        knownTags={knownTags}
                        disabled={busy}
                        onAdd={(tag) => {
                          setTags((current) => [...current, tag])
                          return true
                        }}
                        onRemove={(tag) => setTags((current) => current.filter((entry) => entry !== tag))}
                      />
                    </div>
                    <p className="text-sm text-muted-foreground" aria-live="polite">
                      {!hasEmail
                        ? "Pick the column that holds the email address."
                        : describeReady(read?.rows.length ?? 0, read?.invalid ?? 0)}
                    </p>
                  </CardContent>
                </Card>
              ) : null}
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={requestClose} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2Icon className="animate-spin" /> : null}
                {busy
                  ? `Importing ${sent.toLocaleString()} of ${(read?.rows.length ?? 0).toLocaleString()}`
                  : read && read.rows.length
                    ? `Import ${read.rows.length.toLocaleString()} ${read.rows.length === 1 ? "contact" : "contacts"}`
                    : "Import contacts"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}

/** How many will go in, and how many rows are left out. */
function describeReady(ready: number, invalid: number): string {
  const people = `${ready.toLocaleString()} ${ready === 1 ? "person" : "people"} ready to import.`
  if (!invalid) return people
  return `${people} ${invalid.toLocaleString()} ${invalid === 1 ? "row has" : "rows have"} no real email address and will be left out.`
}

/** The toast once every batch is in. */
function describeImport(
  totals: { added: number; updated: number; unchanged: number },
  invalid: number
): string {
  // A count of nothing is left unsaid: "Added 0" reads as a failure when the
  // file simply held people already on the list.
  const parts = [
    totals.added ? `added ${totals.added.toLocaleString()}` : "",
    totals.updated ? `updated ${totals.updated.toLocaleString()}` : "",
    totals.unchanged ? `${totals.unchanged.toLocaleString()} already up to date` : "",
    invalid ? `${invalid.toLocaleString()} left out with no real address` : "",
  ].filter(Boolean)
  const sentence = parts.join(", ") || "nobody new"
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`
}
