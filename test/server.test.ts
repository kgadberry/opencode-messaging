import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { realpathSync } from "node:fs"
import plugin from "../src/index.ts"
import { resetBuckets } from "../src/lib/rate.ts"
import type { SessionLike } from "../src/lib/types.ts"

vi.mock("node:fs", () => ({
  readFileSync: vi.fn(() => JSON.stringify({ url: "http://service.test", password: "test-only" })),
  statSync: vi.fn(() => ({ isDirectory: () => true })),
  realpathSync: vi.fn((path: string) => path),
}))

type Context = Parameters<typeof plugin.setup>[0]
type ToolDraft = Parameters<Parameters<Context["tool"]["transform"]>[0]>[0]
type Registered = Parameters<ToolDraft["add"]>[0]

const caller = { sessionID: "ses_self", agent: "build", messageID: "msg_test", id: "call_test" }
const self: SessionLike = { id: caller.sessionID, location: { directory: "/work/source" } }
const near: SessionLike = { id: "ses_near", location: { directory: "/work/source" } }
const other: SessionLike = { id: "ses_other", location: { directory: "/work/source" } }
const far: SessionLike = { id: "ses_far", location: { directory: "/work/unrelated" } }

let tools: Map<string, Registered>
let records: Map<string, SessionLike>
let pages: Map<string, { data: SessionLike[]; cursor?: { next?: string } }>
let requests: string[]
const assertPermission = vi.fn(async (_input: unknown) => {})
const create = vi.fn(async (_input: unknown) => ({ id: "ses_created" }))
const synthetic = vi.fn(async (_input: unknown) => {})

beforeEach(async () => {
  vi.clearAllMocks()
  assertPermission.mockImplementation(async () => {})
  vi.mocked(realpathSync).mockImplementation((path) => String(path))
  resetBuckets()
  tools = new Map()
  records = new Map([self, near, other, far].map((session) => [session.id, session]))
  pages = new Map([["", { data: [self, near, other, far] }]])
  requests = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const url = new URL(input)
      requests.push(url.pathname + url.search)
      let body: unknown
      if (url.pathname === "/api/session") body = pages.get(url.searchParams.get("cursor") ?? "")
      else if (url.pathname === "/api/session/active") body = { data: {} }
      else if (url.pathname.endsWith("/message")) body = { data: [{ type: "user", text: "peer text" }] }
      else {
        const session = records.get(decodeURIComponent(url.pathname.split("/").at(-1)!))
        if (session) body = { data: session }
      }
      return new Response(JSON.stringify(body ?? {}), { status: body ? 200 : 404 })
    }),
  )
  await plugin.setup({
    options: {},
    tool: { transform: (fn) => fn({ add: (tool) => tools.set(tool.name, tool) }) },
    session: { create, synthetic },
    permission: { assert: assertPermission },
  })
})

afterEach(() => vi.unstubAllGlobals())

function execute(name: string, input: Record<string, unknown>) {
  return tools.get(name)!.execute(input, caller)
}

describe("permission enforcement", () => {
  const cases = [
    ["peer_read", { session: near.id }, "peer_read", [near.id]],
    ["peer_send", { to: near.id, message: "hello" }, "peer_send", [near.id]],
    ["peer_broadcast", { to: [near.id, other.id], message: "hello" }, "peer_send", [near.id, other.id]],
    ["peer_spawn", { directory: "/work/new", message: "hello" }, "peer_send", ["/work/new"]],
  ] as const

  it.each(cases)(
    "%s checks its concrete resources and tool-call provenance",
    async (name, input, action, resources) => {
      await execute(name, input)
      expect(assertPermission).toHaveBeenCalledExactlyOnceWith({
        action,
        resources,
        save: resources,
        sessionID: caller.sessionID,
        agent: caller.agent,
        source: { type: "tool", messageID: caller.messageID, id: caller.id },
      })
    },
  )

  it.each(cases)("%s propagates a denied approval before any protected effect", async (name, input) => {
    const denied = new Error("denied by resource rule")
    assertPermission.mockRejectedValueOnce(denied)
    await expect(execute(name, input)).rejects.toBe(denied)
    expect(create).not.toHaveBeenCalled()
    expect(synthetic).not.toHaveBeenCalled()
    expect(requests.some((path) => path.includes("/message?"))).toBe(false)
  })

  it("waits for approval before delivering any broadcast recipient", async () => {
    let approve!: () => void
    assertPermission.mockImplementationOnce(() => new Promise<void>((resolve) => (approve = resolve)))
    const pending = execute("peer_broadcast", { to: [near.id, other.id], message: "hello" })
    await vi.waitFor(() => expect(assertPermission).toHaveBeenCalledOnce())
    expect(synthetic).not.toHaveBeenCalled()
    approve()
    await pending
    expect(synthetic).toHaveBeenCalledTimes(2)
  })

  it("authorizes the canonical spawn directory rather than a symlink spelling", async () => {
    vi.mocked(realpathSync).mockReturnValue("/work/private")
    await execute("peer_spawn", { directory: "/work/alias", message: "hello" })
    expect(assertPermission).toHaveBeenCalledWith(
      expect.objectContaining({ resources: ["/work/private"], save: ["/work/private"] }),
    )
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ location: { directory: "/work/private" } }))
  })
})

describe("session discovery and directory isolation", () => {
  it("follows encoded cursors and filters peers using a directly resolved caller", async () => {
    pages = new Map([
      ["", { data: [far], cursor: { next: "next/page?x=1" } }],
      ["next/page?x=1", { data: [near] }],
    ])
    const result = await execute("peer_list", {})
    expect(result.content).toContain(near.id)
    expect(result.content).not.toContain(far.id)
    expect(requests).toContain(`/api/session/${self.id}`)
    expect(requests).toContain("/api/session?cursor=next%2Fpage%3Fx%3D1")
  })

  it("rejects a cross-directory send when the caller is absent from the listing", async () => {
    pages = new Map([["", { data: [far] }]])
    await expect(execute("peer_send", { to: far.id, message: "hello" })).rejects.toThrow(
      /outside this session/,
    )
    expect(synthetic).not.toHaveBeenCalled()
  })

  it("resolves an explicit recipient directly even outside the listing", async () => {
    pages = new Map([["", { data: [far] }]])
    await execute("peer_send", { to: near.id, message: "hello" })
    expect(requests).toContain(`/api/session/${near.id}`)
    expect(synthetic).toHaveBeenCalledWith(expect.objectContaining({ sessionID: near.id }))
  })

  it("broadcasts across pages only to same-directory top-level peers", async () => {
    pages = new Map([
      ["", { data: [far, near], cursor: { next: "later" } }],
      ["later", { data: [self, other, { ...near, id: "ses_child", parentID: self.id }] }],
    ])
    await execute("peer_broadcast", { message: "hello" })
    expect(assertPermission).toHaveBeenCalledWith(expect.objectContaining({ resources: [near.id, other.id] }))
    expect(synthetic.mock.calls.map(([input]) => (input as { sessionID: string }).sessionID)).toEqual([
      near.id,
      other.id,
    ])
  })

  it.each(["peer_list", "peer_send", "peer_broadcast", "peer_spawn"])(
    "%s fails closed when the caller cannot be resolved",
    async (name) => {
      records.delete(self.id)
      pages = new Map([["", { data: [far] }]])
      await expect(
        execute(name, {
          to: name === "peer_broadcast" ? [far.id] : far.id,
          directory: "/work/new",
          message: "hello",
        }),
      ).rejects.toThrow()
      expect(create).not.toHaveBeenCalled()
      expect(synthetic).not.toHaveBeenCalled()
    },
  )

  it.each([self.id, near.id])("rejects a send when %s has no directory", async (id) => {
    records.set(id, { id })
    await expect(execute("peer_send", { to: near.id, message: "hello" })).rejects.toThrow(/directory/)
    expect(synthetic).not.toHaveBeenCalled()
  })

  it("rejects a repeated cursor instead of looping or sending a partial broadcast", async () => {
    pages = new Map([
      ["", { data: [near], cursor: { next: "loop" } }],
      ["loop", { data: [other], cursor: { next: "loop" } }],
    ])
    await expect(execute("peer_broadcast", { message: "hello" })).rejects.toThrow(/cursor/)
    expect(synthetic).not.toHaveBeenCalled()
  })
})
