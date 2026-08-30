/**
 * Per-session rate limits, keyed by sending session.
 *
 * These bound how *fast* an agent can send, never how far a conversation may
 * go: a genuine exchange runs many turns and never approaches them, while two
 * agents thrashing hit them within seconds. Depth is deliberately unlimited —
 * the answer often arrives several turns in.
 *
 * peer_spawn is deliberately unlimited: it creates new work rather than
 * trading messages, so it cannot be the thing that loops.
 *
 * Counters live in memory, so they reset when the plugin reloads or the
 * service restarts. That is fine for runaway protection.
 */
import type { OptionsSource } from "./types.ts"

export type RateKind = "send" | "broadcast"

export interface Rate {
  readonly limit: number
  readonly minutes: number
}

export const RATES: Record<RateKind, Rate> = {
  send: { limit: 20, minutes: 5 },
  broadcast: { limit: 3, minutes: 2 },
}

const buckets = new Map<string, number[]>()

/** Drops every recorded hit. Tests use this; the runtime never needs it. */
export function resetBuckets() {
  buckets.clear()
}

/**
 * Records one send, throwing when the sending session is over budget.
 *
 * `now` is injectable so tests can advance the window without real timers; it
 * defaults to the wall clock, which is what the tools use.
 */
export function rateLimit(ctx: OptionsSource, kind: RateKind, sessionID: string, now: number = Date.now()) {
  const rates = (ctx.options?.rates ?? {}) as Record<string, Partial<Rate> | undefined>
  const configured = rates[kind] ?? {}
  const limit = Number.isFinite(configured.limit)
    ? Math.max(1, configured.limit as number)
    : RATES[kind].limit
  const minutes = Number.isFinite(configured.minutes)
    ? Math.max(1, configured.minutes as number)
    : RATES[kind].minutes
  const window = minutes * 60_000

  const key = `${kind}:${sessionID}`
  const hits = (buckets.get(key) ?? []).filter((at) => now - at < window)

  if (hits.length >= limit) {
    const wait = Math.ceil((window - (now - (hits[0] ?? now))) / 1000)
    throw new Error(
      `peer_${kind} is rate limited to ${limit} per ${minutes} minute${minutes === 1 ? "" : "s"} per session ` +
        `and this session has used them. Wait ${wait}s, or raise the opencode-messaging "rates" option. ` +
        "This guards against two agents messaging each other in a loop; it does not limit how long a " +
        "genuine exchange may run.",
    )
  }

  hits.push(now)
  buckets.set(key, hits)
}
