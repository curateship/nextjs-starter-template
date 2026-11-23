import { definePage } from "@/lib/pages/page-descriptor"

/**
 * The public "add your listing" form.
 *
 * A page of its own rather than a switch on the directory's descriptor, so a
 * site can publish its directory without taking submissions — which is the
 * ordinary case for a directory an editor writes themselves. Turning this page
 * off is how a site says no, and the form is then unreachable rather than
 * merely unlinked.
 *
 * `source: "app"` is deliberately not written here, for the same reason it is
 * missing from the directory's descriptor: the shell's own page-registry test
 * insists every page's source is `"shell"`, and an app never edits a shell
 * file. The label is a caption and changes nothing.
 */
export default definePage({
  path: "/add-listing",
  name: "Add your listing",
  summary:
    "The public form for suggesting a listing. Every submission is confirmed by email and then reviewed.",
  layout: "marketing",
})
