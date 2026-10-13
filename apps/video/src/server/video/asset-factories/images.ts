import {
  imageProvider,
  openAiImageSize,
  providerMessage,
  type AssetAspectRatio,
  type ImageModelId,
} from "@/lib/video/asset-factories"
import { getAiKey } from "@/server/ai/keys"
import { runAiCall } from "@/server/ai/usage"
import { getFromR2 } from "@/server/media/storage"

const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"])

export type ImageReference = { storagePath: string; mimeType: string }

type GeminiImageResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: { data?: string; mimeType?: string }
        inline_data?: { data?: string; mime_type?: string }
      }>
    }
  }>
}

type OpenAiImageResponse = {
  data?: Array<{ b64_json?: string }>
  usage?: { input_tokens?: number; output_tokens?: number }
}

async function referenceBytes(reference: ImageReference) {
  const object = await getFromR2(reference.storagePath)
  const bytes = await object.Body?.transformToByteArray()
  if (!bytes?.byteLength) throw new Error("Reference image could not be read")
  return bytes
}

function checkedImage(data: string | undefined, mimeType: string, provider: string) {
  if (!data) throw new Error(`${provider} did not return an image`)
  if (!IMAGE_MIME_TYPES.has(mimeType)) {
    throw new Error(`${provider} returned an unsupported image type`)
  }
  const bytes = new Uint8Array(Buffer.from(data, "base64"))
  if (!bytes.byteLength) throw new Error(`${provider} returned an empty image`)
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`${provider} returned an image larger than 10MB`)
  }
  return { bytes, mimeType }
}

async function generateOpenAiImage(options: {
  apiKey: string
  model: "gpt-image-2"
  prompt: string
  aspectRatio: AssetAspectRatio
  references: ImageReference[]
}) {
  const size = openAiImageSize(options.aspectRatio)
  let endpoint = "https://api.openai.com/v1/images/generations"
  let body: BodyInit
  let headers: HeadersInit = { Authorization: `Bearer ${options.apiKey}` }

  if (options.references.length) {
    if (
      options.references.some(
        (reference) => !IMAGE_MIME_TYPES.has(reference.mimeType)
      )
    ) {
      throw new Error("OpenAI reference images must be PNG, JPEG, or WebP")
    }
    endpoint = "https://api.openai.com/v1/images/edits"
    const form = new FormData()
    form.append("model", options.model)
    form.append("prompt", options.prompt)
    form.append("size", size)
    form.append("quality", "medium")
    form.append("output_format", "png")
    // In the order given, which is the order the prompt names them in.
    for (const [index, reference] of options.references.entries()) {
      const bytes = await referenceBytes(reference)
      form.append(
        "image[]",
        new Blob(
          [bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer],
          { type: reference.mimeType }
        ),
        `reference-image-${index + 1}`
      )
    }
    body = form
  } else {
    headers = { ...headers, "Content-Type": "application/json" }
    body = JSON.stringify({
      model: options.model,
      prompt: options.prompt,
      size,
      quality: "medium",
      output_format: "png",
    })
  }

  const response = await fetch(endpoint, { method: "POST", headers, body })
  if (!response.ok) {
    const detail = providerMessage(await response.text())
    throw new Error(
      `OpenAI could not generate that image${detail ? `: ${detail}` : "."}`
    )
  }
  const payload = (await response.json()) as OpenAiImageResponse
  return {
    result: checkedImage(payload.data?.[0]?.b64_json, "image/png", "OpenAI"),
    usage: {
      inputTokens: payload.usage?.input_tokens ?? 0,
      outputTokens: payload.usage?.output_tokens ?? 0,
    },
  }
}

export async function generateImage(options: {
  userId: string
  model: ImageModelId
  prompt: string
  aspectRatio: AssetAspectRatio
  /** Sent in this order. A project's look picture is always the last. */
  references: ImageReference[]
}) {
  const provider = imageProvider(options.model)
  const apiKey = await getAiKey(provider)
  if (!apiKey) {
    throw new Error(
      provider === "openai"
        ? "Add an OpenAI key in Settings first"
        : "Add a Google Gemini key in Settings first"
    )
  }

  const parts: unknown[] = [{ text: options.prompt }]
  if (provider === "gemini") {
    for (const reference of options.references) {
      const bytes = await referenceBytes(reference)
      parts.push({
        inlineData: {
          mimeType: reference.mimeType,
          data: Buffer.from(bytes).toString("base64"),
        },
      })
    }
  }

  return runAiCall(
    {
      userId: options.userId,
      provider,
      model: options.model,
      feature: "video-image-generation",
    },
    async () => {
      if (provider === "openai") {
        return generateOpenAiImage({
          ...options,
          apiKey,
          model: "gpt-image-2",
        })
      }
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${options.model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              responseModalities: ["TEXT", "IMAGE"],
              imageConfig: { aspectRatio: options.aspectRatio },
            },
          }),
        }
      )
      if (!response.ok) {
        const detail = providerMessage(await response.text())
        throw new Error(
          `Google could not generate that image${detail ? `: ${detail}` : "."}`
        )
      }

      const payload = (await response.json()) as GeminiImageResponse
      const responseParts = payload.candidates?.[0]?.content?.parts ?? []
      const image = responseParts
        .map((part) =>
          part.inlineData
            ? {
                data: part.inlineData.data,
                mimeType: part.inlineData.mimeType,
              }
            : {
                data: part.inline_data?.data,
                mimeType: part.inline_data?.mime_type,
              }
        )
        .find((item) => item?.data)
      const mimeType = image?.mimeType ?? "image/png"
      return {
        result: checkedImage(image?.data, mimeType, "Google"),
        usage: { inputTokens: 0, outputTokens: 0, units: 1 },
      }
    }
  )
}
