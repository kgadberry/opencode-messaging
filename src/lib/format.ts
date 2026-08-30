/** Small formatting helpers shared by the tool surfaces. */

/** Default truncation budget for a single quoted message. */
export const MESSAGE_CHARS = 1_200

/** Last path segment of a directory, or the input when it has none. */
export const basename = (directory: string) => directory.split("/").filter(Boolean).pop() ?? directory

/**
 * Coarse relative age. `now` is injectable so callers (and tests) can pin the
 * clock; it defaults to the wall clock, which is what the tools use.
 */
export function ago(time: number | undefined, now: number = Date.now()) {
  if (!time) return "?"
  const minutes = Math.floor((now - time) / 60_000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`
  return `${Math.floor(minutes / 1440)}d ago`
}

/** Truncates with a visible count of what was dropped. */
export const clamp = (text: string, limit = MESSAGE_CHARS) =>
  text.length > limit ? `${text.slice(0, limit)}… (${text.length - limit} more chars)` : text
