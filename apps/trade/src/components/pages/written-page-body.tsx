import * as React from "react"

import {
  isSafeWrittenPageLink,
  type WrittenPageMark,
  type WrittenPageNode,
} from "@/lib/pages/written-page-body"
import { focusRing } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

/**
 * Draws an admin-written page's body.
 *
 * Every node becomes a React element. **Nothing here ever builds a string of
 * markup**, so there is no `dangerouslySetInnerHTML` and nothing an admin can
 * type — including a `<script>` tag — is anything other than the text of a
 * paragraph. A node type this file does not handle is simply not drawn.
 *
 * That is the whole safety story, and it is a property of the shape rather
 * than of a sanitiser being kept up to date: React escapes text, and text is
 * the only thing a text node can hold.
 */
export function WrittenPageBody({ body }: { body: WrittenPageNode }) {
  return <div className="grid gap-4">{renderChildren(body)}</div>
}

function renderChildren(node: WrittenPageNode): React.ReactNode {
  return (node.content ?? []).map((child, index) => (
    <RenderNode key={index} node={child} />
  ))
}

function RenderNode({ node }: { node: WrittenPageNode }): React.ReactElement | null {
  switch (node.type) {
    case "paragraph":
      return (
        <p className="text-sm leading-relaxed text-foreground">
          {renderChildren(node)}
        </p>
      )

    case "heading": {
      // The page's own title is the h1, so a body heading starts below it —
      // both for how it reads and so the page has one outline, not two.
      const level = node.attrs?.level === 4 ? 4 : node.attrs?.level === 3 ? 3 : 2
      const Tag = (`h${level}` as const) satisfies "h2" | "h3" | "h4"
      const size =
        level === 2 ? "text-lg" : level === 3 ? "text-base" : "text-sm"
      return (
        <Tag className={`${size} font-semibold text-foreground`}>
          {renderChildren(node)}
        </Tag>
      )
    }

    case "bulletList":
      return (
        <ul className="grid gap-1 pl-5 text-sm text-foreground [&>li]:list-disc">
          {renderChildren(node)}
        </ul>
      )

    case "orderedList":
      return (
        <ol className="grid gap-1 pl-5 text-sm text-foreground [&>li]:list-decimal">
          {renderChildren(node)}
        </ol>
      )

    case "listItem":
      return <li className="leading-relaxed">{renderChildren(node)}</li>

    case "blockquote":
      return (
        <blockquote className="border-l-2 pl-4 text-sm text-muted-foreground">
          {renderChildren(node)}
        </blockquote>
      )

    case "hardBreak":
      return <br />

    case "text":
      return <RenderText node={node} />

    // "doc" is handled by the component above, and anything this file does not
    // know about is deliberately not drawn.
    default:
      return null
  }
}

function RenderText({ node }: { node: WrittenPageNode }): React.ReactElement {
  const text = node.text ?? ""
  const link = node.marks?.find(
    (mark): mark is WrittenPageMark & { attrs: { href: string } } =>
      mark.type === "link" && typeof mark.attrs?.href === "string"
  )

  let content: React.ReactNode = text
  if (node.marks?.some((mark) => mark.type === "bold")) {
    content = <strong className="font-semibold">{content}</strong>
  }
  if (node.marks?.some((mark) => mark.type === "italic")) {
    content = <em>{content}</em>
  }
  if (node.marks?.some((mark) => mark.type === "strike")) {
    content = <s>{content}</s>
  }

  // Checked again here even though the stored body was already cleaned: this
  // renders on a public page, and the check costs nothing next to being the
  // one place a bad address could still reach a browser.
  if (link && isSafeWrittenPageLink(link.attrs.href)) {
    return (
      <a
        href={link.attrs.href}
        className={cn(
          "rounded-sm underline underline-offset-2 hover:text-primary",
          focusRing
        )}
        // An admin's link can point anywhere, so it never gets to speak for
        // this app in the page it opens.
        rel="noreferrer nofollow"
      >
        {content}
      </a>
    )
  }

  return <>{content}</>
}
