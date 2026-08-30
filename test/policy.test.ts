import { describe, expect, it } from "vitest"
import { assertDeliverable, policy } from "../src/lib/policy.ts"
import type { SessionLike } from "../src/lib/types.ts"

const here: SessionLike = { id: "ses_self", location: { directory: "/w/one" } }
const near: SessionLike = { id: "ses_near", location: { directory: "/w/one" } }
const far: SessionLike = { id: "ses_far", location: { directory: "/w/two" } }

describe("policy", () => {
  it("defaults to same-directory, fanout 10, spawn enabled", () => {
    expect(policy({})).toEqual({ accept: "same-directory", spawn: true, fanout: 10 })
    expect(policy({ options: {} })).toEqual({ accept: "same-directory", spawn: true, fanout: 10 })
  })

  it("accepts the three known accept values", () => {
    expect(policy({ options: { accept: "any" } }).accept).toBe("any")
    expect(policy({ options: { accept: "none" } }).accept).toBe("none")
    expect(policy({ options: { accept: "same-directory" } }).accept).toBe("same-directory")
  })

  it("falls back to same-directory for an unknown accept value", () => {
    expect(policy({ options: { accept: "everyone" } }).accept).toBe("same-directory")
    expect(policy({ options: { accept: 7 } }).accept).toBe("same-directory")
  })

  it("only disables spawn on an explicit false", () => {
    expect(policy({ options: { spawn: false } }).spawn).toBe(false)
    expect(policy({ options: { spawn: true } }).spawn).toBe(true)
    expect(policy({ options: { spawn: "no" } }).spawn).toBe(true)
  })

  it("floors fanout at 1 and to an integer, ignoring non-numbers", () => {
    expect(policy({ options: { fanout: 3 } }).fanout).toBe(3)
    expect(policy({ options: { fanout: 3.9 } }).fanout).toBe(3)
    expect(policy({ options: { fanout: 0 } }).fanout).toBe(1)
    expect(policy({ options: { fanout: -5 } }).fanout).toBe(1)
    expect(policy({ options: { fanout: "8" } }).fanout).toBe(10)
    expect(policy({ options: { fanout: Number.POSITIVE_INFINITY } }).fanout).toBe(10)
  })
})

describe("assertDeliverable", () => {
  it("allows a same-directory peer by default", () => {
    expect(() => assertDeliverable({}, here, near)).not.toThrow()
  })

  it("rejects a cross-directory peer by default", () => {
    expect(() => assertDeliverable({}, here, far)).toThrow(/only messages sessions in the same directory/)
    expect(() => assertDeliverable({}, here, far)).toThrow(/ses_far works in \/w\/two/)
  })

  it("allows a cross-directory peer when accept is any", () => {
    expect(() => assertDeliverable({ options: { accept: "any" } }, here, far)).not.toThrow()
  })

  it("rejects everything when accept is none", () => {
    const ctx = { options: { accept: "none" } }
    expect(() => assertDeliverable(ctx, here, near)).toThrow(/peer messaging is disabled/)
    expect(() => assertDeliverable(ctx, here, far)).toThrow(/peer messaging is disabled/)
  })

  it("allows delivery when the sender's own directory is unknown", () => {
    expect(() => assertDeliverable({}, undefined, far)).not.toThrow()
    expect(() => assertDeliverable({}, { id: "ses_self" }, far)).not.toThrow()
  })

  it("names 'another directory' when the target has none", () => {
    expect(() => assertDeliverable({}, here, { id: "ses_x" })).toThrow(/ses_x works in another directory/)
  })
})
