import assert from "node:assert/strict"
import test from "node:test"

import { renderTagChips } from "./directory-tag-chips"

const TAGS_BODY =
  "<h2>Tags</h2>" +
  "<p><strong>Popular For:</strong> Breakfast, Lunch</p>" +
  "<p><strong>Atmosphere:</strong> Casual</p>"

test("renderTagChips turns each tag group into a label plus chips", () => {
  const html = renderTagChips(TAGS_BODY)

  // The group name loses its colon and becomes the label above the chips, the
  // same shape the Tags custom block renders.
  assert.match(html, /uppercase">Popular For<\/div>/)
  assert.match(html, /uppercase">Atmosphere<\/div>/)
  assert.equal(html.includes("Popular For:"), false)

  // One ticked chip per comma-separated value.
  assert.equal(html.match(/lucide-check/g)?.length, 3)
  assert.match(html, /rounded-full[^"]*">.*?Breakfast<\/span>/)
  assert.match(html, /rounded-full[^"]*">.*?Casual<\/span>/)
})

test("renderTagChips leaves a body with no Tags heading alone", () => {
  const body = "<h2>About</h2><p><strong>Popular For:</strong> Breakfast</p>"
  assert.equal(renderTagChips(body), body)
})

test("renderTagChips stops at the next heading", () => {
  const body = TAGS_BODY + "<h2>Hours</h2><p><strong>Monday:</strong> 9am, 5pm</p>"
  const html = renderTagChips(body)

  assert.match(html, /<p><strong>Monday:<\/strong> 9am, 5pm<\/p>/)
})

test("renderTagChips leaves a paragraph whose values carry markup untouched", () => {
  // The transform runs on already-sanitized HTML and only ever re-emits plain
  // text, so anything holding markup has to pass through exactly as it was.
  const body = '<h2>Tags</h2><p><strong>Popular For:</strong> <a href="/x">Breakfast</a></p>'
  assert.equal(renderTagChips(body), body)
})

test("renderTagChips leaves a group with no values untouched", () => {
  const body = "<h2>Tags</h2><p><strong>Popular For:</strong>   </p>"
  assert.equal(renderTagChips(body), body)
})
