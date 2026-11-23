import { useNavigate } from "@tanstack/react-router"
import { ArrowRightIcon, FlameIcon } from "lucide-react"

import { RecordFrame } from "@/components/crm/record-frame"
import { PanelCard } from "@/components/shared/panel-card"
import { Button } from "@/components/ui/button"
import { CoverImage } from "@/components/viral/cover-image"
import { ProjectSettingsMenu } from "@/components/viral/project-menu"
import { SocialIcon } from "@/components/viral/social-icon"
import { formatCount } from "@/lib/viral/creators"
import { SOCIAL_NAMES } from "@/lib/viral/socials"
import type { ViralProjectItem } from "@/lib/viral/viral"

/**
 * A project's preview on the right of the Projects row (task features/03;
 * Tyler, 19 Nov 2026: "there should be an eye icon in action col to show a
 * preview in the right panel for that project's details"). It is the
 * shell's record frame: the cover, then cards for the project and its
 * numbers. Its ⋮ is the project's settings, the same rows as the ⋮ on the
 * project's own dashboard, and its footer opens that dashboard.
 */
export function ProjectPreview({ project, onChanged }: { project: ViralProjectItem; onChanged: () => Promise<unknown> }) {
  const navigate = useNavigate()
  return (
    <RecordFrame
      avatar={<FlameIcon />}
      title={project.name}
      line={project.sample ? "Sample project" : project.archived ? "Archived" : null}
      hideLabel="Hide the project"
      actions={<ProjectSettingsMenu project={project} refresh={onChanged} onGone={onChanged} align="end" />}
      body={
        <>
          {project.cover_url ? (
            // A figure, not a div, so the first card still follows Panel cards → Opacity.
            <figure className="mb-3.75 aspect-video overflow-hidden rounded-xl bg-muted">
              <CoverImage src={project.cover_url} className="size-full object-cover" fallback={null} />
            </figure>
          ) : null}
          <PanelCard storageId="viral-project-preview" title="Project">
            <dl className="grid gap-3 text-sm">
              <div className="grid gap-0.5">
                <dt className="text-muted-foreground">Your topic</dt>
                <dd>{project.topic || <span className="text-muted-foreground/70">Not set</span>}</dd>
              </div>
              <div className="grid gap-0.5">
                <dt className="text-muted-foreground">Description</dt>
                <dd className="break-words whitespace-pre-line">
                  {project.description || <span className="text-muted-foreground/70">None</span>}
                </dd>
              </div>
              <div className="grid gap-1">
                <dt className="text-muted-foreground">Socials</dt>
                <dd className="flex flex-wrap gap-x-3 gap-y-1">
                  {project.socials.map((social) => (
                    <span key={social} className="flex items-center gap-1.5">
                      <SocialIcon social={social} />
                      {SOCIAL_NAMES[social]}
                      {project.paused_socials.includes(social) ? <span className="text-muted-foreground">paused</span> : null}
                    </span>
                  ))}
                </dd>
              </div>
            </dl>
          </PanelCard>
          <PanelCard storageId="viral-project-preview-numbers" title="Numbers" className="mt-3.75">
            <dl className="grid gap-2 text-sm">
              <Fact label="Videos found" value={project.result_count.toLocaleString()} />
              <Fact label="Ideas in the vault" value={project.vault_count.toLocaleString()} />
              <Fact label="YouTube keywords" value={project.keywords.length.toLocaleString()} />
              <Fact label="YouTube allowance used" value={formatCount(project.units_spent)} />
            </dl>
          </PanelCard>
        </>
      }
      footer={
        <Button
          type="button"
          className="ml-auto"
          onClick={() => void navigate({ to: "/admin/projects/$projectId", params: { projectId: project.id } })}
        >
          Open project
          <ArrowRightIcon />
        </Button>
      }
    />
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-medium tabular-nums">{value}</dd>
    </div>
  )
}
