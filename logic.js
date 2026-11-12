.pragma library
// predmaxim.presence: everything that needs no QML — the sensors' parsing and the snapshot (node test.js).

// The snapshot's fields in their order; consumers parse by name.
var FIELDS = ["at", "idle_since", "locked", "mic", "video", "buds", "screencast"]

// An app records: virtual capture streams (filter chains hold them all the time),
// Oma's own ear and the shell's level meters (isMeter(name) — the stock
// AudioNodes.isShellLevelMeter, as the stock microphone widget) don't count.
function micBusy(nodes, isMeter) {
  for (var i = 0; nodes && i < nodes.length; i++) {
    var n = nodes[i], p = (n && n.properties) || {}
    if (n && n.isStream && n.isSink === false && !(n.audio && n.audio.muted) &&
        String(p["node.virtual"]) !== "true" && p["node.name"] !== "oma-ear" && !isMeter(n.name)) return true
  }
  return false
}

// The screen is shared: a video source with no device behind it — a portal's
// screencast stream lives as long as the sharing does; a camera has device.id.
// Documented PipeWire keys, not a portal's node name; virtual cameras count too.
function sharing(nodes) {
  for (var i = 0; nodes && i < nodes.length; i++) {
    var p = (nodes[i] && nodes[i].properties) || {}
    if (p["media.class"] === "Video/Source" && !p["device.id"]) return true
  }
  return false
}

function anyPlaying(players) {
  return (players || []).some(function(p) { return p && p.isPlaying })
}

// Video: a playing MPRIS player whose window inhibits idle. Orca inhibits idle
// all the time and music players don't inhibit, so neither alone is enough.
function video(clientsJson, players) {
  var clients
  try { clients = JSON.parse(clientsJson) } catch (e) { return false }
  if (!Array.isArray(clients)) return false
  return clients.some(function(c) {
    return c && c.inhibitingIdle === true && players.some(function(p) { return p.playing && p.pid === c.pid })
  })
}

function onBuds(sinkName) {
  return String(sinkName || "").indexOf("bluez_output.") === 0
}

// sensor: in the ears true/false, null when there is no sensor.
function budsState(onBuds, sensor) {
  if (!onBuds || sensor === null || sensor === undefined) return "unknown"
  return sensor ? "in" : "out"
}

// in_ear.py's lines: "in" / "out"; "unknown" or anything else — no sensor.
function parseInEar(line) {
  var l = String(line || "").trim()
  return l === "in" ? true : l === "out" ? false : null
}

// Since when there's no input, at a shell start: the previous shell's snapshot, if fresh
// (< 90 s) and idle, still holds — a restart while the user is away must not read as a return.
function idleSince(fallback, prevText, now) {
  var p = null
  try { p = JSON.parse(prevText) } catch (e) {}
  return p && now - p.at < 90 && p.idle_since > 0 ? p.idle_since : fallback
}

// The 5 s probe, sections split by "@@" lines: lock, `hyprctl clients -j`,
// then "<mpris name> <pid> <PlaybackStatus as busctl prints it>" per player.
function parseProbe(text) {
  var parts = [""]
  String(text || "").split("\n").forEach(function(l) {
    if (l === "@@") parts.push("")
    else parts[parts.length - 1] += l + "\n"
  })
  var players = (parts[2] || "").split("\n").filter(function(l) { return l.trim() !== "" }).map(function(l) {
    return { pid: Number(l.trim().split(/\s+/)[1]), playing: l.indexOf('"Playing"') >= 0 }
  })
  return {
    locked: parts[0].indexOf("locked") >= 0,
    video: video(parts[1] || "", players)
  }
}

function snapshot(f) {
  return JSON.stringify(f, FIELDS)
}

// Anything but the time differs.
function changed(prev, next) {
  if (!prev) return true
  return FIELDS.some(function(k) { return k !== "at" && prev[k] !== next[k] })
}
