"use client";

import type { ComponentType } from "react";
import Bot from "lucide-react/dist/esm/icons/bot.js"
import Clock3 from "lucide-react/dist/esm/icons/clock-3.js"
import CornerDownLeft from "lucide-react/dist/esm/icons/corner-down-left.js"
import FileText from "lucide-react/dist/esm/icons/file-text.js"
import GitBranch from "lucide-react/dist/esm/icons/git-branch.js"
import Globe2 from "lucide-react/dist/esm/icons/earth.js"
import ImageIcon from "lucide-react/dist/esm/icons/image.js"
import MapPin from "lucide-react/dist/esm/icons/map-pin.js"
import Plus from "lucide-react/dist/esm/icons/plus.js"
import Sparkles from "lucide-react/dist/esm/icons/sparkles.js"
import Trash2 from "lucide-react/dist/esm/icons/trash-2.js"

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type {
  AutomationEditorData,
  AutomationNode,
  AutomationNodeKind,
  AutomationSchedule,
} from "@/features/automations/domain/types";
import {
  formatRunAtForTimezoneInput,
  runAtFromTimezoneInput,
} from "@/features/automations/domain/schedule";
import {
  AI_IMAGE_PROVIDERS,
  AI_IMAGE_PROVIDER_DEFAULT_MODELS,
  AI_PROVIDER_LABELS,
} from "@/lib/utils/ai-models";

export type NodePanelData = Pick<
  AutomationEditorData,
  "templates" | "listingTemplates" | "categories" | "providers"
>;

export interface NodePanelProps {
  node: AutomationNode;
  data: NodePanelData;
  onChange: (node: AutomationNode) => void;
}

export interface NodeUI {
  icon: ComponentType<{ className?: string }>;
  describe: (node: AutomationNode) => string;
  // When true, the inspector's generic node-name field is hidden because the
  // panel supplies its own header/layout.
  hideName?: boolean;
  Panel: ComponentType<NodePanelProps>;
}

const NODE_UI: Record<AutomationNodeKind, NodeUI> = {
  time: {
    icon: Clock3,
    describe: (node) =>
      node.kind === "time"
        ? `${node.config.schedule.frequency} · ${node.config.schedule.timezone}`
        : "",
    Panel: TimePanel,
  },
  scraper: {
    icon: Globe2,
    hideName: true,
    describe: (node) => {
      if (node.kind !== "scraper") return "";
      const count = node.config.urls.filter(Boolean).length;
      return `${count} website${count === 1 ? "" : "s"}`;
    },
    Panel: ScraperPanel,
  },
  router: {
    icon: GitBranch,
    hideName: true,
    describe: (node) =>
      node.kind === "router"
        ? `${node.config.routes.length} routes · ${node.config.model}`
        : "",
    Panel: RouterPanel,
  },
  agent: {
    icon: Bot,
    hideName: true,
    describe: (node) => (node.kind === "agent" ? node.config.model : ""),
    Panel: AgentPanel,
  },
  image: {
    icon: ImageIcon,
    describe: (node) =>
      node.kind === "image" ? `Featured image · ${node.config.model}` : "",
    Panel: ImagePanel,
  },
  post: {
    icon: FileText,
    describe: (node) =>
      node.kind === "post"
        ? node.config.publish
          ? "Publish post"
          : "Create draft post"
        : "",
    Panel: PostPanel,
  },
  listing: {
    icon: MapPin,
    describe: (node) =>
      node.kind === "listing" ? `Draft listings · ${node.config.model}` : "",
    Panel: ListingPanel,
  },
};

export function getNodeUI(kind: AutomationNodeKind): NodeUI {
  return NODE_UI[kind];
}

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const IMAGE_SIZES: Array<{
  value: Extract<AutomationNode, { kind: "image" }>["config"]["size"];
  label: string;
  hint: string;
}> = [
  { value: "landscape", label: "Landscape", hint: "1536 × 1024" },
  { value: "square", label: "Square", hint: "1024 × 1024" },
  { value: "portrait", label: "Portrait", hint: "1024 × 1536" },
];

export function Field({
  label,
  htmlFor,
  description,
  children,
}: {
  label: string;
  htmlFor: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {description ? (
        <p className="text-xs text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}

function TimePanel({ node, onChange }: NodePanelProps) {
  if (node.kind !== "time") return null;
  const schedule = node.config.schedule;
  const setSchedule = (next: AutomationSchedule) =>
    onChange({ ...node, config: { schedule: next } });
  return (
    <>
      <Field label="Frequency" htmlFor="schedule-frequency">
        <Select
          value={schedule.frequency}
          onValueChange={(value) =>
            setSchedule(
              changeFrequency(schedule, value as AutomationSchedule["frequency"]),
            )
          }
        >
          <SelectTrigger id="schedule-frequency">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="once">Once</SelectItem>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      {schedule.frequency === "once" ? (
        <Field label="Run at" htmlFor="schedule-once">
          <Input
            id="schedule-once"
            type="datetime-local"
            value={formatRunAtForTimezoneInput(schedule.runAt, schedule.timezone)}
            onChange={(event) => {
              const runAt = runAtFromTimezoneInput(
                event.target.value,
                schedule.timezone,
              );
              if (runAt) setSchedule({ ...schedule, runAt });
            }}
          />
        </Field>
      ) : (
        <Field label="Time" htmlFor="schedule-time">
          <Input
            id="schedule-time"
            type="time"
            value={schedule.time}
            onChange={(event) =>
              setSchedule({ ...schedule, time: event.target.value })
            }
          />
        </Field>
      )}
      {schedule.frequency === "weekly" ? (
        <Field label="Weekday" htmlFor="schedule-weekday">
          <Select
            value={String(schedule.dayOfWeek)}
            onValueChange={(value) =>
              setSchedule({ ...schedule, dayOfWeek: Number(value) })
            }
          >
            <SelectTrigger id="schedule-weekday">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WEEKDAYS.map((day, index) => (
                <SelectItem key={day} value={String(index)}>
                  {day}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ) : null}
      {schedule.frequency === "monthly" ? (
        <Field label="Day of month" htmlFor="schedule-monthday">
          <Input
            id="schedule-monthday"
            type="number"
            min={1}
            max={31}
            value={schedule.dayOfMonth}
            onChange={(event) =>
              setSchedule({
                ...schedule,
                dayOfMonth: Math.max(1, Math.min(31, Number(event.target.value) || 1)),
              })
            }
          />
        </Field>
      ) : null}
      <Field
        label="Timezone"
        htmlFor="schedule-timezone"
        description="Use an IANA timezone, such as America/Toronto."
      >
        <Input
          id="schedule-timezone"
          value={schedule.timezone}
          maxLength={100}
          onChange={(event) =>
            setSchedule({ ...schedule, timezone: event.target.value })
          }
        />
      </Field>
    </>
  );
}

function ScraperPanel({ node, onChange }: NodePanelProps) {
  if (node.kind !== "scraper") return null;
  const setUrls = (urls: string[]) => onChange({ ...node, config: { urls } });
  return (
    <div className="grid gap-3">
      <div>
        <Label>Website URLs</Label>
        <p className="mt-1 text-xs text-muted-foreground">
          Public HTTPS pages only. Unchanged pages are skipped.
        </p>
      </div>
      <div className="grid gap-2 rounded-2xl border border-foreground/5 bg-muted/40 p-2.5">
        {node.config.urls.map((url, index) => (
          <div
            key={index}
            className="flex items-center gap-2 rounded-xl border border-foreground/5 bg-card p-2.5 shadow-sm"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-amber-100 font-mono text-xs font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-200">
              {String(index + 1).padStart(2, "0")}
            </span>
            <Input
              aria-label={`Website URL ${index + 1}`}
              className="h-8 border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-0"
              type="url"
              value={url}
              placeholder="https://example.com/article"
              onChange={(event) =>
                setUrls(
                  node.config.urls.map((item, itemIndex) =>
                    itemIndex === index ? event.target.value : item,
                  ),
                )
              }
            />
            <Button
              variant="ghost"
              size="icon-xs"
              className="shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() =>
                setUrls(node.config.urls.filter((_, itemIndex) => itemIndex !== index))
              }
              disabled={node.config.urls.length === 1}
              aria-label={`Remove website URL ${index + 1}`}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
        <Button
          variant="ghost"
          size="sm"
          className="w-full"
          onClick={() => setUrls([...node.config.urls, ""])}
          disabled={node.config.urls.length >= 20}
        >
          <Plus />
          Add URL
        </Button>
      </div>
    </div>
  );
}

function RouterPanel({ node, data, onChange }: NodePanelProps) {
  if (node.kind !== "router") return null;
  const setConfig = (config: typeof node.config) => onChange({ ...node, config });
  return (
    <>
      <AiProviderFields node={node} providers={data.providers} onChange={onChange} />
      <div className="grid gap-3">
        <div>
          <Label>Routes</Label>
          <p className="mt-1 text-xs text-muted-foreground">
            Pages that do not match a named route use Else.
          </p>
        </div>
        <div className="grid gap-2 rounded-2xl border border-foreground/5 bg-muted/40 p-2.5">
          {node.config.routes.map((route, index) => {
            const nameId = `${node.id}-route-${route.id}-name`;
            const descriptionId = `${node.id}-route-${route.id}-description`;
            return (
              <div
                key={route.id}
                className="grid gap-2 rounded-xl border border-foreground/5 bg-card p-2.5 shadow-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-amber-100 font-mono text-xs font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-200">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <Label htmlFor={nameId} className="sr-only">
                    Route {index + 1} name
                  </Label>
                  <Input
                    id={nameId}
                    className="h-8 border-0 bg-transparent px-1 text-sm font-semibold shadow-none focus-visible:ring-0"
                    value={route.name}
                    maxLength={80}
                    placeholder="News"
                    onChange={(event) =>
                      setConfig({
                        ...node.config,
                        routes: node.config.routes.map((item) =>
                          item.id === route.id
                            ? { ...item, name: event.target.value }
                            : item,
                        ),
                      })
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    title={`Delete ${route.name || `route ${index + 1}`}`}
                    onClick={() =>
                      setConfig({
                        ...node.config,
                        routes: node.config.routes.filter((item) => item.id !== route.id),
                      })
                    }
                    aria-label={`Delete ${route.name || `route ${index + 1}`}`}
                  >
                    <Trash2 />
                  </Button>
                </div>
                <Label htmlFor={descriptionId} className="sr-only">
                  Route {index + 1} matching instructions
                </Label>
                <Textarea
                  id={descriptionId}
                  className="min-h-12 resize-none rounded-xl border-0 bg-muted/60 px-3 py-2 shadow-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  value={route.description}
                  maxLength={500}
                  rows={2}
                  placeholder="What belongs in this route?"
                  onChange={(event) =>
                    setConfig({
                      ...node.config,
                      routes: node.config.routes.map((item) =>
                        item.id === route.id
                          ? { ...item, description: event.target.value }
                          : item,
                      ),
                    })
                  }
                />
              </div>
            );
          })}
          <div className="flex items-center gap-2 rounded-xl border border-dashed bg-card/70 p-2.5 text-muted-foreground">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted">
              <CornerDownLeft className="size-3.5" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">Else</div>
              <div className="text-xs">Everything else</div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() =>
              setConfig({
                ...node.config,
                routes: [
                  ...node.config.routes,
                  {
                    id: crypto.randomUUID(),
                    name: `Route ${node.config.routes.length + 1}`,
                    description: "Describe what belongs in this route.",
                  },
                ],
              })
            }
            disabled={node.config.routes.length >= 8}
          >
            <Plus />
            Add route
          </Button>
        </div>
      </div>
    </>
  );
}

function AgentPanel({ node, data, onChange }: NodePanelProps) {
  if (node.kind !== "agent") return null;
  return (
    <>
      <AiProviderFields node={node} providers={data.providers} onChange={onChange} />
      <Field
        label="Instructions"
        htmlFor="agent-instructions"
        description="Tell the agent how to write the article from its research input."
      >
        <Textarea
          id="agent-instructions"
          rows={10}
          maxLength={12000}
          value={node.config.instructions}
          onChange={(event) =>
            onChange({
              ...node,
              config: { ...node.config, instructions: event.target.value },
            })
          }
        />
      </Field>
    </>
  );
}

function AiProviderFields({
  node,
  providers,
  onChange,
}: {
  node: Extract<AutomationNode, { kind: "agent" | "router" | "listing" }>;
  providers: AutomationEditorData["providers"];
  onChange: (node: AutomationNode) => void;
}) {
  const currentAvailable = providers.some(
    (item) => item.provider === node.config.provider,
  );
  return (
    <>
      <Field label="AI provider" htmlFor={`${node.id}-provider`}>
        <Select
          value={node.config.provider}
          onValueChange={(value) => {
            const provider = providers.find((item) => item.provider === value);
            if (!provider) return;
            if (node.kind === "agent")
              onChange({
                ...node,
                config: { ...node.config, provider: provider.provider, model: provider.defaultModel },
              });
            else if (node.kind === "router")
              onChange({
                ...node,
                config: { ...node.config, provider: provider.provider, model: provider.defaultModel },
              });
            else
              onChange({
                ...node,
                config: { ...node.config, provider: provider.provider, model: provider.defaultModel },
              });
          }}
        >
          <SelectTrigger
            id={`${node.id}-provider`}
            className="h-auto min-h-12 w-full rounded-xl px-3 py-2"
          >
            <span className="flex min-w-0 items-center gap-2.5 text-left">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Sparkles className="size-3.5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-foreground">
                  {AI_PROVIDER_LABELS[node.config.provider]}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {currentAvailable ? "Configured" : "Not configured"}
                </span>
              </span>
            </span>
          </SelectTrigger>
          <SelectContent>
            {!currentAvailable ? (
              <SelectItem value={node.config.provider} disabled>
                {AI_PROVIDER_LABELS[node.config.provider]} (not configured)
              </SelectItem>
            ) : null}
            {providers.map((item) => (
              <SelectItem key={item.provider} value={item.provider}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Model" htmlFor={`${node.id}-model`}>
        <Input
          id={`${node.id}-model`}
          className="rounded-xl font-semibold"
          value={node.config.model}
          maxLength={120}
          onChange={(event) => {
            if (node.kind === "agent")
              onChange({ ...node, config: { ...node.config, model: event.target.value } });
            else if (node.kind === "router")
              onChange({ ...node, config: { ...node.config, model: event.target.value } });
            else
              onChange({ ...node, config: { ...node.config, model: event.target.value } });
          }}
        />
      </Field>
    </>
  );
}

function ImagePanel({ node, data, onChange }: NodePanelProps) {
  if (node.kind !== "image") return null;
  const setConfig = (config: typeof node.config) => onChange({ ...node, config });
  const configured = data.providers.some(
    (item) => item.provider === node.config.provider,
  );
  return (
    <>
      <Field label="AI provider" htmlFor={`${node.id}-image-provider`}>
        <Select
          value={node.config.provider}
          onValueChange={(value) => {
            if (!AI_IMAGE_PROVIDERS.includes(value as typeof node.config.provider))
              return;
            const provider = value as (typeof AI_IMAGE_PROVIDERS)[number];
            setConfig({
              ...node.config,
              provider,
              model:
                AI_IMAGE_PROVIDER_DEFAULT_MODELS[
                  provider as keyof typeof AI_IMAGE_PROVIDER_DEFAULT_MODELS
                ],
            });
          }}
        >
          <SelectTrigger id={`${node.id}-image-provider`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AI_IMAGE_PROVIDERS.map((provider) => (
              <SelectItem key={provider} value={provider}>
                {AI_PROVIDER_LABELS[provider]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!configured ? (
          <p className="text-xs text-muted-foreground">
            {AI_PROVIDER_LABELS[node.config.provider]} is not configured. Runs still
            create the post, but skip the image until you add a key.
          </p>
        ) : null}
      </Field>
      <Field label="Model" htmlFor={`${node.id}-image-model`}>
        <Input
          id={`${node.id}-image-model`}
          className="rounded-xl font-semibold"
          value={node.config.model}
          maxLength={120}
          onChange={(event) =>
            setConfig({ ...node.config, model: event.target.value })
          }
        />
      </Field>
      <Field label="Image shape" htmlFor={`${node.id}-image-size`}>
        <Select
          value={node.config.size}
          onValueChange={(value) =>
            setConfig({ ...node.config, size: value as typeof node.config.size })
          }
        >
          <SelectTrigger id={`${node.id}-image-size`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {IMAGE_SIZES.map((size) => (
              <SelectItem key={size.value} value={size.value}>
                {size.label} · {size.hint}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field
        label="Image prompt"
        htmlFor={`${node.id}-image-prompt`}
        description="Describe the style of the featured image. The article's title and summary are added automatically."
      >
        <Textarea
          id={`${node.id}-image-prompt`}
          rows={6}
          maxLength={4000}
          value={node.config.prompt}
          onChange={(event) =>
            setConfig({ ...node.config, prompt: event.target.value })
          }
        />
      </Field>
    </>
  );
}

function PostPanel({ node, data, onChange }: NodePanelProps) {
  if (node.kind !== "post") return null;
  const setConfig = (config: typeof node.config) => onChange({ ...node, config });
  return (
    <>
      <Field label="Post template" htmlFor="post-template">
        <Select
          value={node.config.templateId || undefined}
          onValueChange={(templateId) => setConfig({ ...node.config, templateId })}
        >
          <SelectTrigger id="post-template">
            <SelectValue placeholder="Choose a template" />
          </SelectTrigger>
          <SelectContent>
            {data.templates.map((template) => (
              <SelectItem key={template.id} value={template.id}>
                {template.name}
                {template.isDefault ? " (default)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
        <div>
          <Label htmlFor="post-publish">Publish immediately</Label>
          <p className="mt-1 text-xs text-muted-foreground">
            Off creates a draft for review.
          </p>
        </div>
        <Switch
          id="post-publish"
          checked={node.config.publish}
          onCheckedChange={(publish) => setConfig({ ...node.config, publish })}
        />
      </div>
      <div className="grid gap-3">
        <div>
          <Label>Categories</Label>
          <p className="mt-1 text-xs text-muted-foreground">
            Optional categories applied to created posts.
          </p>
        </div>
        {data.categories.length ? (
          data.categories.map((category) => {
            const checked = node.config.categoryIds.includes(category.id);
            return (
              <label key={category.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={checked}
                  onCheckedChange={(next) => {
                    const categoryIds = next
                      ? [...node.config.categoryIds, category.id]
                      : node.config.categoryIds.filter((id) => id !== category.id);
                    setConfig({
                      ...node.config,
                      categoryIds,
                      primaryCategoryId: categoryIds.includes(
                        node.config.primaryCategoryId || "",
                      )
                        ? node.config.primaryCategoryId
                        : null,
                    });
                  }}
                />
                {category.title}
              </label>
            );
          })
        ) : (
          <p className="text-xs text-muted-foreground">No published categories.</p>
        )}
      </div>
      {node.config.categoryIds.length ? (
        <Field label="Primary category" htmlFor="post-primary">
          <Select
            value={node.config.primaryCategoryId || "none"}
            onValueChange={(value) =>
              setConfig({
                ...node.config,
                primaryCategoryId: value === "none" ? null : value,
              })
            }
          >
            <SelectTrigger id="post-primary">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No primary category</SelectItem>
              {data.categories
                .filter((category) => node.config.categoryIds.includes(category.id))
                .map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.title}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </Field>
      ) : null}
    </>
  );
}

function ListingPanel({ node, data, onChange }: NodePanelProps) {
  if (node.kind !== "listing") return null;
  const setConfig = (config: typeof node.config) => onChange({ ...node, config });
  return (
    <>
      <AiProviderFields node={node} providers={data.providers} onChange={onChange} />
      <Field
        label="Listing template"
        htmlFor="listing-template"
        description="New listings are drafted with this template's blocks. Listings are never auto-published."
      >
        <Select
          value={node.config.templateId || undefined}
          onValueChange={(templateId) => setConfig({ ...node.config, templateId })}
        >
          <SelectTrigger id="listing-template" className="w-full">
            <SelectValue placeholder="Choose a template" />
          </SelectTrigger>
          <SelectContent>
            {data.listingTemplates.map((template) => (
              <SelectItem key={template.id} value={template.id}>
                {template.name}
                {template.isDefault ? " (default)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field
        label="Default category"
        htmlFor="listing-category"
        description="Optional category applied to every drafted listing."
      >
        <Select
          value={node.config.categoryId || "none"}
          onValueChange={(value) =>
            setConfig({ ...node.config, categoryId: value === "none" ? null : value })
          }
        >
          <SelectTrigger id="listing-category" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No category</SelectItem>
            {data.categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field
        label="Instructions"
        htmlFor="listing-instructions"
        description="Optional hints for what to extract, such as which businesses count or how to fill the description."
      >
        <Textarea
          id="listing-instructions"
          rows={6}
          maxLength={4000}
          value={node.config.instructions}
          onChange={(event) =>
            setConfig({ ...node.config, instructions: event.target.value })
          }
        />
      </Field>
    </>
  );
}

function changeFrequency(
  schedule: AutomationSchedule,
  frequency: AutomationSchedule["frequency"],
): AutomationSchedule {
  const timezone = schedule.timezone;
  const time = schedule.frequency === "once" ? "09:00" : schedule.time;
  if (frequency === "once")
    return {
      frequency,
      timezone,
      runAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    };
  if (frequency === "daily") return { frequency, timezone, time };
  if (frequency === "weekly") return { frequency, timezone, time, dayOfWeek: 1 };
  return { frequency, timezone, time, dayOfMonth: 1 };
}
