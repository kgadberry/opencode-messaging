/**
 * The wire format for a peer message.
 *
 * Outbound messages are wrapped so the recipient knows who sent it and how to
 * answer; inbound ones are unwrapped again on both halves of the plugin so a
 * thread reads as prose rather than markup.
 */
import type { SenderContext, SessionLike } from "./types.ts"

/** Wraps a message so the recipient knows who sent it and how to answer. */
export const envelope = (context: SenderContext, from: string, message: string) =>
  [
    `<peer from="${context.sessionID}" agent="${context.agent}" directory="${from}">`,
    message.trim(),
    "",
    `To reply, call peer_send with to="${context.sessionID}".`,
    "</peer>",
  ].join("\n")

/** Metadata carried alongside a synthetic message so the receiver can group it. */
export const provenance = (context: SenderContext, self: SessionLike | undefined) => ({
  source: "peer",
  fromSessionID: context.sessionID,
  fromAgent: context.agent,
  fromDirectory: self?.location?.directory ?? "",
})

/**
 * Strips the <peer> envelope and the trailing reply hint, leaving the message
 * body. Safe on text that was never wrapped.
 */
export function unwrap(text: string) {
  return text
    .replace(/^<peer[^>]*>\n?/, "")
    .replace(/\n?<\/peer>$/, "")
    .replace(/\n*To reply, call peer_send with to="[^"]*"\.\s*$/, "")
    .trim()
}
