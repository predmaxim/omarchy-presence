// node test.js
const fs = require("fs")
const path = require("path")
const assert = require("assert")
const L = new Function(fs.readFileSync(path.join(__dirname, "logic.js"), "utf8").replace(".pragma library", "") +
  "; return { micBusy, anyPlaying, video, onBuds, budsState, parseInEar, idleSince, snapshot, changed, parseProbe }")()

// Microphone: an app records; virtual capture streams and Oma's own ear don't count.
assert.strictEqual(L.micBusy([{ isStream: true, isSink: false, properties: { "node.name": "oma-ear" } }]), false)
assert.strictEqual(L.micBusy([{ isStream: true, isSink: false, properties: {} }]), true)
assert.strictEqual(L.micBusy([{ isStream: true, isSink: false, properties: { "node.virtual": "true" } }]), false)
assert.strictEqual(L.micBusy([{ isStream: true, isSink: false, audio: { muted: true } }]), false)
assert.strictEqual(L.micBusy([null, { isStream: true, isSink: true }]), false)

assert.strictEqual(L.anyPlaying([{ isPlaying: false }, { isPlaying: true }]), true)
assert.strictEqual(L.anyPlaying([{ isPlaying: false }, null]), false)

assert.strictEqual(L.onBuds("bluez_output.00_11_22_33_44_55.1"), true)
assert.strictEqual(L.onBuds("alsa_output.pci-0000_00_1f.3.analog-stereo"), false)
assert.strictEqual(L.onBuds(undefined), false)
assert.deepStrictEqual([L.budsState(true, true), L.budsState(true, false), L.budsState(true, null), L.budsState(false, true)], ["in", "out", "unknown", "unknown"])

// in_ear.py's lines: "in" / "out", anything else — no sensor.
assert.deepStrictEqual(["in", "out", "unknown", ""].map(L.parseInEar), [true, false, null, null])

// A shell start keeps a fresh idle snapshot's time — a restart while away is no return.
const prev = (at, since) => JSON.stringify({ at: at, idle_since: since })
assert.strictEqual(L.idleSince(995, prev(980, 600), 1000), 600)
assert.strictEqual(L.idleSince(995, prev(980, 0), 1000), 995)     // input then
assert.strictEqual(L.idleSince(995, prev(910, 600), 1000), 995)   // 90 s old: the service was gone
assert.strictEqual(L.idleSince(995, "", 1000), 995)               // no file
assert.strictEqual(L.idleSince(995, "junk", 1000), 995)

// Video: the window inhibiting idle belongs to a playing player (Orca inhibits forever and plays nothing).
const cl = '[{"class":"orca","pid":10,"inhibitingIdle":true},{"class":"yandex-browser","pid":20,"inhibitingIdle":true}]'
assert.strictEqual(L.video(cl, [{ pid: 20, playing: true }]), true)
assert.strictEqual(L.video(cl, [{ pid: 20, playing: false }]), false)
assert.strictEqual(L.video(cl, [{ pid: 30, playing: true }]), false)   // playing, but its window doesn't inhibit — music
assert.strictEqual(L.video("junk", [{ pid: 20, playing: true }]), false)

// The 5 s probe: lock, camera, windows and MPRIS players in one output.
const probe = "locked\n@@\ncam\n@@\n" + cl + "\n\n@@\n" +
  'org.mpris.MediaPlayer2.chromium.instance20 20 v s "Playing"\norg.mpris.MediaPlayer2.mpv 30 v s "Paused"\norg.mpris.MediaPlayer2.gone - \n'
assert.deepStrictEqual(L.parseProbe(probe), { locked: true, camera: true, video: true })
// Not locked, no camera: empty sections back to back.
assert.deepStrictEqual(L.parseProbe("@@\n@@\n" + cl + "\n\n@@\n" + 'org.mpris.MediaPlayer2.mpv 20 v s "Paused"\n'), { locked: false, camera: false, video: false })
assert.deepStrictEqual(L.parseProbe("@@\n@@\n" + cl + "\n\n@@\n" + 'org.mpris.MediaPlayer2.chromium.instance20 20 v s "Playing"\n'), { locked: false, camera: false, video: true })
assert.deepStrictEqual(L.parseProbe(""), { locked: false, camera: false, video: false })

assert.strictEqual(L.snapshot({ at: 1, idle_since: 0, locked: false, mic: false, camera: false, video: true, buds: "in" }),
  '{"at":1,"idle_since":0,"locked":false,"mic":false,"camera":false,"video":true,"buds":"in"}')
assert.strictEqual(L.snapshot({ buds: "out", video: false, camera: true, mic: true, locked: true, idle_since: 5, at: 9 }),
  '{"at":9,"idle_since":5,"locked":true,"mic":true,"camera":true,"video":false,"buds":"out"}')
assert.strictEqual(L.changed({ at: 1, video: false }, { at: 2, video: false }), false)
assert.strictEqual(L.changed({ at: 1, video: false }, { at: 2, video: true }), true)
assert.strictEqual(L.changed(null, { at: 2, video: false }), true)

console.log("ok")
