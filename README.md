# Presence

A shell service with no window: facts about the user, for other services to decide on their own (Oma in `agent-speak` — whether you hear her; later the breaks).

It writes `$XDG_RUNTIME_DIR/predmaxim-presence.json` atomically on every change and every 30 s:

```json
{"at":1761350400,"idle_since":0,"locked":false,"mic":false,"camera":false,"video":false,"buds":"unknown"}
```

| Field | Meaning | Source |
|---|---|---|
| `at` | when written, epoch seconds; older than 90 s — the service is gone | clock |
| `idle_since` | since when there is no input, epoch seconds; `0` — input now; after a shell restart a fresh (< 90 s) idle snapshot's value is kept | `IdleMonitor`, 5 s, ignoring inhibitors |
| `locked` | the screen is locked | `omarchy-hyprland-session-locked` |
| `mic` | an app records the microphone (not virtual streams, not Oma's `oma-ear`) | PipeWire nodes |
| `camera` | the camera is open | `fuser /dev/video*` |
| `video` | video plays: a playing MPRIS player whose window inhibits idle (music doesn't inhibit, Orca inhibits but doesn't play) | `hyprctl clients -j`, `busctl --user` (`--auto-start=no`: an activatable player isn't started) |
| `buds` | `in` (at least one bud in an ear) / `out` (both out) / `unknown` — the output isn't Bluetooth earbuds (`bluez_output.*`) or there's no in-ear sensor | default PipeWire sink, `in_ear.py` |

## In-ear sensor

`in_ear.py NAME ADDRESS` runs on the system `/usr/bin/python3` while the output is on the earbuds (name — the node's `node.description`, address — `api.bluez5.address`) and prints `in` / `out` / `unknown`. It reads the sensor through [OpenFreebuds](https://github.com/melianmiko/OpenFreebuds) (AUR `openfreebuds`): FreeBuds Pro 4 runs on its Pro 3 driver, whose in-ear handler stays silent, so the script adds its own for packets `2b 25` (every change) and `2b ac` (on connect): `param_1` — left, `param_2` — right, `1` — in an ear. No OpenFreebuds, a model it doesn't know, or the OpenFreebuds app already running (it holds the earbuds and port 19823) — `unknown` and exit 0, no retry until the output changes; a crash — retry in 30 s. While it runs, it is the OpenFreebuds server itself: the app opened later connects to it as a client. Other earbuds — another script with the same output.

Read by the `agent-speak` daemon (`presence::parse_facts`). Tests: `node test.js`.
