import { BlockContainer } from "@/components/frontend/layout/block-container"
import { sanitizeRichHtml } from "@/lib/utils/html-sanitizer"

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

function isVideoUrl(url: string) {
  return /\.(mp4|webm|mov|avi|mkv)(\?.*)?$/i.test(url)
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

  const steps = Array.isArray(content?.steps) ? content.steps.slice(0, 3) : []
  const headerAlign = content?.headerAlign

  return (
    <BlockContainer
      siteWidth={siteWidth}
      customWidth={customWidth}
      header={{
        title: visibility.header !== false ? content?.header : "",
        subtitle: visibility.subheader !== false ? content?.subheader : "",
        align: headerAlign,
      }}
    >
      <div className="relative mt-20 flex flex-col gap-8">
        <span className="pointer-events-none absolute bottom-5 left-5 top-5 w-[3px] bg-linear-to-b from-transparent via-primary to-transparent opacity-70" />
        {steps.map((step, index) => {
          const showTitle = visibility[`${step.id}Title`] !== false
          const safeDescription = sanitizeRichHtml(step.description)
          const showDescription = visibility[`${step.id}Description`] !== false && Boolean(safeDescription.trim())
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
                    <div
                      className="prose prose-sm max-w-none text-muted-foreground dark:prose-invert prose-p:my-0 prose-p:text-muted-foreground prose-strong:text-foreground min-[960px]:prose-base"
                      dangerouslySetInnerHTML={{ __html: safeDescription }}
                    />
                  ) : null}
                </div>
              </div>

              {showImage ? (
                isVideoUrl(step.image) ? (
                  <video
                    src={`/api/media/proxy?url=${encodeURIComponent(step.image)}`}
                    className="z-10 h-72 w-full rounded-xl border object-cover min-[960px]:h-80"
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="auto"
                  />
                ) : (
                  <img
                    src={step.image}
                    alt={step.title}
                    className="z-10 h-72 w-full rounded-xl border object-cover min-[960px]:h-80"
                  />
                )
              ) : null}
            </div>
          )
        })}
      </div>
    </BlockContainer>
  )
}
