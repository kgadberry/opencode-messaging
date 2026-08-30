/**
 * Transcript rendering for peer_read.
 *
 * Renders one history message as a single labelled block, or null to skip it.
 * Reasoning parts are dropped — they are the peer's private thinking, not what
 * it said. Shell messages collapse to their command so "what has this peer been
 * doing" stays legible without pasting whole command outputs.
 */
import { unwrap } from "./envelope.ts"
import { clamp } from "./format.ts"

interface TranscriptMessage {
  readonly type?: string
  readonly exit?: number
  readonly command?: unknown
  readonly text?: unknown
  readonly metadata?: { readonly fromSessionID?: string }
  readonly content?: unknown
}

interface ContentPart {
  readonly type?: string
  readonly text?: unknown
}

export function render(message: unknown): string | null {
  const entry = (message ?? {}) as TranscriptMessage

  if (entry.type === "shell") {
    const status = entry.exit === 0 ? "ok" : `exit ${entry.exit}`
    return `[shell] $ ${clamp(String(entry.command ?? "").trim(), 200)} (${status})`
  }

  if (entry.type === "synthetic") {
    const from = entry.metadata?.fromSessionID
    const body = String(entry.text ?? "").trim()

    if (from) {
      // Unwrap our own <peer> envelope so nested markup does not stack up.
      return `[peer ${from}] ${clamp(unwrap(body))}`
    }

    // Background shell results arrive as synthetic <shell> blocks rather than
    // shell-typed messages. Collapse them the same way, output and all.
    if (body.startsWith("<shell")) {
      const command = body.match(/command="([\s\S]*?)">\s*\n/)?.[1] ?? ""
      const exit = body.match(/Command exited with code (\d+)/)?.[1]
      const status = exit === undefined ? "running" : exit === "0" ? "ok" : `exit ${exit}`
      return `[shell] $ ${clamp(command.trim(), 200)} (${status})`
    }

    // Subagent completions are worth keeping, but only their reported text.
    if (body.startsWith("<subagent")) {
      const state = body.match(/state="([^"]*)"/)?.[1] ?? "done"
      const inner = body.replace(/^<subagent[^>]*>\n?/, "").replace(/\n?<\/subagent>$/, "")
      return `[subagent ${state}] ${clamp(inner.trim())}`
    }

    return `[system] ${clamp(body)}`
  }

  if (entry.type === "user") {
    const text = String(entry.text ?? "").trim()
    return text ? `[user] ${clamp(text)}` : null
  }

  if (entry.type === "assistant") {
    const text = (Array.isArray(entry.content) ? (entry.content as ContentPart[]) : [])
      .filter((part) => part?.type === "text" && typeof part.text === "string")
      .map((part) => part.text as string)
      .join("\n")
      .trim()
    return text ? `[assistant] ${clamp(text)}` : null
  }

  return null
}
