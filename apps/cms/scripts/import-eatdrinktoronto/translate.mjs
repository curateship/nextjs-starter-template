import { isIP } from "node:net"

const VALUE_KEYS = {
  "directory-core": ["address", "rating", "menuLinks", "socialLinks"],
  "directory-custom": ["values"],
  "directory-rich-text": ["body", "format"],
  "directory-google-map": ["locationQuery", "caption"],
  "directory-opening-hours": ["title", "sourceMode", "placeId", "hoursText"],
  "directory-related-listing": [],
}

const BLOCK_BREAK =
  /<\/?(?:p|div|h[1-6]|li|ul|ol|blockquote|section|article|br)\b[^>]*>/gi
const TAG = /<[^>]*>/g
const SCRIPT = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi
const ENTITY = /&(?:amp|lt|gt|quot|#39|nbsp);/g
const ENTITIES = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {}
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

function hasValue(value) {
  if (value === undefined || value === null) return false
  if (typeof value === "string" || Array.isArray(value)) return value.length > 0
  if (typeof value === "object") return Object.keys(value).length > 0
  return true
}

export function mergeDirectoryBlocks(templateValue, listingValue) {
  const template = record(templateValue)
  const values = record(listingValue)
  const merged = {}

  for (const [key, rawBlock] of Object.entries(template)) {
    if (key.startsWith("_")) {
      merged[key] = clone(rawBlock)
      continue
    }
    const block = record(rawBlock)
    if (typeof block.type !== "string") continue
    const blockId = typeof block.id === "string" && block.id ? block.id : key
    const valueBlock = record(values[blockId] ?? values[key])
    const valueContent = record(valueBlock.content)
    const content = { ...record(clone(block.content)) }
    for (const field of VALUE_KEYS[block.type] ?? []) {
      if (hasValue(valueContent[field]))
        content[field] = clone(valueContent[field])
    }
    merged[blockId] = { ...clone(block), id: blockId, content }
  }

  return merged
}

export function htmlToWrittenBody(html) {
  if (typeof html !== "string" || !html.trim())
    return { type: "doc", content: [] }
  const text = html
    .replace(SCRIPT, " ")
    .replace(BLOCK_BREAK, "\n")
    .replace(TAG, " ")
    .replace(ENTITY, (value) => ENTITIES[value] ?? " ")
  const content = text
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((line) => ({
      type: "paragraph",
      content: [{ type: "text", text: line.slice(0, 20_000) }],
    }))
  return { type: "doc", content }
}

function cleanText(value, maximum = 2_000) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : ""
}

function menuLink(type, value, index, label = "") {
  const cleaned = cleanText(value)
  if (!cleaned) return null
  return {
    id: `menu-${index + 1}`,
    type,
    label: cleanText(label, 100),
    value: cleaned,
  }
}

export function contactLinksFromCore(coreValue) {
  const core = record(coreValue)
  const links = []
  for (const raw of Array.isArray(core.menuLinks) ? core.menuLinks : []) {
    const link = record(raw)
    if (link.type === "claim") continue
    links.push(
      menuLink(
        ["phone", "website", "email", "directions", "custom"].includes(
          link.type
        )
          ? link.type
          : "custom",
        link.value,
        links.length,
        link.label
      )
    )
  }
  for (const [type, fields] of Object.entries({
    phone: ["phone", "phoneNumber"],
    website: ["website", "websiteUrl"],
    email: ["email", "emailAddress"],
    directions: ["directions", "directionsUrl"],
  })) {
    const value = fields
      .map((field) => core[field])
      .find((item) => cleanText(item))
    if (
      value &&
      !links.some(
        (link) => link?.type === type && link.value === cleanText(value)
      )
    ) {
      links.push(menuLink(type, value, links.length))
    }
  }

  const socialLinks = (Array.isArray(core.socialLinks) ? core.socialLinks : [])
    .map((raw, index) => {
      const link = record(raw)
      const platform = cleanText(link.platform, 100)
      const url = cleanText(link.url)
      return platform || url
        ? { id: `social-${index + 1}`, platform, url }
        : null
    })
    .filter(Boolean)

  return {
    address: cleanText(core.address, 300),
    menuLinks: links.filter(Boolean).slice(0, 20),
    socialLinks: socialLinks.slice(0, 20),
  }
}

export function ratingFromCore(value) {
  if (value === undefined || value === null || value === "") return null
  const text = String(value).trim()
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(text)) return null
  const rating = Number(text)
  return Number.isFinite(rating) &&
    rating >= 0 &&
    rating <= 5 &&
    (rating * 10) % 1 === 0
    ? rating
    : null
}

function blocksOfType(blocks, type) {
  return Object.values(record(blocks)).filter(
    (block) => record(block).type === type
  )
}

function firstHttpImage(value, field = "") {
  if (typeof value === "string") {
    if (!/^https?:\/\//i.test(value)) return ""
    return /image|photo|logo|featured/i.test(field) ||
      /\.(?:jpe?g|png|gif|webp)(?:[?#]|$)/i.test(value)
      ? value
      : ""
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstHttpImage(item, field)
      if (found) return found
    }
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      const found = firstHttpImage(item, key)
      if (found) return found
    }
  }
  return ""
}

export function imageUrlsFromListing(row, mergedBlocks) {
  const urls = new Set()
  const visit = (value, field = "") => {
    if (typeof value === "string") {
      if (
        /^https?:\/\//i.test(value) &&
        (/image|photo|logo|featured/i.test(field) ||
          /\.(?:jpe?g|png|gif|webp)(?:[?#]|$)/i.test(value))
      ) {
        urls.add(value.trim())
      }
      return
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item, field)
    } else if (value && typeof value === "object") {
      for (const [key, item] of Object.entries(value)) visit(item, key)
    }
  }
  visit(row.featuredImage, "featuredImage")
  visit(mergedBlocks)
  return [...urls]
}

export function translateListing(row, mergedBlocks) {
  const coreBlock = blocksOfType(mergedBlocks, "directory-core")[0]
  const core = record(record(coreBlock).content)
  const rich = blocksOfType(mergedBlocks, "directory-rich-text")
  const richHtml = rich
    .map((block) => cleanText(record(block).content?.body, 100_000))
    .filter(Boolean)
    .join("\n")
  const title = cleanText(core.name || core.title || row.title, 200)
  const plainBody = htmlToWrittenBody(richHtml)
  const bodyText = (plainBody.content ?? [])
    .map((paragraph) => paragraph.content?.[0]?.text ?? "")
    .join(" ")
  const featuredImage =
    cleanText(row.featuredImage) ||
    firstHttpImage(core) ||
    firstHttpImage(mergedBlocks)

  return {
    title,
    slug: cleanText(row.slug, 160),
    metaDescription:
      cleanText(row.metaDescription, 300) || bodyText.slice(0, 300),
    rating: ratingFromCore(core.rating),
    status: row.status === "draft" ? "draft" : "published",
    displayOrder: Number.isFinite(Number(row.displayOrder))
      ? Math.trunc(Number(row.displayOrder))
      : 0,
    featuredImage,
    contactLinks: contactLinksFromCore(core),
    body: plainBody,
  }
}

export function droppedBlocks(mergedBlocks, row = {}) {
  const openingHours = blocksOfType(mergedBlocks, "directory-opening-hours")
  const maps = blocksOfType(mergedBlocks, "directory-google-map")
  const custom = Object.values(record(mergedBlocks)).filter((block) => {
    const type = record(block).type
    return (
      typeof type === "string" &&
      ![
        "directory-core",
        "directory-rich-text",
        "directory-opening-hours",
        "directory-google-map",
      ].includes(type)
    )
  })
  const coreBlock = blocksOfType(mergedBlocks, "directory-core")[0]
  const coreContent = record(record(coreBlock).content)
  const unsupportedCore =
    hasValue(coreContent.rating) && ratingFromCore(coreContent.rating) === null
    ? [{ type: "directory-core-rating", rating: clone(coreContent.rating) }]
    : []
  const coordinates = []
  if (row.latitude != null || row.longitude != null) {
    coordinates.push({
      latitude: row.latitude ?? null,
      longitude: row.longitude ?? null,
    })
  }
  coordinates.push(...maps)
  return { openingHours, coordinates, custom, unsupportedCore }
}

export function validateCategoryTree(categories) {
  const byId = new Map(categories.map((category) => [category.id, category]))
  for (const category of categories) {
    const seen = new Set([category.id])
    let parentId = category.parentId
    while (parentId) {
      if (!byId.has(parentId))
        throw new Error(
          `Category ${category.id} has a missing parent ${parentId}.`
        )
      if (seen.has(parentId))
        throw new Error(`Category ${category.id} is in a parent cycle.`)
      seen.add(parentId)
      parentId = byId.get(parentId).parentId
    }
  }
}

export function safeSlug(value, fallback) {
  const slug = cleanText(value || fallback, 160)
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .replace(/[\s-]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 160)
  if (!slug) throw new Error("A source item has no usable slug or title.")
  return slug
}

export function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson)
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableJson(value[key])])
  )
}

export function isPrivateAddress(address) {
  if (!isIP(address)) return true
  const lower = address.toLowerCase()
  if (lower.startsWith("::")) return true
  if (address.includes(":")) {
    return (
      lower === "::" ||
      lower === "::1" ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      /^fe[89ab]/.test(lower) ||
      lower.startsWith("ff") ||
      lower.startsWith("2001:db8:")
    )
  }
  const parts = address.split(".").map(Number)
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    parts[0] === 0 ||
    parts[0] >= 224 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
    (parts[0] === 192 &&
      (parts[1] === 168 ||
        parts[1] === 0 ||
        (parts[1] === 0 && parts[2] === 2))) ||
    (parts[0] === 198 &&
      (parts[1] === 18 ||
        parts[1] === 19 ||
        (parts[1] === 51 && parts[2] === 100))) ||
    (parts[0] === 203 && parts[1] === 0 && parts[2] === 113)
  )
}
