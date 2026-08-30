/**
 * Per-peer conversation threads, derived from one session's own messages.
 *
 * Inbound peer messages are synthetic messages tagged metadata.source="peer";
 * outbound ones are peer_send tool calls in assistant messages. Nothing extra
 * is stored, so both halves of the plugin can derive the same view.
 */
import { unwrap } from "./envelope.ts"

export type Direction = "in" | "out"

export interface Entry {
  readonly direction: Direction
  readonly text: string
  readonly time: number
}

export interface Thread {
  readonly peerID: string
  readonly entries: Entry[]
}

interface ThreadMessage {
  readonly type?: string
  readonly text?: unknown
  readonly time?: { readonly created?: number }
  readonly metadata?: { readonly source?: string; readonly fromSessionID?: string }
  readonly content?: unknown
}

interface ToolPart {
  readonly type?: string
  readonly name?: string
  readonly state?: { readonly input?: { readonly to?: string; readonly message?: unknown } }
}

/** Groups one session's messages into a two-way thread per peer, oldest first. */
export function threads(messages: readonly unknown[] | undefined): Thread[] {
  const grouped = new Map<string, Entry[]>()
  const add = (peerID: string, entry: Entry) => {
    const existing = grouped.get(peerID)
    if (existing) existing.push(entry)
    else grouped.set(peerID, [entry])
  }

  for (const raw of messages ?? []) {
    const message = (raw ?? {}) as ThreadMessage
    const time = message.time?.created ?? 0

    if (message.type === "synthetic" && message.metadata?.source === "peer") {
      const from = message.metadata.fromSessionID
      if (from) add(from, { direction: "in", text: unwrap(String(message.text ?? "")), time })
      continue
    }

    if (message.type === "assistant" && Array.isArray(message.content)) {
      for (const rawPart of message.content as unknown[]) {
        const part = (rawPart ?? {}) as ToolPart
        if (part.type !== "tool" || part.name !== "peer_send") continue
        const input = part.state?.input
        if (input?.to) add(input.to, { direction: "out", text: String(input.message ?? "").trim(), time })
      }
    }
  }

  return [...grouped.entries()]
    .map(([peerID, entries]) => ({ peerID, entries: entries.sort((a, b) => a.time - b.time) }))
    .sort((a, b) => (b.entries.at(-1)?.time ?? 0) - (a.entries.at(-1)?.time ?? 0))
}
