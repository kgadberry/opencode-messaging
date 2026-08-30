/**
 * opencode-messaging (TUI) — see and read cross-session conversations.
 *
 * Pairs with the server plugin at ./index.ts, which provides the
 * peer_list / peer_read / peer_send tools. This half adds:
 *
 *   /messages         pick a peer, then read that isolated two-way thread
 *                     (/peers is an alias — it answers "who could I talk to")
 *   Messages sidebar  compact per-peer summary for the current session
 *
 * The tools stay peer_*: they are read by the model, and "peer" says the
 * recipient is another agent rather than the user. The human-facing surface
 * says Messages, because that is what this is from the outside.
 *
 * Everything is derived live from the current session's own messages —
 * inbound peer messages are synthetic messages tagged metadata.source="peer",
 * outbound ones are peer_send tool calls. Nothing extra is stored.
 */
import { createMemo, For, Show } from "solid-js"
import type { Plugin } from "@opencode-ai/plugin/tui"
import { basename } from "./lib/format.ts"
import { threads } from "./lib/threads.ts"

type Context = Plugin.Context

const clock = (time: number) =>
  time ? new Date(time).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : ""

/** The shared thread derivation, fed from the TUI's live message cache. */
const conversations = (context: Context, sessionID: string) =>
  threads(context.data.session.message.list(sessionID))

/** Human label for a peer session, falling back to the raw id when unknown. */
function label(context: Context, peerID: string) {
  const session = context.data.session.get(peerID)
  if (!session) return peerID
  const where = `${basename(session.location?.directory ?? "")}/${session.agent ?? "?"}`
  return session.title ? `${where} — ${session.title}` : where
}

function ThreadView(props: { context: Context; sessionID: string; peerID: string }) {
  const theme = props.context.theme
  // Re-derived from live session data, so the thread grows while it is open.
  const entries = createMemo(
    () => conversations(props.context, props.sessionID).find((t) => t.peerID === props.peerID)?.entries ?? [],
  )
  // The renderer knows the terminal size; clamp so the dialog fits short windows.
  const height = createMemo(() => Math.max(8, Math.min(28, (props.context.renderer?.height ?? 40) - 14)))

  const back = () => {
    props.context.ui.dialog.clear()
    void openMessages(props.context)
  }

  return (
    <box paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1} gap={1} flexDirection="column">
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text.subdued} onMouseUp={back}>
          ‹ messages
        </text>
        <text fg={theme.text.subdued} onMouseUp={() => props.context.ui.dialog.clear()}>
          esc
        </text>
      </box>

      <box flexDirection="column">
        <text fg={theme.text.default}>
          <b>{label(props.context, props.peerID)}</b>
        </text>
        <text fg={theme.text.subdued}>{props.peerID}</text>
      </box>

      <Show
        when={entries().length > 0}
        fallback={<text fg={theme.text.subdued}>No messages exchanged with this session yet.</text>}
      >
        <scrollbox height={height()} scrollbarOptions={{ visible: false }}>
          <box flexDirection="column" gap={1} paddingRight={1}>
            <For each={entries()}>
              {(entry) => (
                <box
                  flexDirection="column"
                  paddingLeft={1}
                  border={["left"]}
                  borderColor={
                    entry.direction === "out"
                      ? theme.text.feedback.success.default
                      : theme.text.feedback.warning.default
                  }
                >
                  <text fg={theme.text.subdued}>
                    {entry.direction === "out" ? "sent" : "received"} · {clock(entry.time)}
                  </text>
                  <markdown
                    width="100%"
                    content={entry.text}
                    internalBlockMode="top-level"
                    conceal={true}
                    fg={theme.markdown?.text ?? theme.text.default}
                  />
                </box>
              )}
            </For>
          </box>
        </scrollbox>
      </Show>
    </box>
  )
}

/** Peer picker: sessions this one has talked to first, then everyone reachable. */
async function openMessages(context: Context) {
  const route = context.ui.router.current()
  if (route.type !== "session") {
    context.ui.toast.show({ message: "Open a session to view its messages.", variant: "warning" })
    return
  }

  const sessionID = route.sessionID
  const talked = conversations(context, sessionID)
  const seen = new Set(talked.map((thread) => thread.peerID))
  const self = context.data.session.get(sessionID)

  const others = (context.data.session.list() ?? [])
    .filter((s) => s.id !== sessionID && !s.parentID && !seen.has(s.id))
    .filter((s) => !self || s.location?.directory === self.location?.directory)
    .sort((a, b) => (b.time?.updated ?? 0) - (a.time?.updated ?? 0))

  const options = [
    ...talked.map((thread) => ({
      title: label(context, thread.peerID),
      value: thread.peerID,
      category: "Conversations",
      description: `${thread.entries.length} message${thread.entries.length === 1 ? "" : "s"} · last ${clock(
        thread.entries.at(-1)?.time ?? 0,
      )}`,
    })),
    ...others.map((s) => ({
      title: label(context, s.id),
      value: s.id,
      category: "Other sessions",
      description: context.data.session.status(s.id) === "running" ? "running" : "idle",
    })),
  ]

  if (options.length === 0) {
    context.ui.toast.show({ message: "No other sessions to talk to.", variant: "info" })
    return
  }

  const choice = await context.ui.dialog.select({
    title: "Messages",
    placeholder: "Select a session",
    options,
  })
  if (!choice) return

  context.ui.dialog.set({ size: "large" })
  context.ui.dialog.show(() => <ThreadView context={context} sessionID={sessionID} peerID={choice} />)
}

function Sidebar(props: { context: Context; sessionID: string }) {
  const theme = props.context.theme
  const [settings] = props.context.storage.store("settings", { initial: { sidebar: true } })
  const list = createMemo(() => (settings.sidebar ? conversations(props.context, props.sessionID) : []))

  return (
    <Show when={list().length > 0}>
      <box flexDirection="column">
        <text fg={theme.text.default}>
          <b>Messages</b>
          <span style={{ fg: theme.text.subdued }}> ({list().length})</span>
        </text>
        <For each={list()}>
          {(thread) => (
            <box
              flexDirection="row"
              gap={1}
              minWidth={0}
              onMouseUp={() => {
                props.context.ui.dialog.set({ size: "large" })
                props.context.ui.dialog.show(() => (
                  <ThreadView context={props.context} sessionID={props.sessionID} peerID={thread.peerID} />
                ))
              }}
            >
              <text
                flexShrink={0}
                fg={
                  props.context.data.session.status(thread.peerID) === "running"
                    ? theme.text.feedback.success.default
                    : theme.text.subdued
                }
              >
                •
              </text>
              <text flexGrow={1} minWidth={0} fg={theme.text.default}>
                {label(props.context, thread.peerID)}
              </text>
              <text flexShrink={0} fg={theme.text.subdued}>
                {thread.entries.length}
              </text>
            </box>
          )}
        </For>
      </box>
    </Show>
  )
}

function Commands(props: { context: Context }) {
  const [settings, mutate] = props.context.storage.store("settings", { initial: { sidebar: true } })

  props.context.keymap.layer(() => ({
    mode: "global",
    commands: [
      {
        id: "messaging.open",
        title: "Messages",
        description: "Browse cross-session conversations",
        group: "Messages",
        slash: { name: "messages" },
        palette: true,
        run: () => void openMessages(props.context),
      },
      {
        // Alias. /messages reads as "conversations I have had", /peers as
        // "who could I talk to" — the picker answers both, so both names land.
        id: "messaging.peers",
        title: "Peers",
        description: "Browse cross-session conversations",
        group: "Messages",
        slash: { name: "peers" },
        bind: false,
        run: () => void openMessages(props.context),
      },
      {
        id: "messaging.sidebar",
        title: settings.sidebar ? "Hide messages in sidebar" : "Show messages in sidebar",
        group: "Messages",
        palette: true,
        bind: false,
        run: () =>
          void mutate((draft) => {
            draft.sidebar = !draft.sidebar
          }),
      },
    ],
  }))

  return null
}

export default {
  id: "opencode-messaging.tui",
  setup(context: Context) {
    context.ui.slot({ append: "app", render: () => <Commands context={context} /> })
    context.ui.slot({
      append: "sidebar.content",
      render: (props) => <Sidebar context={context} sessionID={props.sessionID} />,
    })
  },
}
