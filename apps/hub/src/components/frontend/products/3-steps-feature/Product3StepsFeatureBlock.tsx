import { BlockContainer } from "@/components/frontend/layout/block-container"

interface StepItem {
  id: string
  image: string
  title: string
  description: string
}

interface Product3StepsFeatureBlockProps {
  content?: {
    header?: string
    subheader?: string
    headerAlign?: "left" | "center" | "right"
    steps?: StepItem[]
    visibility?: Record<string, boolean>
  }
  siteWidth?: "full" | "custom"
  customWidth?: number
}

const DEFAULT_STEPS: StepItem[] = [
  {
    id: "step-monitor-deployments",
    image: "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/placeholder-1.svg",
    title: "Monitor Deployments Live",
    description: "Track your deployments with clarity, seeing updates take place as they happen.",
  },
  {
    id: "step-detect-issues",
    image: "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/placeholder-2.svg",
    title: "Immediate Issue Detection",
    description: "Spot issues instantly and address them with precise metrics for optimized performance.",
  },
  {
    id: "step-stable-version",
    image: "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/placeholder-3.svg",
    title: "Revert to a Stable Version",
    description: "Restore system health swiftly by returning to a previous stable version.",
  },
]

function normalizeSteps(steps: unknown): StepItem[] {
  const source = Array.isArray(steps) ? steps : []

  return DEFAULT_STEPS.map((defaultStep, index) => {
    const step = source[index] && typeof source[index] === "object"
      ? source[index] as Partial<StepItem>
      : {}

    return {
      id: typeof step.id === "string" && step.id ? step.id : defaultStep.id,
      image: typeof step.image === "string" ? step.image : defaultStep.image,
      title: typeof step.title === "string" ? step.title : defaultStep.title,
      description: typeof step.description === "string" ? step.description : defaultStep.description,
    }
  })
}

function StepLine({ number }: { number: number }) {
  return (
    <div className="relative flex w-10 shrink-0 justify-center self-stretch">
      <span className="relative z-10 mt-0 flex size-10 shrink-0 items-center justify-center rounded-full border bg-background font-mono text-lg">
        {number}
      </span>
    </div>
  )
}

export function Product3StepsFeatureBlock({
  content,
  siteWidth = "custom",
  customWidth,
}: Product3StepsFeatureBlockProps) {
  const visibility = content?.visibility ?? {}
  if (visibility.hideBlock === true) return null

  const steps = normalizeSteps(content?.steps)
  const headerAlign = content?.headerAlign ?? "center"

  return (
    <BlockContainer
      siteWidth={siteWidth}
      customWidth={customWidth}
      header={{
        title: visibility.header !== false ? content?.header ?? "Launch with Assurance" : "",
        subtitle: visibility.subheader !== false ? content?.subheader ?? "Simplify your workflow with clear insights and a guided process." : "",
        align: headerAlign,
      }}
    >
      <div className="relative flex flex-col gap-8">
        <span className="pointer-events-none absolute bottom-5 left-5 top-5 w-[3px] bg-linear-to-b from-transparent via-primary to-transparent opacity-70" />
        {steps.map((step, index) => {
          const showTitle = visibility[`${step.id}Title`] !== false
          const showDescription = visibility[`${step.id}Description`] !== false
          const showImage = visibility[`${step.id}Image`] !== false && step.image

          return (
            <div key={step.id} className="grid items-start gap-6 min-[960px]:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] min-[960px]:gap-8">
              <div className="flex self-stretch gap-4">
                <StepLine number={index + 1} />
                <div className="flex flex-col gap-5 px-0 pt-0 min-[960px]:gap-6 min-[960px]:px-4">
                  {showTitle ? (
                    <h3 className="text-xl min-[960px]:text-2xl">{step.title}</h3>
                  ) : null}
                  {showDescription ? (
                    <p className="text-sm text-muted-foreground min-[960px]:text-base">{step.description}</p>
                  ) : null}
                </div>
              </div>

              {showImage ? (
                <img
                  src={step.image}
                  alt={step.title}
                  className="z-10 h-72 w-full rounded-xl border object-cover min-[960px]:h-80"
                />
              ) : null}
            </div>
          )
        })}
      </div>
    </BlockContainer>
  )
}
