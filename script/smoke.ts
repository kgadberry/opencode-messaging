/**
 * End-to-end smoke test against the running OpenCode service.
 *
 * Unit tests cover the pure modules; this covers the parts that can only be
 * wrong in the real world — that the service registration file is where we
 * think it is, that its two undocumented read endpoints still return the
 * shapes we parse, and that both plugin halves register the surface a user
 * expects. It spends no model tokens: tools are invoked directly with a stub
 * context, so the only work the daemon does is answer read-only GETs.
 *
 * Run it after upgrading opencode2 — a shape change in `/api/session` or
 * `/api/session/active` is exactly the kind of break that unit tests cannot
 * see and that shows up as a plugin that quietly lists nothing.
 */
import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import process from "node:process"
import type { ToolContext } from "../src/lib/types.ts"

const repo = path.resolve(import.meta.dirname, "..")
const service = path.join(
  process.env.XDG_STATE_HOME ?? path.join(homedir(), ".local", "state"),
  "opencode",
  "service.json",
)

let failures = 0

async function check(name: string, run: () => unknown | Promise<unknown>) {
  try {
    const detail = await run()
    console.log(`  ok    ${name}${detail ? ` — ${detail}` : ""}`)
  } catch (error) {
    failures++
    console.log(`  FAIL  ${name} — ${error instanceof Error ? error.message : String(error)}`)
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

console.log(`smoke: ${repo}\n`)

// --- the service, as the plugin actually reaches it -------------------------

console.log("service")

const registration = await (async () => {
  const raw = JSON.parse(readFileSync(service, "utf8"))
  assert(typeof raw.url === "string" && raw.url.startsWith("http"), "no url in service.json")
  assert(typeof raw.password === "string", "no password in service.json")
  return raw as { url: string; password: string; version?: string; pid?: number }
})().catch((error) => {
  console.log(`  FAIL  ${service} — ${error.message}`)
  console.log("\nIs opencode2 running? Start a session, then re-run.")
  process.exit(1)
})

const get = async (route: string) => {
  const response = await fetch(`${registration.url}${route}`, {
    headers: {
      authorization: `Basic ${Buffer.from(`opencode:${registration.password}`).toString("base64")}`,
    },
  })
  assert(response.ok, `${route} returned ${response.status}`)
  return response.json()
}

await check("service.json is readable", () => `${registration.version ?? "?"} pid ${registration.pid ?? "?"}`)

let allSessions: { id: string; location?: { directory?: string } }[] = []

await check("GET /api/session returns { data: [...] }", async () => {
  const body = await get("/api/session")
  assert(Array.isArray(body.data), "expected body.data to be an array")
  assert(
    body.data.length === 0 || typeof body.data[0].id === "string",
    "sessions are missing the id field this plugin addresses them by",
  )
  allSessions = body.data
  return `${allSessions.length} sessions`
})

await check("GET /api/session/active returns { data: {...} }", async () => {
  const body = await get("/api/session/active")
  assert(body.data && typeof body.data === "object" && !Array.isArray(body.data), "expected a keyed object")
  return `${Object.keys(body.data).length} running`
})

// --- the server half --------------------------------------------------------

console.log("\nserver plugin")

interface Registered {
  name: string
  description: string
  options?: { permission?: string }
  execute: (input: any, context: ToolContext) => Promise<{ content: string }>
}

const tools = new Map<string, Registered>()
const plugin = (await import(path.join(repo, "src", "index.ts"))).default

await check("setup() registers its tools", async () => {
  await plugin.setup({
    options: {},
    tool: {
      transform: (fn: (draft: { add: (t: Registered) => void }) => void) =>
        fn({ add: (t) => tools.set(t.name, t) }),
    },
    session: {
      create: async () => ({ id: "ses_stub" }),
      synthetic: async () => undefined,
    },
    permission: {
      assert: async () => {
        throw new Error("smoke test must not invoke protected operations")
      },
    },
  })
  return [...tools.keys()].join(", ")
})

await check("all five tools are present", () => {
  for (const name of ["peer_list", "peer_read", "peer_send", "peer_broadcast", "peer_spawn"])
    assert(tools.has(name), `${name} was not registered`)
})

// Every send verb shares one action so denying it cannot be routed around by
// reaching for whichever verb was left enabled — the bug that caused a real
// broadcast loop during development.
await check("send verbs share the peer_send permission action", () => {
  for (const name of ["peer_send", "peer_broadcast", "peer_spawn"])
    assert(
      tools.get(name)?.options?.permission === "peer_send",
      `${name} declares ${tools.get(name)?.options?.permission ?? "no"} permission, expected peer_send`,
    )
  assert(tools.get("peer_read")?.options?.permission === "peer_read", "peer_read lost its own action")
  assert(!tools.get("peer_list")?.options?.permission, "peer_list should need no permission")
})

// The one live execution: peer_list from the perspective of a real session, so
// the HTTP reads, the directory filter and the formatting all run for real.
await check("peer_list executes against the live service", async () => {
  const self = allSessions[0]
  assert(self, "create a session before running the smoke test")
  const caller = { sessionID: self.id, agent: "build", messageID: "msg_smoke", id: "call_smoke" }
  const result = await tools.get("peer_list")!.execute({ all: true }, caller)
  assert(typeof result.content === "string" && result.content.length > 0, "empty result")
  assert(!("output" in result), "tools must return content only — output without a schema is rejected")
  return `${result.content.split("\n").length} lines`
})

await check("peer_read refuses to read the calling session", async () => {
  const caller = { sessionID: "ses_self", agent: "build", messageID: "msg_smoke", id: "call_smoke" }
  await tools
    .get("peer_read")!
    .execute({ session: "ses_self" }, caller)
    .then(
      () => {
        throw new Error("expected a refusal")
      },
      () => undefined,
    )
})

// The TUI half is JSX, which node's type stripping cannot load; its
// registration is asserted in test/tui.test.ts under vitest instead.

console.log(failures === 0 ? "\npassed" : `\n${failures} failed`)
process.exit(failures === 0 ? 0 : 1)
