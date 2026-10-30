# opencode-messaging

Cross-session messaging for **OpenCode 2**. Sessions running in the same background
service can list each other, read each other's transcripts, send each other messages,
and start new sessions elsewhere — with a `/messages` view in the TUI for reading the
threads that result.

OpenCode 2 runs every session inside one daemon and already has a durable per-session
inbox, built so a finished subagent can wake its parent. Messaging another session is
the same operation with a different caller, so this is a plugin — no fork, no patch.

> Requires OpenCode 2 (`opencode2`, the `beta` branch). It does **not** work on
> OpenCode 1, whose plugin API has no tool hook and no session access.

## Install

From npm, in `~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@jmfirth/opencode-messaging"],
}
```

Both halves install together: OpenCode loads the TUI half automatically for
package-sourced plugins. Nothing to restart — plugins hot-reload.

<details>
<summary>From a checkout instead</summary>

```bash
git clone https://github.com/jmfirth/opencode-messaging
cd opencode-messaging && npm install && npm run install:dev
```

This copies both entrypoints and the shared `lib/` into `~/.config/opencode/plugins/`.
`npm run uninstall:dev` removes them.
</details>

## Tools

| Tool             | What it does                                                            | Permission  |
| ---------------- | ----------------------------------------------------------------------- | ----------- |
| `peer_list`      | Enumerate other sessions — id, directory, agent, idle time, running     | —           |
| `peer_read`      | Read a peer's recent transcript. No side effects; works while it's busy | `peer_read` |
| `peer_send`      | Deliver a message to one peer, waking it                                | `peer_send` |
| `peer_broadcast` | Deliver the same message to many peers at once                          | `peer_send` |
| `peer_spawn`     | Create a session in another directory and give it an opening task       | `peer_send` |

Sending never blocks. The message lands in the peer's inbox, the peer wakes and handles
it in its own conversation, and any reply arrives back here as a message — so finish
your turn rather than waiting. Every message carries its sender's session id, which is
what makes replies work at all.

`delivery` controls when a message lands:

- **`queue`** (default) — when the peer would otherwise go idle.
- **`steer`** — at the peer's next safe turn boundary, interrupting mid-task. For
  genuinely urgent messages only.

### Why the tools say `peer` and the UI says Messages

Two audiences. Tool names are read by the _model_, and `peer` states the thing the model
must not get wrong: the recipient is another agent, not the user. `message_send` would
collide with the most overloaded word in a context window. The TUI is read by a _person_,
and from the outside this is just messages.

## TUI

- **`/messages`** — pick a session, then read that isolated two-way thread. `/peers` is
  an alias; it answers the adjacent question, "who _could_ I talk to".
- **Messages sidebar** — per-peer summary for the current session, with a live
  running/idle dot. Click through to the thread. Toggle it from the command palette.

Threads are derived live from the session's own messages — inbound ones are synthetic
messages tagged with sender provenance, outbound ones are `peer_send` calls. Nothing
extra is stored, so history survives exactly as long as the session does.

## Configuration

All optional, under the plugin's own options key:

```jsonc
{
  "plugin": ["@jmfirth/opencode-messaging"],
  "opencode-messaging": {
    "accept": "same-directory",
    "spawn": true,
    "fanout": 10,
    "rates": {
      "send": { "limit": 20, "minutes": 5 },
      "broadcast": { "limit": 3, "minutes": 2 },
    },
  },
}
```

| Option   | Default            | Meaning                                                                           |
| -------- | ------------------ | --------------------------------------------------------------------------------- |
| `accept` | `"same-directory"` | Which existing sessions may be messaged: `"any"`, `"same-directory"`, or `"none"` |
| `spawn`  | `true`             | Whether `peer_spawn` may create sessions                                          |
| `fanout` | `10`               | Maximum `peer_broadcast` recipients                                               |
| `rates`  | see above          | Per-sending-session budgets                                                       |

`accept` defaults to the guarded option so an agent can't reach into an unrelated
project until you say so. `peer_spawn` is deliberately _not_ bound by it — starting your
own session somewhere else interrupts nobody.

Session discovery follows pagination, and the caller is resolved directly by ID.
If its directory cannot be resolved, discovery and sending fail closed rather than
falling back to every project. Same-directory delivery also rejects recipients whose
directory is missing.

### Permissions

Standard OpenCode rules, under the `permissions` key (plural — `permission` is a legacy
v1 key and is silently ignored):

```jsonc
{
  "permissions": [
    { "action": "peer_read", "resource": "*", "effect": "allow" },
    { "action": "peer_send", "resource": "*", "effect": "ask" },
  ],
}
```

Every protected tool calls `permission.assert` before reading a transcript, sending a
message, or creating a session. `ask` waits for approval; a denial stops the operation.
Permission resources are:

| Tool             | Action      | Resource                            |
| ---------------- | ----------- | ----------------------------------- |
| `peer_read`      | `peer_read` | Target session ID                   |
| `peer_send`      | `peer_send` | Target session ID                   |
| `peer_broadcast` | `peer_send` | Every existing target session ID    |
| `peer_spawn`     | `peer_send` | Canonical absolute target directory |

Broadcast approval covers the whole batch before any message is sent. Rejecting one
recipient blocks the batch. Saved approvals use those exact resources, not `*`.
`peer_list` remains permission-free and returns session metadata, not transcripts.

All three sending verbs share the single `peer_send` action, the way `edit`, `write` and
`apply_patch` share `edit`. This is not tidiness — during development, denying only
`peer_send` left `peer_broadcast` enabled, the agent reached for it instead, peers
answered the same way, and two sessions thrashed. Denying outbound messaging has to deny
all of it or it denies nothing.

## Limits and honest caveats

- **Rate limits bound speed, not depth.** A real exchange runs many turns and never
  approaches them; two agents looping hit them in seconds. Counters are in memory and
  reset when the plugin reloads. `peer_spawn` is unlimited — it creates work rather than
  trading messages, so it can't be the thing that loops.
- **`accept` is cooperative, not enforced.** It's the receiving side's policy applied by
  the _sender_, because a synthetic message is injected straight into the target — the
  recipient never runs code that could refuse it. Within one user's daemon that's
  coherent. It is not a defense against a sender that ignores it. The send-side
  permission actions are the enforceable control.
- **`peer_list` with `all: true`** shows sessions that `peer_send` will then refuse under
  the default `accept`. That's deliberate: seeing what exists is harmless, and the error
  says how to allow it.
- **Reply depth is unlimited by design.** The useful answer is often several turns in.

## Development

```bash
npm run dev       # install into ~/.config/opencode and re-sync on save
npm run check     # typecheck + lint + format:check + test
npm run smoke     # exercise the live daemon (no model tokens spent)
```

`npm run dev` **copies** rather than symlinks, and that is load-bearing. OpenCode imports
each plugin entry through its path with a cache-busting `?mtime=` query, which stops the
runtime resolving a symlink to its real location — so a linked entry cannot find its own
`./lib/*` modules. Three other traps live in that loop, documented in `script/dev.ts`:
symlinked entries load but never hot-reload; `utimes` follows the link and touches your
source instead of nudging the copy; and on macOS, FSEvents reports a link-touch against
the _resolved_ path, which self-feeds into a reload storm. Change detection is by content
hash, so a no-op save does no work.

`npm run smoke` checks what unit tests structurally cannot: that the service registration
file is where the plugin looks for it, that `/api/session` and `/api/session/active` still
return the shapes it parses, and that all five tools register with the right permission
actions. Run it after upgrading `opencode2` — an API shape change surfaces as a plugin
that quietly lists nothing.

Pre-commit runs `oxlint --fix`, `prettier --write`, and `vitest related --run` on staged
files.

## License

MIT © jmfirth
