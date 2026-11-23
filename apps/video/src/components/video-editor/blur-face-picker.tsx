import {
  pickBlurFace,
  useBlurFaceChoices,
} from "@/components/video-editor/blur-face-choices"

/**
 * The faces found under a blur, numbered on the preview while they wait for
 * a pick (blur.md). Pressing one moves the blur onto that face and follows
 * it. Drawn over every lane, under the play bar's controls.
 */
export function BlurFacePicker({ selectedClipId }: { selectedClipId: string | null }) {
  const choices = useBlurFaceChoices()
  if (!choices || choices.clipId !== selectedClipId) return null
  return (
    <>
      {choices.faces.map((face, index) => (
        <button
          key={index}
          type="button"
          aria-label={`Follow face ${index + 1}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => pickBlurFace(choices.clipId, face)}
          className="absolute cursor-pointer rounded-sm border-2 border-white bg-black/10 shadow-[0_0_0_1px_rgba(0,0,0,0.6)] hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          style={{
            left: `${face.left * 100}%`,
            top: `${face.top * 100}%`,
            width: `${face.width * 100}%`,
            height: `${face.height * 100}%`,
            zIndex: 92,
          }}
        >
          <span className="absolute -top-6 left-0 grid size-5 place-items-center rounded-full bg-white text-xs font-semibold text-black">
            {index + 1}
          </span>
        </button>
      ))}
    </>
  )
}
