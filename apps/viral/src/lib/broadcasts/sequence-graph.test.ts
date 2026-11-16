import { describe, expect, it } from "vitest"

import { compileAutomationGraph } from "@/lib/automations/compile"
import {
  describeSequenceWait,
  newSequenceEmail,
  sequenceFromGraph,
  sequenceProblems,
  sequenceToGraph,
  type SequenceSteps,
} from "@/lib/broadcasts/sequence-graph"

function steps(): SequenceSteps {
  const first = { ...newSequenceEmail(true), id: "one", subject: "Welcome" }
  const second = { ...newSequenceEmail(false), id: "two", subject: "Day three", wait: { amount: 3, unit: "days" as const } }
  return { emails: [first, second] }
}

describe("sequenceToGraph", () => {
  it("builds the chain with no start of its own: email, wait, email", () => {
    const graph = sequenceToGraph(steps())
    expect(graph.nodes.map((node) => [node.id, node.kind])).toEqual([
      ["email-one", "sendEmail"],
      ["wait-two", "wait"],
      ["email-two", "sendEmail"],
    ])
    expect(graph.edges.map((edge) => `${edge.from}>${edge.to}`)).toEqual([
      "email-one>wait-two",
      "wait-two>email-two",
    ])
    expect(graph.nodes[1]!.settings).toEqual({ amount: 3, unit: "days", stopOnClick: false })
  })

  it("compiles with no errors once every email has a subject", () => {
    expect(compileAutomationGraph(sequenceToGraph(steps())).errors).toEqual([])
  })

  it("refuses to compile an email with no subject", () => {
    const draft = steps()
    draft.emails[1]!.subject = ""
    expect(compileAutomationGraph(sequenceToGraph(draft)).errors).not.toEqual([])
  })
})

describe("sequenceFromGraph", () => {
  it("reads back exactly the list it was given", () => {
    const original = steps()
    expect(sequenceFromGraph(sequenceToGraph(original))).toEqual(original)
  })

  it("gives null for a chain it did not draw", () => {
    const graph = sequenceToGraph(steps())
    expect(sequenceFromGraph({ ...graph, nodes: graph.nodes.slice(1) })).toBeNull()
    expect(
      sequenceFromGraph({ ...graph, edges: [...graph.edges, { id: "extra", from: "email-one", sourcePort: "then", to: "email-two" }] })
    ).toBeNull()
    expect(
      sequenceFromGraph({
        ...graph,
        nodes: [{ id: "start", kind: "joinedSegment", x: 0, y: 0, settings: {} }, ...graph.nodes],
        edges: [{ id: "s", from: "start", sourcePort: "then", to: "email-one" }, ...graph.edges],
      })
    ).toBeNull()
    expect(
      sequenceFromGraph({ ...graph, nodes: [...graph.nodes, { id: "loose", kind: "wait", x: 0, y: 0, settings: {} }] })
    ).toBeNull()
  })
})

describe("sequenceProblems", () => {
  it("names each email that cannot go out", () => {
    const draft = steps()
    draft.emails[0]!.subject = ""
    draft.emails[1]!.wait = { amount: 0, unit: "hours" }
    expect(sequenceProblems(draft)).toEqual([
      "Email 1 needs a subject.",
      "Email 2 needs a wait of at least 1 hour.",
    ])
  })

  it("has nothing to say about a sequence ready to go", () => {
    expect(sequenceProblems(steps())).toEqual([])
  })

  it("refuses a wait longer than 60 days", () => {
    const draft = steps()
    draft.emails[1]!.wait = { amount: 61, unit: "days" }
    expect(sequenceProblems(draft)).toEqual(["Email 2 waits longer than 60 days."])
  })
})

describe("describeSequenceWait", () => {
  it("says the wait the way the card shows it", () => {
    expect(describeSequenceWait({ amount: 0, unit: "days" })).toBe("Right away")
    expect(describeSequenceWait({ amount: 3, unit: "days" })).toBe("3 days later")
    expect(describeSequenceWait({ amount: 1, unit: "hours" })).toBe("1 hour later")
  })
})
