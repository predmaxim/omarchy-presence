# Presence

A shell service with no window: facts about the user, for other services to decide on their own (Oma in `agent-speak` — whether you hear her; later the breaks).

It writes `$XDG_RUNTIME_DIR/predmaxim-presence.json` atomically on every change and every 30 s:

```json
{"at":1761350400,"idle_since":0,"locked":false,"mic":false,"camera":false,"video":false,"buds":"unknown","screencast":false}
```

| Field | Meaning | Source |
|---|---|---|
| `at` | when written, epoch seconds; older than 90 s — the service is gone | clock |
| `idle_since` | since when there is no input, epoch seconds; `0` — input now; after a shell restart a fresh (< 90 s) idle snapshot's value is kept | `IdleMonitor`, 5 s, ignoring inhibitors |
| `locked` | the screen is locked | `omarchy-hyprland-session-locked` |
| `mic` | an app records the microphone (not virtual streams, not Oma's `oma-ear`, not the shell's own level meters — the stock rule `AudioNodes.isShellLevelMeter`, node `quickshell` or `quickshell-peak-monitor`, as the stock microphone widget; an open audio panel or Oma's orb hearing you is no call) | PipeWire nodes |
| `camera` | the camera is open | `fuser /dev/video*` |
| `video` | video plays: a playing MPRIS player whose window inhibits idle (music doesn't inhibit, Orca inhibits but doesn't play) | `hyprctl clients -j`, `busctl --user` (`--auto-start=no`: an activatable player isn't started) |
| `buds` | `in` (at least one bud in an ear) / `out` (both out) / `unknown` — the output isn't Bluetooth earbuds (`bluez_output.*`) or there's no in-ear sensor | default PipeWire sink, `in_ear.py` |
| `screencast` | the screen is shared: a PipeWire node with `media.class` `Video/Source` and no `device.id` — the portal's screencast stream lives as long as the sharing (browser, Telemost, OBS through the portal); a camera has `device.id`. Documented keys, not the portal's node name; a virtual camera counts too (hiding too much is safe). Not covered: Omarchy's own recording (gpu-screen-recorder through kms, no portal), clients of wlr-screencopy without the portal | PipeWire nodes, on their change — no probe |

## Install

```sh
git clone https://github.com/predmaxim/omarchy-presence ~/Projects/omarchy/own/omarchy-presence
ln -s ~/Projects/omarchy/own/omarchy-presence ~/.config/omarchy/plugins/predmaxim.presence
```

Then add `{"id": "predmaxim.presence"}` to `plugins` in `~/.config/omarchy/shell.json` and restart the shell (`omarchy restart shell`). The in-ear sensor needs OpenFreebuds (`yay -S openfreebuds`); without it `buds` is `in`/`out` only by the output, otherwise `unknown`.

## In-ear sensor

`in_ear.py NAME ADDRESS` runs on the system `/usr/bin/python3` while the output is on the earbuds (name — the node's `node.description`, address — `api.bluez5.address`) and prints `in` / `out` / `unknown`. It reads the sensor through [OpenFreebuds](https://github.com/melianmiko/OpenFreebuds) (AUR `openfreebuds`): FreeBuds Pro 4 runs on its Pro 3 driver, whose in-ear handler stays silent, so the script adds its own for packets `2b 25` (every change) and `2b ac` (on connect): `param_1` — left, `param_2` — right, `1` — in an ear. No OpenFreebuds, a model it doesn't know, or the OpenFreebuds app already running (it holds the earbuds and port 19823) — `unknown` and exit 0, no retry until the output changes; a crash — retry in 30 s. While it runs, it is the OpenFreebuds server itself: the app opened later connects to it as a client. Other earbuds — another script with the same output.

Read by the `agent-speak` daemon (`presence::parse_facts`); a field it doesn't know yet is skipped, a field missing from an older snapshot is false. Tests: `node test.js`.
