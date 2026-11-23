import {
  DashboardToolbar,
  DashboardToolbarTitle,
  DashboardToolbarControls,
  DashboardToolbarSearch,
} from "@/components/shared/dashboard-toolbar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import * as React from "react"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ChartNoAxesCombinedIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type {
  ExplorerOpening,
  ExplorerVenue,
} from "@/lib/api/trade/market-explorer"
import {
  DEFAULT_EXPLORER_VIEW,
  clearExplorerFilters,
  EXPLORER_COLUMNS,
  EXPLORER_LABELS,
  type ExplorerPrefs,
  type ExplorerView,
} from "@/lib/trade/market-explorer"
import { showErrorToast } from "@/lib/toast/error-toast"

function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: readonly (readonly [string, string])[]
  onChange: (value: string) => void
}) {
  const id = React.useId()
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([key, text]) => (
            <SelectItem key={key} value={key}>
              {text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
function Amount({
  label,
  value,
  onChange,
  zeroIsAny = true,
}: {
  label: string
  value: number
  zeroIsAny?: boolean
  onChange: (value: number) => void
}) {
  const id = React.useId()
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        min="0"
        max="1000000000000000"
        value={zeroIsAny ? value || "" : value}
        placeholder={zeroIsAny ? "Any" : "0"}
        onChange={(event) => {
          const next = Number(event.target.value)
          if (Number.isFinite(next) && next >= 0 && next <= 1e15) onChange(next)
        }}
      />
    </div>
  )
}

export function ExplorerControls({
  prefs,
  change,
  opening,
  venues,
  summary,
  folderNames = [],
  status,
}: {
  status?: React.ReactNode
  folderNames?: string[]
  summary?: React.ReactNode
  prefs: ExplorerPrefs
  change: (prefs: ExplorerPrefs) => void
  opening: ExplorerOpening
  venues: readonly ExplorerVenue[]
}) {
  const [editing, setEditing] = React.useState<
    "create" | "rename" | "delete" | null
  >(null)
  const [name, setName] = React.useState("")
  const view = prefs.current
  const active = prefs.views.find((one) => one.id === prefs.activeView)
  const selectedExchanges = opening.availableVenues.filter((venue) =>
    view.exchanges.includes(venue.protocol)
  ).length
  const update = (patch: Partial<ExplorerView>) => {
    const next = { ...view, ...patch }
    change({
      ...prefs,
      current: next,
      views: prefs.views.map((one) =>
        one.id === prefs.activeView ? { ...one, view: next } : one
      ),
    })
  }
  const categories = [
    ...new Set(
      venues.flatMap(
        (venue) => venue.catalog?.rows.map((row) => row.category) ?? []
      )
    ),
  ].sort()
  function saveView() {
    const trimmed = name.trim()
    if (
      editing !== "delete" &&
      (!trimmed ||
        prefs.views.some(
          (one) =>
            one.name.toLowerCase() === trimmed.toLowerCase() &&
            (editing === "create" || one.id !== prefs.activeView)
        ))
    ) {
      showErrorToast("Give the view a unique name.")
      return
    }
    if (editing === "create") {
      if (prefs.views.length >= 20) {
        showErrorToast(
          "You can save up to 20 views. Delete a view before adding another."
        )
        return
      }
      const id = crypto.randomUUID()
      change({
        ...prefs,
        activeView: id,
        views: [...prefs.views, { id, name: trimmed, view }],
      })
    } else if (editing === "rename") {
      change({
        ...prefs,
        views: prefs.views.map((one) =>
          one.id === prefs.activeView ? { ...one, name: trimmed } : one
        ),
      })
    } else {
      change({
        ...prefs,
        activeView: "all",
        views: prefs.views.filter((one) => one.id !== prefs.activeView),
      })
    }
    setEditing(null)
  }
  return (
    <>
      <DashboardToolbar>
        <DashboardToolbarTitle>
          <span className="flex size-7 shrink-0 items-center justify-center sm:size-8 [&_svg]:size-4">
            <ChartNoAxesCombinedIcon aria-hidden="true" />
          </span>
          <h1 className="text-sm font-medium sm:text-base">Markets</h1>
          {summary}
        </DashboardToolbarTitle>
        <DashboardToolbarControls>
          <DashboardToolbarSearch
            aria-label="Search markets"
            placeholder="Search markets…"
            value={view.search}
            maxLength={120}
            onChange={(event) => update({ search: event.target.value })}
          />
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">
                Filters{" "}
                <ChevronDownIcon
                  aria-hidden="true"
                  className="text-muted-foreground"
                />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80">
              <ScrollArea viewportClassName="max-h-[65vh]">
                <div className="grid gap-4 p-1">
                  <Label>Exchanges · {selectedExchanges}</Label>
                  <div className="grid gap-2">
                    {opening.availableVenues.map((venue) => (
                      <label
                        key={venue.protocol}
                        className="flex items-center gap-2 text-sm"
                      >
                        <Checkbox
                          checked={view.exchanges.includes(venue.protocol)}
                          onCheckedChange={(checked) => {
                            const current = view.exchanges
                            update({
                              exchanges: checked
                                ? [...new Set([...current, venue.protocol])]
                                : current.filter((id) => id !== venue.protocol),
                            })
                          }}
                        />
                        {venue.protocolLabel}
                      </label>
                    ))}
                  </div>

                  <div className="grid gap-2">
                    <Label>Kind of market</Label>
                    {categories.map((category) => (
                      <label
                        key={category}
                        className="flex items-center gap-2 text-sm"
                      >
                        <Checkbox
                          checked={view.categories.includes(category)}
                          onCheckedChange={(checked) =>
                            update({
                              categories: checked
                                ? [...view.categories, category]
                                : view.categories.filter(
                                    (one) => one !== category
                                  ),
                            })
                          }
                        />
                        {category}
                      </label>
                    ))}
                  </div>
                  <Choice
                    label="24h volume at least"
                    value={
                      [0, 1e6, 1e7, 1e8].includes(view.minimumVolume)
                        ? String(view.minimumVolume)
                        : "custom"
                    }
                    options={[
                      ["0", "Any"],
                      ["1000000", "$1m"],
                      ["10000000", "$10m"],
                      ["100000000", "$100m"],
                      ["custom", "Custom"],
                    ]}
                    onChange={(value) =>
                      update({
                        minimumVolume: value === "custom" ? 1 : Number(value),
                      })
                    }
                  />
                  <Amount
                    label="Minimum 24h volume in dollars"
                    value={view.minimumVolume}
                    onChange={(minimumVolume) => update({ minimumVolume })}
                  />
                  <Choice
                    label="24h move direction"
                    value={view.moveDirection}
                    options={[
                      ["either", "Either"],
                      ["up", "Up"],
                      ["down", "Down"],
                    ]}
                    onChange={(moveDirection) =>
                      update({
                        moveDirection:
                          moveDirection as ExplorerView["moveDirection"],
                      })
                    }
                  />
                  <Amount
                    label="24h move at least %"
                    value={view.minimumMove}
                    onChange={(minimumMove) => update({ minimumMove })}
                  />
                  <Amount
                    label="Pace at least N×"
                    value={view.minimumPace}
                    onChange={(minimumPace) => update({ minimumPace })}
                  />
                  <Choice
                    label="Daily funding on $1,000"
                    value={view.dailyFunding}
                    options={[
                      ["any", "Any"],
                      ["longEarns", "Long earns"],
                      ["shortEarns", "Short earns"],
                      ["longCostsUnder", "Long costs under"],
                      ["shortCostsUnder", "Short costs under"],
                    ]}
                    onChange={(dailyFunding) =>
                      update({
                        dailyFunding:
                          dailyFunding as ExplorerView["dailyFunding"],
                      })
                    }
                  />
                  {view.dailyFunding.endsWith("CostsUnder") && (
                    <Amount
                      label="Costs under $ per day"
                      zeroIsAny={false}
                      value={view.maximumDailyCost}
                      onChange={(maximumDailyCost) =>
                        update({ maximumDailyCost })
                      }
                    />
                  )}
                  <Choice
                    label="In folder"
                    value={view.folder ? `folder:${view.folder}` : "__all"}
                    options={[
                      ["__all", "Any folder"],
                      ...folderNames.map(
                        (name) => [`folder:${name}`, name] as const
                      ),
                    ]}
                    onChange={(folder) =>
                      update({
                        folder: folder === "__all" ? "" : folder.slice(7),
                      })
                    }
                  />
                  {(
                    [
                      ["onlyMine", "Only mine"],
                      ["recentListings", "Listed in the last 7 days"],
                      ["hideQuiet", "Hide quiet markets"],
                    ] as const
                  ).map(([key, label]) => (
                    <label
                      key={key}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={view[key]}
                        onCheckedChange={(checked) =>
                          update({ [key]: checked === true })
                        }
                      />
                      {label}
                    </label>
                  ))}
                  <Choice
                    label="Funding"
                    value={view.funding}
                    options={[
                      ["any", "Any"],
                      ["paying", "Paying longs"],
                      ["costing", "Costing longs"],
                      ["cheap", "Paying or near zero"],
                    ]}
                    onChange={(funding) =>
                      update({ funding: funding as ExplorerView["funding"] })
                    }
                  />
                  <Amount
                    label="Max leverage at least"
                    value={view.minimumLeverage}
                    onChange={(minimumLeverage) => update({ minimumLeverage })}
                  />
                  <Choice
                    label="Trading available"
                    value={view.tradeable}
                    options={[
                      ["any", "Any"],
                      ["yes", "Tradeable only"],
                      ["no", "Test only"],
                    ]}
                    onChange={(tradeable) =>
                      update({
                        tradeable: tradeable as ExplorerView["tradeable"],
                      })
                    }
                  />
                  <Button
                    variant="outline"
                    onClick={() => update(clearExplorerFilters(view))}
                  >
                    Clear filters
                  </Button>
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">
                View
                <ChevronDownIcon />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80">
              <ScrollArea viewportClassName="max-h-[65vh]">
                <div className="grid gap-4 p-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={prefs.activeView}
                      onValueChange={(id) =>
                        change({
                          ...prefs,
                          activeView: id,
                          current:
                            id === "all"
                              ? { ...DEFAULT_EXPLORER_VIEW }
                              : prefs.views.find((one) => one.id === id)!.view,
                        })
                      }
                    >
                      <SelectTrigger
                        aria-label="Saved view"
                        className="max-w-48"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All markets</SelectItem>
                        {prefs.views.map((one) => (
                          <SelectItem key={one.id} value={one.id}>
                            {one.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost">
                          View options
                          <ChevronDownIcon />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => {
                            setName("")
                            setEditing("create")
                          }}
                        >
                          Save view
                        </DropdownMenuItem>
                        {active && (
                          <>
                            <DropdownMenuItem
                              onSelect={() => {
                                setName(active.name)
                                setEditing("rename")
                              }}
                            >
                              Rename view
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => setEditing("delete")}
                            >
                              Delete view
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Tabs
                      value={view.layout}
                      onValueChange={(layout) =>
                        update({ layout: layout as ExplorerView["layout"] })
                      }
                    >
                      <TabsList>
                        <TabsTrigger value="table">Table</TabsTrigger>
                        <TabsTrigger value="map">Map</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                  <div className="grid gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <Switch
                        checked={view.liveSort}
                        onCheckedChange={(liveSort) => update({ liveSort })}
                      />
                      Live sort
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Switch
                        checked={view.groupByCoin}
                        onCheckedChange={(groupByCoin) =>
                          update({ groupByCoin })
                        }
                      />
                      Group by coin
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Switch
                        checked={view.arrivals}
                        onCheckedChange={(arrivals) => update({ arrivals })}
                      />
                      Watch arrivals
                    </label>
                    {view.arrivals && (
                      <>
                        <p className="text-xs text-muted-foreground">
                          Only while this page is open.
                        </p>
                        <Amount
                          label="Notify when pace crosses N×"
                          value={view.alertPace}
                          onChange={(alertPace) => update({ alertPace })}
                        />
                      </>
                    )}
                    {view.layout === "map" && (
                      <Choice
                        label="Map move window"
                        value={view.mapWindow}
                        options={[
                          ["5s", "5 seconds"],
                          ["1m", "1 minute"],
                          ["5m", "5 minutes"],
                          ["24h", "24 hours"],
                        ]}
                        onChange={(mapWindow) =>
                          update({
                            mapWindow: mapWindow as ExplorerView["mapWindow"],
                          })
                        }
                      />
                    )}
                  </div>

                  <div className="border-t pt-3">
                    <Label>Columns</Label>
                    <div className="grid gap-2">
                      <p className="text-sm text-muted-foreground">
                        Exchange and Market always show.
                      </p>
                      {[
                        ...view.columns,
                        ...EXPLORER_COLUMNS.filter(
                          (column) => !view.columns.includes(column)
                        ),
                      ]
                        .filter(
                          (column) =>
                            column !== "openInterestUsd" ||
                            venues.some(
                              (venue) => venue.catalog?.picker.openInterest
                            )
                        )
                        .map((column) => (
                          <div key={column} className="flex items-center gap-2">
                            <label className="flex flex-1 items-center gap-2 text-sm">
                              <Checkbox
                                checked={view.columns.includes(column)}
                                onCheckedChange={(checked) => {
                                  const columns = checked
                                    ? [...view.columns, column]
                                    : view.columns.filter(
                                        (one) => one !== column
                                      )
                                  const sort =
                                    view.sort === column && !checked
                                      ? "volume24hUsd"
                                      : view.sort
                                  if (
                                    sort === "volume24hUsd" &&
                                    !columns.includes(sort)
                                  )
                                    columns.push(sort)
                                  update({ columns, sort })
                                }}
                              />
                              {EXPLORER_LABELS[column]}
                            </label>
                            {view.columns.includes(column) && (
                              <>
                                {[-1, 1].map((step) => (
                                  <Button
                                    key={step}
                                    variant="ghost"
                                    size="icon"
                                    aria-label={`Move ${EXPLORER_LABELS[column]} ${step < 0 ? "left" : "right"}`}
                                    onClick={() => {
                                      const columns = [...view.columns]
                                      const index = columns.indexOf(column)
                                      const target = index + step
                                      if (
                                        target < 0 ||
                                        target >= columns.length
                                      )
                                        return
                                      ;[columns[index], columns[target]] = [
                                        columns[target],
                                        columns[index],
                                      ]
                                      update({ columns })
                                    }}
                                  >
                                    {step < 0 ? (
                                      <ArrowUpIcon />
                                    ) : (
                                      <ArrowDownIcon />
                                    )}
                                  </Button>
                                ))}
                              </>
                            )}
                          </div>
                        ))}
                    </div>
                  </div>
                  {status}
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>
        </DashboardToolbarControls>
      </DashboardToolbar>
      <FormDialog
        open={editing === "create" || editing === "rename"}
        dirty={name !== (editing === "rename" ? (active?.name ?? "") : "")}
        onClose={() => setEditing(null)}
      >
        {(requestClose) => (
          <DialogContent variant="admin">
            <DialogHeader>
              <DialogTitle>
                {editing === "rename" ? "Rename view" : "Save view"}
              </DialogTitle>
            </DialogHeader>
            <DialogBody>
              <Card size="sm">
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="explorer-view-name">View name</Label>
                    <Input
                      id="explorer-view-name"
                      maxLength={40}
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                    />
                  </div>
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" size="lg" onClick={requestClose}>
                Cancel
              </Button>
              <Button size="lg" onClick={saveView}>
                Save changes
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </FormDialog>
      <ConfirmDialog
        open={editing === "delete"}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        title="Delete view"
        description={`Delete ${active?.name ?? "this view"}? Your current filters stay on screen.`}
        confirmLabel="Delete view"
        onConfirm={saveView}
      />
    </>
  )
}
