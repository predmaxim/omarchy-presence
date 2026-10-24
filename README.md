# Presence

A shell service with no window: facts about the user, for other services to decide on their own (Oma in `agent-speak` — whether you hear her; later the breaks).

It writes `$XDG_RUNTIME_DIR/predmaxim-presence.json` atomically on every change and every 30 s:

```json
{"at":1761350400,"idle_since":0,"locked":false,"mic":false,"camera":false,"video":false,"buds":"unknown"}
```

| Field | Meaning | Source |
|---|---|---|
| `at` | when written, epoch seconds; older than 90 s — the service is gone | clock |
| `idle_since` | since when there is no input, epoch seconds; `0` — input now | `IdleMonitor`, 5 s, ignoring inhibitors |
| `locked` | the screen is locked | `omarchy-hyprland-session-locked` |
| `mic` | an app records the microphone (not virtual streams, not Oma's `oma-ear`) | PipeWire nodes |
| `camera` | the camera is open | `fuser /dev/video*` |
| `video` | video plays: a playing MPRIS player whose window inhibits idle (music doesn't inhibit, Orca inhibits but doesn't play) | `hyprctl clients -j`, `busctl --user` |
| `buds` | `in` / `out` / `unknown`; `unknown` when the output isn't Bluetooth earbuds (`bluez_output.*`) or there's no in-ear sensor | default PipeWire sink |

Read by the `agent-speak` daemon (`presence::parse_facts`). Tests: `node test.js`.
