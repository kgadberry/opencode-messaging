import { describe, expect, it } from "vitest"
import { envelope } from "../src/lib/envelope.ts"
import { render } from "../src/lib/transcript.ts"

describe("render", () => {
  it("collapses a shell message to its command and status", () => {
    expect(render({ type: "shell", command: "  npm test  ", exit: 0 })).toBe("[shell] $ npm test (ok)")
    expect(render({ type: "shell", command: "npm test", exit: 2 })).toBe("[shell] $ npm test (exit 2)")
  })

  it("truncates a long shell command at 200 chars", () => {
    const command = "x".repeat(250)
    expect(render({ type: "shell", command, exit: 0 })).toBe(
      `[shell] $ ${"x".repeat(200)}… (50 more chars) (ok)`,
    )
  })

  it("collapses a background <shell> synthetic, output and all", () => {
    const text = ['<shell command="ls -la">', "total 0", "", "Command exited with code 0", "</shell>"].join(
      "\n",
    )
    expect(render({ type: "synthetic", text })).toBe("[shell] $ ls -la (ok)")
  })

  it("marks a still-running background shell", () => {
    expect(render({ type: "synthetic", text: '<shell command="sleep 60">\nrunning…' })).toBe(
      "[shell] $ sleep 60 (running)",
    )
  })

  it("reports a failed background shell exit code", () => {
    const text = '<shell command="false">\nnope\nCommand exited with code 1\n</shell>'
    expect(render({ type: "synthetic", text })).toBe("[shell] $ false (exit 1)")
  })

  it("collapses a <subagent> block to its reported text and state", () => {
    const text = '<subagent name="explore" state="completed">\nFound the bug in api.ts\n</subagent>'
    expect(render({ type: "synthetic", text })).toBe("[subagent completed] Found the bug in api.ts")
  })

  it("defaults an unlabelled subagent state to done", () => {
    expect(render({ type: "synthetic", text: "<subagent>\nall set\n</subagent>" })).toBe(
      "[subagent done] all set",
    )
  })

  it("unwraps an inbound <peer> envelope and drops the reply hint", () => {
    const message = "Are the migrations applied?"
    const text = envelope({ sessionID: "ses_from", agent: "build" }, "other", message)
    expect(render({ type: "synthetic", text, metadata: { fromSessionID: "ses_from" } })).toBe(
      `[peer ses_from] ${message}`,
    )
  })

  it("labels other synthetics as system", () => {
    expect(render({ type: "synthetic", text: "  the model was switched  " })).toBe(
      "[system] the model was switched",
    )
  })

  it("renders user text and skips empty user messages", () => {
    expect(render({ type: "user", text: " ship it " })).toBe("[user] ship it")
    expect(render({ type: "user", text: "   " })).toBeNull()
    expect(render({ type: "user" })).toBeNull()
  })

  it("extracts assistant text and drops reasoning parts", () => {
    const message = {
      type: "assistant",
      content: [
        { type: "reasoning", text: "private thinking" },
        { type: "text", text: "first" },
        { type: "tool", name: "peer_send" },
        { type: "text", text: "second" },
      ],
    }
    expect(render(message)).toBe("[assistant] first\nsecond")
  })

  it("skips an assistant message with no text parts", () => {
    expect(render({ type: "assistant", content: [{ type: "reasoning", text: "hm" }] })).toBeNull()
    expect(render({ type: "assistant", content: [] })).toBeNull()
    expect(render({ type: "assistant" })).toBeNull()
  })

  it("skips unknown, empty and missing messages", () => {
    expect(render({ type: "compaction" })).toBeNull()
    expect(render({})).toBeNull()
    expect(render(undefined)).toBeNull()
    expect(render(null)).toBeNull()
  })
})
