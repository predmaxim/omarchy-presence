.pragma library
// predmaxim.presence: everything that needs no QML — the sensors' parsing and the snapshot (node test.js).

// The snapshot's fields in their order; consumers parse by name.
var FIELDS = ["at", "idle_since", "locked", "mic", "camera", "video", "buds"]

// An app records: virtual capture streams (filter chains hold them all the time)
// and Oma's own ear don't count — as micBusy in predmaxim.breaks.
function micBusy(nodes) {
  for (var i = 0; nodes && i < nodes.length; i++) {
    var n = nodes[i], p = (n && n.properties) || {}
    if (n && n.isStream && n.isSink === false && !(n.audio && n.audio.muted) &&
        String(p["node.virtual"]) !== "true" && p["node.name"] !== "oma-ear") return true
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

// The 5 s probe, sections split by "@@" lines: lock, camera, `hyprctl clients -j`,
// then "<mpris name> <pid> <PlaybackStatus as busctl prints it>" per player.
function parseProbe(text) {
  var parts = [""]
  String(text || "").split("\n").forEach(function(l) {
    if (l === "@@") parts.push("")
    else parts[parts.length - 1] += l + "\n"
  })
  var players = (parts[3] || "").split("\n").filter(function(l) { return l.trim() !== "" }).map(function(l) {
    return { pid: Number(l.trim().split(/\s+/)[1]), playing: l.indexOf('"Playing"') >= 0 }
  })
  return {
    locked: parts[0].indexOf("locked") >= 0,
    camera: (parts[1] || "").indexOf("cam") >= 0,
    video: video(parts[2] || "", players)
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
