import * as React from "react"

/**
 * Round an app's own block or widget, on the Admin dashboard or the CRM's
 * Overview: one that throws while it draws
 * says so in its own card, and the rest of the dashboard carries on.
 */
export class AdditionBoundary extends React.Component<
  { kind: "block" | "widget"; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error(`An app's ${this.props.kind} could not be drawn.`, error)
  }

  render() {
    if (this.state.failed) {
      return <p className="p-3 text-sm text-muted-foreground">This {this.props.kind} could not be drawn.</p>
    }
    return this.props.children
  }
}
