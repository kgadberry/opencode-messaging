import { beforeEach, describe, expect, it } from "vitest"
import { RATES, rateLimit, resetBuckets } from "../src/lib/rate.ts"

const START = 1_700_000_000_000
const minutes = (n: number) => START + n * 60_000

beforeEach(resetBuckets)

describe("RATES", () => {
  it("keeps the shipped defaults", () => {
    expect(RATES).toEqual({ send: { limit: 20, minutes: 5 }, broadcast: { limit: 3, minutes: 2 } })
  })
})

describe("rateLimit", () => {
  it("passes three broadcasts and throws on the fourth", () => {
    for (let i = 0; i < 3; i++) expect(() => rateLimit({}, "broadcast", "ses_a", START + i)).not.toThrow()
    expect(() => rateLimit({}, "broadcast", "ses_a", START + 3)).toThrow(/rate limited to 3 per 2 minutes/)
  })

  it("lets the send through again once the window expires", () => {
    for (let i = 0; i < 3; i++) rateLimit({}, "broadcast", "ses_a", START)
    expect(() => rateLimit({}, "broadcast", "ses_a", START)).toThrow()
    expect(() => rateLimit({}, "broadcast", "ses_a", minutes(2))).not.toThrow()
  })

  it("reports how long is left in the window", () => {
    for (let i = 0; i < 3; i++) rateLimit({}, "broadcast", "ses_a", START)
    expect(() => rateLimit({}, "broadcast", "ses_a", START + 30_000)).toThrow(/Wait 90s/)
  })

  it("counts each sending session separately", () => {
    for (let i = 0; i < 3; i++) rateLimit({}, "broadcast", "ses_a", START)
    expect(() => rateLimit({}, "broadcast", "ses_b", START)).not.toThrow()
  })

  it("counts each kind separately", () => {
    for (let i = 0; i < 3; i++) rateLimit({}, "broadcast", "ses_a", START)
    expect(() => rateLimit({}, "send", "ses_a", START)).not.toThrow()
  })

  it("allows twenty sends before refusing", () => {
    for (let i = 0; i < 20; i++) rateLimit({}, "send", "ses_a", START)
    expect(() => rateLimit({}, "send", "ses_a", START)).toThrow(/rate limited to 20 per 5 minutes/)
  })

  it("honours configured limits and windows", () => {
    const ctx = { options: { rates: { broadcast: { limit: 1, minutes: 1 } } } }
    rateLimit(ctx, "broadcast", "ses_a", START)
    expect(() => rateLimit(ctx, "broadcast", "ses_a", START)).toThrow(/rate limited to 1 per 1 minute /)
    expect(() => rateLimit(ctx, "broadcast", "ses_a", minutes(1))).not.toThrow()
  })

  it("ignores non-numeric configuration and floors at one", () => {
    const bad = { options: { rates: { broadcast: { limit: "2", minutes: null } } } }
    for (let i = 0; i < 3; i++) rateLimit(bad, "broadcast", "ses_a", START)
    expect(() => rateLimit(bad, "broadcast", "ses_a", START)).toThrow(/rate limited to 3 per 2 minutes/)

    resetBuckets()
    const zero = { options: { rates: { broadcast: { limit: 0, minutes: 0 } } } }
    rateLimit(zero, "broadcast", "ses_b", START)
    expect(() => rateLimit(zero, "broadcast", "ses_b", START)).toThrow(/rate limited to 1 per 1 minute /)
  })

  it("resetBuckets clears the counters", () => {
    for (let i = 0; i < 3; i++) rateLimit({}, "broadcast", "ses_a", START)
    resetBuckets()
    expect(() => rateLimit({}, "broadcast", "ses_a", START)).not.toThrow()
  })
})
