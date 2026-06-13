import * as React from "react"
import Papa from "papaparse"
import {
  CheckCircle2Icon,
  FileSpreadsheetIcon,
  Loader2Icon,
  UploadIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ErrorAlert } from "@/components/error-alert"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  getContactErrorMessage,
  importContacts,
  type ImportContactsResult,
} from "@/lib/api/contacts"
import type { ContactListItem } from "@/lib/api/contact-lists"

const MAX_ROWS = 10_000

type ColumnTarget = "firstName" | "lastName" | "phone" | "email" | "custom" | "skip"

type ColumnMapping = {
  header: string
  sample: string
  target: ColumnTarget
  customKey: string
}

const TARGET_OPTIONS: Array<{ value: ColumnTarget; label: string }> = [
  { value: "firstName", label: "First name" },
  { value: "lastName", label: "Last name" },
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "custom", label: "Custom field" },
  { value: "skip", label: "Don't import" },
]

// Custom field keys become {{variables}} in agent prompts: letters,
// digits, underscores, starting with a letter.
function sanitizeFieldKey(header: string) {
  const key = header
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^([0-9])/, "f$1")
  return key.slice(0, 64) || "field"
}

// Best-guess target from common CSV header names.
function guessTarget(header: string): ColumnTarget {
  const normalized = header.toLowerCase().replace(/[^a-z]/g, "")
  if (/^(firstname|fname|first|name|fullname)$/.test(normalized)) return "firstName"
  if (/^(lastname|lname|last|surname)$/.test(normalized)) return "lastName"
  if (/^(phone|phonenumber|number|mobile|cell|tel|telephone)$/.test(normalized))
    return "phone"
  if (/^email$/.test(normalized)) return "email"
  return "custom"
}

export function CsvImportDialog({
  open,
  onOpenChange,
  lists,
  onImported,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  lists: ContactListItem[]
  // Called after a successful import so the parent refreshes contacts + lists.
  onImported: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Import Contacts from CSV</DialogTitle>
          <DialogDescription>Upload a file, map its columns, and import into your contacts.</DialogDescription>
        </DialogHeader>
        {open ? (
          <ImportWizard
            lists={lists}
            onImported={onImported}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function ImportWizard({
  lists,
  onImported,
  onClose,
}: {
  lists: ContactListItem[]
  onImported: () => void
  onClose: () => void
}) {
  const [error, setError] = React.useState<string | null>(null)
  const [fileName, setFileName] = React.useState<string | null>(null)
  const [rows, setRows] = React.useState<Record<string, string>[]>([])
  const [mappings, setMappings] = React.useState<ColumnMapping[]>([])
  const [listChoice, setListChoice] = React.useState<string>("none")
  const [newListName, setNewListName] = React.useState("")
  const [importing, setImporting] = React.useState(false)
  const [result, setResult] = React.useState<ImportContactsResult | null>(null)

  function handleFile(file: File) {
    setError(null)
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      // Strip a UTF-8 BOM if the file starts with one.
      transformHeader: (header) => header.replace(/^\uFEFF/, ""),
      complete: (parsed) => {
        const headers = (parsed.meta.fields ?? []).filter(Boolean)
        if (headers.length === 0 || parsed.data.length === 0) {
          setError("Couldn't find any rows in that file. Is it a CSV with a header row?")
          return
        }
        if (parsed.data.length > MAX_ROWS) {
          setError(
            `That file has ${parsed.data.length.toLocaleString()} rows — the limit is ${MAX_ROWS.toLocaleString()} per import. Split it and try again.`
          )
          return
        }
        setFileName(file.name)
        setRows(parsed.data)
        setMappings(
          headers.map((header) => {
            const sampleRow = parsed.data.find((row) => row[header])
            return {
              header,
              sample: sampleRow?.[header] ?? "",
              target: guessTarget(header),
              customKey: sanitizeFieldKey(header),
            }
          })
        )
      },
      error: () => setError("Couldn't read that file. Is it a valid CSV?"),
    })
  }

  function updateMapping(index: number, patch: Partial<ColumnMapping>) {
    setMappings((current) =>
      current.map((mapping, i) => (i === index ? { ...mapping, ...patch } : mapping))
    )
  }

  const phoneMapped = mappings.some((mapping) => mapping.target === "phone")
  // Single-target fields can only be mapped once.
  const duplicateTargets = (["firstName", "lastName", "phone", "email"] as const).filter(
    (target) => mappings.filter((mapping) => mapping.target === target).length > 1
  )
  const duplicateCustomKeys = (() => {
    const keys = mappings
      .filter((mapping) => mapping.target === "custom")
      .map((mapping) => mapping.customKey)
    return keys.filter((key, index) => keys.indexOf(key) !== index)
  })()
  const needsNewListName = listChoice === "new" && !newListName
  const canImport =
    rows.length > 0 &&
    phoneMapped &&
    duplicateTargets.length === 0 &&
    duplicateCustomKeys.length === 0 &&
    !needsNewListName &&
    !importing

  async function handleImport() {
    if (!canImport) return
    setImporting(true)
    setError(null)
    try {
      const importRows = rows.map((row) => {
        const built = {
          firstName: "",
          lastName: null as string | null,
          phone: "",
          email: null as string | null,
          customFields: {} as Record<string, string>,
        }
        for (const mapping of mappings) {
          const value = (row[mapping.header] ?? "").toString()
          if (!value || mapping.target === "skip") continue
          if (mapping.target === "firstName") built.firstName = value
          else if (mapping.target === "lastName") built.lastName = value
          else if (mapping.target === "phone") built.phone = value
          else if (mapping.target === "email") built.email = value
          else built.customFields[mapping.customKey] = value
        }
        return built
      })
      const imported = await importContacts({
        rows: importRows,
        listId: listChoice !== "none" && listChoice !== "new" ? listChoice : null,
        newListName: listChoice === "new" ? newListName : null,
      })
      setResult(imported)
      onImported()
    } catch (importError) {
      setError(getContactErrorMessage(importError))
    } finally {
      setImporting(false)
    }
  }

  // --- Step 3: results ---
  if (result) {
    return (
      <>
        <DialogBody>
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2Icon className="size-5 text-green-600 dark:text-green-500" />
              <span className="font-medium">Import complete</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="secondary">{result.created} created</Badge>
              <Badge variant="secondary">{result.updated} updated</Badge>
              <Badge variant={result.skipped.length ? "destructive" : "outline"}>
                {result.skipped.length} skipped
              </Badge>
              {result.listName ? (
                <Badge variant="outline">Added to "{result.listName}"</Badge>
              ) : null}
            </div>
            {result.skipped.length > 0 ? (
              <ScrollArea className="max-h-56 rounded-md border">
                <ul className="divide-y text-sm">
                  {result.skipped.map((skip) => (
                    <li key={skip.row} className="flex gap-3 px-3 py-1.5">
                      <span className="w-16 shrink-0 text-muted-foreground">
                        Row {skip.row}
                      </span>
                      <span className="min-w-0 break-words">{skip.reason}</span>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            ) : null}
          </div>
        </DialogBody>
        <DialogFooter variant="plain">
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </>
    )
  }

  // --- Step 1: pick a file ---
  if (rows.length === 0) {
    return (
      <>
        <DialogBody>
          <div className="space-y-4">
            {error ? <ErrorAlert message={error} /> : null}
            <label className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors hover:border-foreground/30 hover:bg-muted/40">
              <UploadIcon className="size-8 text-muted-foreground/60" />
              <div>
                <p className="text-sm font-medium">Choose a CSV file</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Needs a header row and a phone number column. Up to{" "}
                  {MAX_ROWS.toLocaleString()} rows.
                </p>
              </div>
              <input
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) handleFile(file)
                }}
              />
            </label>
            <p className="text-xs text-muted-foreground">
              Extra columns become custom fields you can use as{" "}
              <code className="rounded bg-muted px-1 py-0.5">{"{{variables}}"}</code> in
              agent prompts. Re-importing the same phone number updates the existing
              contact instead of duplicating it.
            </p>
          </div>
        </DialogBody>
        <DialogFooter variant="plain">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </DialogFooter>
      </>
    )
  }

  // --- Step 2: map columns ---
  return (
    <>
      <DialogBody>
        <div className="space-y-4">
          {error ? <ErrorAlert message={error} /> : null}
          <div className="flex items-center gap-2 text-sm">
            <FileSpreadsheetIcon className="size-4 text-muted-foreground" />
            <span className="font-medium">{fileName}</span>
            <Badge variant="secondary">{rows.length.toLocaleString()} rows</Badge>
            <button
              type="button"
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              onClick={() => {
                setRows([])
                setMappings([])
                setFileName(null)
                setError(null)
              }}
            >
              Choose a different file
            </button>
          </div>

          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">CSV column</th>
                  <th className="px-3 py-2 font-medium">Example</th>
                  <th className="px-3 py-2 font-medium">Import as</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {mappings.map((mapping, index) => (
                  <tr key={mapping.header}>
                    <td className="max-w-40 truncate px-3 py-2 font-medium">
                      {mapping.header}
                    </td>
                    <td className="max-w-40 truncate px-3 py-2 text-muted-foreground">
                      {mapping.sample || "—"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Select
                          value={mapping.target}
                          onValueChange={(value) =>
                            updateMapping(index, { target: value as ColumnTarget })
                          }
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TARGET_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {mapping.target === "custom" ? (
                          <Input
                            value={mapping.customKey}
                            aria-label={`Custom field name for ${mapping.header}`}
                            className="w-36"
                            onChange={(event) =>
                              updateMapping(index, {
                                customKey: sanitizeFieldKey(event.target.value),
                              })
                            }
                          />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!phoneMapped ? (
            <ErrorAlert message="Map one column to Phone — it's required for calling." />
          ) : null}
          {duplicateTargets.length > 0 ? (
            <ErrorAlert
              message={`Only one column can map to ${duplicateTargets
                .map((target) => TARGET_OPTIONS.find((o) => o.value === target)?.label)
                .join(", ")}.`}
            />
          ) : null}
          {duplicateCustomKeys.length > 0 ? (
            <ErrorAlert
              message={`Duplicate custom field names: ${Array.from(new Set(duplicateCustomKeys)).join(", ")}.`}
            />
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="import-list">Add imported contacts to a list</Label>
            <div className="flex items-center gap-2">
              <Select value={listChoice} onValueChange={setListChoice}>
                <SelectTrigger id="import-list" className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No list</SelectItem>
                  {lists.map((list) => (
                    <SelectItem key={list.id} value={list.id}>
                      {list.name}
                    </SelectItem>
                  ))}
                  <SelectItem value="new">+ New list…</SelectItem>
                </SelectContent>
              </Select>
              {listChoice === "new" ? (
                <Input
                  value={newListName}
                  placeholder="List name"
                  aria-label="New list name"
                  className="w-48"
                  onChange={(event) => setNewListName(event.target.value)}
                />
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              Campaigns call every contact on a list, so importing straight into one
              saves a step.
            </p>
          </div>
        </div>
      </DialogBody>
      <DialogFooter variant="plain">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" disabled={!canImport} onClick={handleImport}>
          {importing ? <Loader2Icon className="size-4 animate-spin" /> : null}
          {importing
            ? "Importing"
            : `Import ${rows.length.toLocaleString()} ${rows.length === 1 ? "row" : "rows"}`}
        </Button>
      </DialogFooter>
    </>
  )
}

