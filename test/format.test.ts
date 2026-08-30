import { describe, expect, it } from "vitest"
import { ago, basename, clamp, MESSAGE_CHARS } from "../src/lib/format.ts"

describe("basename", () => {
  it("returns the last path segment", () => {
    expect(basename("/home/me/projects/opencode-messaging")).toBe("opencode-messaging")
  })

  it("ignores trailing slashes", () => {
    expect(basename("/home/me/projects/opencode-messaging/")).toBe("opencode-messaging")
  })

  it("falls back to the input when there is no segment", () => {
    expect(basename("")).toBe("")
    expect(basename("/")).toBe("/")
  })

  it("handles a bare name", () => {
    expect(basename("opencode-messaging")).toBe("opencode-messaging")
  })
})

describe("ago", () => {
  const now = 1_700_000_000_000
  const minutes = (n: number) => now - n * 60_000

  it("returns ? for a missing or zero timestamp", () => {
    expect(ago(undefined, now)).toBe("?")
    expect(ago(0, now)).toBe("?")
  })

  it("collapses under a minute to 'just now'", () => {
    expect(ago(now, now)).toBe("just now")
    expect(ago(now - 59_999, now)).toBe("just now")
  })

  it("reports minutes below an hour", () => {
    expect(ago(minutes(1), now)).toBe("1m ago")
    expect(ago(minutes(59), now)).toBe("59m ago")
  })

  it("reports hours below a day", () => {
    expect(ago(minutes(60), now)).toBe("1h ago")
    expect(ago(minutes(1439), now)).toBe("23h ago")
  })

  it("reports days beyond that", () => {
    expect(ago(minutes(1440), now)).toBe("1d ago")
    expect(ago(minutes(1440 * 9), now)).toBe("9d ago")
  })

  it("defaults to the wall clock", () => {
    expect(ago(Date.now())).toBe("just now")
  })

  it("does not go negative for a future timestamp", () => {
    expect(ago(now + 60_000, now)).toBe("just now")
  })
})

describe("clamp", () => {
  it("leaves text at or below the limit alone", () => {
    expect(clamp("abcde", 5)).toBe("abcde")
    expect(clamp("", 5)).toBe("")
  })

  it("truncates and reports the dropped count", () => {
    expect(clamp("abcdefgh", 5)).toBe("abcde… (3 more chars)")
  })

  it("defaults to the message budget", () => {
    const text = "x".repeat(MESSAGE_CHARS + 10)
    expect(clamp(text)).toBe(`${"x".repeat(MESSAGE_CHARS)}… (10 more chars)`)
    expect(clamp("x".repeat(MESSAGE_CHARS))).toBe("x".repeat(MESSAGE_CHARS))
  })
})
