import { describe, expect, it } from "vitest"
import plugin from "../src/tui.tsx"

interface Command {
  id: string
  title: string
  slash?: { name: string }
  run: () => void
}

/** Registers the plugin against a stub host and reports what it claimed. */
function setup() {
  const slots: string[] = []
  const commands: Command[] = []
  const renders: ((props: { sessionID: string }) => unknown)[] = []

  plugin.setup({
    ui: {
      slot: (spec: { append: string; render: (props: { sessionID: string }) => unknown }) => {
        slots.push(spec.append)
        if (spec.append === "app") renders.push(spec.render)
      },
    },
    keymap: { layer: (build: () => { commands: Command[] }) => commands.push(...build().commands) },
    storage: { store: () => [{ sidebar: true }, () => undefined] },
    theme: {},
    data: {
      session: { message: { list: () => [] }, get: () => undefined, list: () => [], status: () => "idle" },
    },
  } as never)

  // Commands register from inside the component the app slot renders, so the
  // callback has to run for there to be anything to assert.
  for (const render of renders) render({ sessionID: "ses_test" })

  return { slots, commands }
}

describe("tui plugin", () => {
  it("claims the app and sidebar slots", () => {
    expect(setup().slots).toEqual(expect.arrayContaining(["app", "sidebar.content"]))
  })

  it("registers /messages and keeps /peers as an alias", () => {
    const slash = setup().commands.flatMap((command) => (command.slash ? [command.slash.name] : []))
    expect(slash).toContain("messages")
    expect(slash).toContain("peers")
  })

  it("gives every command a stable messaging-scoped id", () => {
    for (const command of setup().commands) expect(command.id).toMatch(/^messaging\./)
  })

  it("is registered under the package's own id", () => {
    expect(plugin.id).toBe("opencode-messaging.tui")
  })
})
