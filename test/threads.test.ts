import { describe, expect, it } from "vitest"
import { envelope } from "../src/lib/envelope.ts"
import { threads } from "../src/lib/threads.ts"

const inbound = (from: string, message: string, created: number) => ({
  type: "synthetic",
  time: { created },
  metadata: { source: "peer", fromSessionID: from },
  text: envelope({ sessionID: from, agent: "build" }, "other", message),
})

const outbound = (to: string, message: string, created: number) => ({
  type: "assistant",
  time: { created },
  content: [
    { type: "text", text: "on it" },
    { type: "tool", name: "peer_send", state: { input: { to, message } } },
  ],
})

describe("threads", () => {
  it("returns nothing for empty or missing input", () => {
    expect(threads([])).toEqual([])
    expect(threads(undefined)).toEqual([])
  })

  it("groups inbound synthetics by fromSessionID, unwrapped", () => {
    const [thread, ...rest] = threads([inbound("ses_a", "hello there", 10)])
    expect(rest).toHaveLength(0)
    expect(thread).toEqual({
      peerID: "ses_a",
      entries: [{ direction: "in", text: "hello there", time: 10 }],
    })
  })

  it("groups outbound peer_send tool calls by state.input.to", () => {
    expect(threads([outbound("ses_b", "  ping  ", 20)])).toEqual([
      { peerID: "ses_b", entries: [{ direction: "out", text: "ping", time: 20 }] },
    ])
  })

  it("interleaves both directions oldest-first within a thread", () => {
    const result = threads([
      inbound("ses_a", "third", 30),
      outbound("ses_a", "first", 10),
      inbound("ses_a", "second", 20),
    ])
    expect(result).toHaveLength(1)
    expect(result[0]?.entries.map((e) => [e.direction, e.text, e.time])).toEqual([
      ["out", "first", 10],
      ["in", "second", 20],
      ["in", "third", 30],
    ])
  })

  it("orders threads by most recent activity first", () => {
    const result = threads([
      inbound("ses_old", "stale", 5),
      inbound("ses_new", "fresh", 100),
      inbound("ses_mid", "middle", 50),
    ])
    expect(result.map((t) => t.peerID)).toEqual(["ses_new", "ses_mid", "ses_old"])
  })

  it("ignores synthetics that are not peer messages", () => {
    expect(threads([{ type: "synthetic", text: '<shell command="ls">', time: { created: 1 } }])).toEqual([])
    expect(
      threads([{ type: "synthetic", metadata: { source: "peer" }, text: "no sender", time: { created: 1 } }]),
    ).toEqual([])
  })

  it("ignores tool calls that are not peer_send, and peer_send with no target", () => {
    const messages = [
      {
        type: "assistant",
        time: { created: 1 },
        content: [
          { type: "tool", name: "bash", state: { input: { to: "ses_a", message: "nope" } } },
          { type: "tool", name: "peer_send", state: { input: { message: "no target" } } },
          { type: "tool", name: "peer_send" },
        ],
      },
    ]
    expect(threads(messages)).toEqual([])
  })

  it("defaults a missing timestamp to zero and survives junk entries", () => {
    expect(
      threads([
        undefined,
        null,
        7,
        { type: "synthetic", metadata: { source: "peer", fromSessionID: "ses_a" } },
      ]),
    ).toEqual([{ peerID: "ses_a", entries: [{ direction: "in", text: "", time: 0 }] }])
  })
})
