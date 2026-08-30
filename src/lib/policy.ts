/**
 * Delivery policy, from this plugin's config options.
 *
 *   accept    "same-directory" (default) | "any" | "none"
 *   spawn     whether peer_spawn may create sessions (default true)
 *   fanout    maximum peer_broadcast recipients (default 10)
 *
 * `accept` defaults to "same-directory" so an agent cannot reach into work in
 * an unrelated project without the user opting in. It governs messaging
 * sessions that already exist; peer_spawn is deliberately not bound by it,
 * because starting your own session elsewhere does not interrupt anyone.
 *
 * This is the receiving side's consent, but it is enforced by the *sender*:
 * a synthetic message is injected directly into the target, so the recipient
 * never runs code that could refuse it. Within one user's daemon that is
 * coherent; it is not a defense against a sender that ignores it. Send-side
 * permission actions are the enforceable control.
 */
import type { OptionsSource, SessionLike } from "./types.ts"

export type Accept = "any" | "same-directory" | "none"

export interface Policy {
  readonly accept: Accept
  readonly spawn: boolean
  readonly fanout: number
}

export function policy(ctx: OptionsSource): Policy {
  const options = (ctx.options ?? {}) as Record<string, unknown>
  const accept = ["any", "same-directory", "none"].includes(options.accept as string)
    ? (options.accept as Accept)
    : "same-directory"
  return {
    accept,
    spawn: options.spawn !== false,
    fanout: Number.isFinite(options.fanout) ? Math.max(1, Math.floor(options.fanout as number)) : 10,
  }
}

export function assertDeliverable(ctx: OptionsSource, self: SessionLike | undefined, target: SessionLike) {
  const rules = policy(ctx)
  if (rules.accept === "none")
    throw new Error('peer messaging is disabled — set the opencode-messaging "accept" option to enable it')
  if (
    rules.accept === "same-directory" &&
    self?.location?.directory &&
    target?.location?.directory !== self.location.directory
  )
    throw new Error(
      `${target.id} works in ${target.location?.directory ?? "another directory"}, outside this session's ` +
        `${self.location.directory}. opencode-messaging only messages sessions in the same directory by default; ` +
        'set its "accept" option to "any" to allow cross-directory messages.',
    )
}
