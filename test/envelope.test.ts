import { describe, expect, it } from "vitest"
import { envelope, provenance, unwrap } from "../src/lib/envelope.ts"

const context = { sessionID: "ses_abc", agent: "build" }

describe("envelope", () => {
  it("names the sender, the agent and the sending directory", () => {
    const wrapped = envelope(context, "opencode-messaging", "hello")
    expect(wrapped.split("\n")[0]).toBe('<peer from="ses_abc" agent="build" directory="opencode-messaging">')
    expect(wrapped.endsWith("</peer>")).toBe(true)
    expect(wrapped).toContain('To reply, call peer_send with to="ses_abc".')
  })

  it("trims the message body", () => {
    expect(envelope(context, "here", "  hello  ")).toContain("\nhello\n")
  })
})

describe("unwrap", () => {
  it("round-trips a wrapped message", () => {
    const message = "Can you check the migration?"
    expect(unwrap(envelope(context, "opencode-messaging", message))).toBe(message)
  })

  it("round-trips multi-line and markup-bearing bodies", () => {
    const message = "line one\n\nline two\n- a <b> item"
    expect(unwrap(envelope(context, "opencode-messaging", message))).toBe(message)
  })

  it("strips the reply hint even without the peer tags", () => {
    expect(unwrap('hello\n\nTo reply, call peer_send with to="ses_xyz".')).toBe("hello")
  })

  it("leaves unwrapped text alone apart from trimming", () => {
    expect(unwrap("  plain text  ")).toBe("plain text")
  })

  it("does not eat a body that merely mentions replying", () => {
    expect(unwrap("To reply, call peer_send with to=x. and then continue")).toBe(
      "To reply, call peer_send with to=x. and then continue",
    )
  })
})

describe("provenance", () => {
  it("carries the sender identity and directory", () => {
    expect(provenance(context, { id: "ses_abc", location: { directory: "/w/one" } })).toEqual({
      source: "peer",
      fromSessionID: "ses_abc",
      fromAgent: "build",
      fromDirectory: "/w/one",
    })
  })

  it("falls back to an empty directory when the sender is unknown", () => {
    expect(provenance(context, undefined).fromDirectory).toBe("")
  })
})
