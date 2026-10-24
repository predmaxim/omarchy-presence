import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import Quickshell.Services.Pipewire
import Quickshell.Services.Mpris
import "logic.js" as L

// predmaxim.presence: facts about the user for other services (agent-speak,
// later the breaks), written to $XDG_RUNTIME_DIR/predmaxim-presence.json on
// every change and every 30 s. Facts only — each consumer decides for itself.
Item {
  id: root

  // Injected by omarchy-shell.
  property var shell: null
  property var manifest: null

  // Ignoring inhibitors: video inhibits idle, and only real input counts.
  IdleMonitor {
    timeout: 5
    respectInhibitors: false
    // Going idle keeps a time inherited from the previous shell: no input was seen since.
    onIsIdleChanged: root.idleSince = isIdle ? (root.idleSince || Math.floor(Date.now() / 1000) - timeout) : 0
  }
  property real idleSince: 0

  readonly property var nodes: Pipewire.nodes ? Pipewire.nodes.values : []
  PwObjectTracker { objects: root.nodes }
  readonly property var players: Mpris.players ? Mpris.players.values : []

  property var probe: ({ locked: false, camera: false, video: false })
  Process {
    id: prober
    command: ["sh", "-c", "omarchy-hyprland-session-locked && echo locked; echo '@@'; " +
      "for d in /dev/video*; do [ -e \"$d\" ] && fuser -s \"$d\" 2>/dev/null && { echo cam; break; }; done; echo '@@'; " +
      "hyprctl clients -j; echo; echo '@@'; " +
      "busctl --user list --no-legend | while read -r n p _; do case $n in org.mpris.MediaPlayer2.*) " +
      "echo \"$n $p $(busctl --user call --auto-start=no \"$n\" /org/mpris/MediaPlayer2 org.freedesktop.DBus.Properties Get ss " +
      "org.mpris.MediaPlayer2.Player PlaybackStatus 2>/dev/null)\";; esac; done"]
    stdout: StdioCollector { onStreamFinished: root.probe = L.parseProbe(text) }
  }
  Timer { interval: 5000; running: true; repeat: true; triggeredOnStart: true; onTriggered: prober.running = true }

  // The in-ear sensor runs only while the output is on Bluetooth earbuds, for those earbuds.
  readonly property var sink: Pipewire.defaultAudioSink
  readonly property bool onBuds: L.onBuds(root.sink ? root.sink.name : "")
  readonly property string budsAddress: root.onBuds ? String((root.sink.properties || {})["api.bluez5.address"] || "") : ""
  readonly property string earScript: decodeURIComponent(String(Qt.resolvedUrl("in_ear.py")).replace(/^file:\/\//, ""))
  property var inEar: null   // true / false from in_ear.py, null — no sensor
  onBudsAddressChanged: syncEar()
  Component.onCompleted: syncEar()   // the sink may be known before any change
  function syncEar() {
    if (ear.running && ear.address === root.budsAddress) return
    root.inEar = null
    earRetry.stop()
    if (ear.running) ear.running = false   // its onExited starts the next one
    else if (root.budsAddress !== "") {
      ear.address = root.budsAddress
      ear.command = ["/usr/bin/python3", "-I", root.earScript, root.sink.description, root.budsAddress]
      ear.running = true
    }
  }
  Process {
    id: ear
    property string address: ""
    stdout: SplitParser { onRead: function(line) { root.inEar = L.parseInEar(line) } }
    // The output moved: start for it. Crashed: again in 30 s. 0: these earbuds have no sensor.
    onExited: function(code) {
      root.inEar = null
      if (ear.address !== root.budsAddress) root.syncEar()
      else if (code !== 0) earRetry.restart()
    }
  }
  Timer { id: earRetry; interval: 30000; onTriggered: root.syncEar() }

  readonly property var facts: ({
    idle_since: root.idleSince,
    locked: root.probe.locked,
    mic: L.micBusy(root.nodes),
    camera: root.probe.camera,
    // Pausing shows at once; the probe catches up within 5 s.
    video: L.anyPlaying(root.players) && root.probe.video,
    buds: L.budsState(root.onBuds, root.inEar)
  })

  property var written: null
  function write() {
    var f = { at: Math.floor(Date.now() / 1000) }
    for (var k in root.facts) f[k] = root.facts[k]
    root.written = f
    out.setText(L.snapshot(f))
  }
  onFactsChanged: if (root.ready && L.changed(root.written, root.facts)) write()

  FileView {
    id: out
    path: Quickshell.env("XDG_RUNTIME_DIR") + "/predmaxim-presence.json"
    atomicWrites: true
    printErrors: false
    // The previous shell's snapshot, before our first write: a restart while away is no return.
    onLoaded: if (!root.ready) root.idleSince = L.idleSince(root.idleSince, text(), Math.floor(Date.now() / 1000))
  }

  // First write after a probe and the idle timeout: a fresh IdleMonitor reads
  // as input, and a shell restart while away would look like a return.
  property bool ready: false
  Timer { interval: 6000; running: true; onTriggered: { root.ready = true; root.write() } }
  Timer { interval: 30000; running: root.ready; repeat: true; onTriggered: root.write() }
}
