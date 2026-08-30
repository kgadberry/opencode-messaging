/**
 * Watch mode: re-install the working tree into OpenCode on every save.
 *
 * Changes are detected by content hash rather than by filesystem event, so a
 * touch or a no-op save does no work and cannot start a feedback loop. Each
 * sync rewrites the installed copies, which OpenCode's own watcher notices —
 * both halves hot-reload with no restart.
 */
import { createHash } from "node:crypto"
import { watch } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { sync } from "./sync.ts"

const repo = path.resolve(import.meta.dirname, "..")
const source = path.join(repo, "src")

async function fingerprint() {
  const entries = await readdir(source, { recursive: true, withFileTypes: true })
  const files = entries
    .filter((entry) => entry.isFile() && /\.(ts|tsx)$/.test(entry.name))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort()

  const hash = createHash("sha1")
  for (const file of files) hash.update(file).update(await readFile(file))
  return hash.digest("hex")
}

await sync()
let current = await fingerprint()
let pending: NodeJS.Timeout | undefined

watch(source, { recursive: true }, () => {
  clearTimeout(pending)
  pending = setTimeout(async () => {
    const next = await fingerprint()
    if (next === current) return
    current = next
    await sync()
    console.log(`${new Date().toLocaleTimeString()}  reloaded`)
  }, 120)
})

console.log("installed. watching src/ — save to hot-reload OpenCode. ctrl-c to stop.")
