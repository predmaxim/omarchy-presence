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
    onIsIdleChanged: root.idleSince = isIdle ? Math.floor(Date.now() / 1000) - timeout : 0
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
      "echo \"$n $p $(busctl --user get-property \"$n\" /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2.Player PlaybackStatus 2>/dev/null)\";; esac; done"]
    stdout: StdioCollector { onStreamFinished: root.probe = L.parseProbe(text) }
  }
  Timer { interval: 5000; running: true; repeat: true; triggeredOnStart: true; onTriggered: prober.running = true }

  readonly property var facts: ({
    idle_since: root.idleSince,
    locked: root.probe.locked,
    mic: L.micBusy(root.nodes),
    camera: root.probe.camera,
    // Pausing shows at once; the probe catches up within 5 s.
    video: L.anyPlaying(root.players) && root.probe.video,
    buds: L.budsState(L.onBuds(Pipewire.defaultAudioSink ? Pipewire.defaultAudioSink.name : ""), null)
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
  }

  // First write after a probe and the idle timeout: a fresh IdleMonitor reads
  // as input, and a shell restart while away would look like a return.
  property bool ready: false
  Timer { interval: 6000; running: true; onTriggered: { root.ready = true; root.write() } }
  Timer { interval: 30000; running: root.ready; repeat: true; onTriggered: root.write() }
}
