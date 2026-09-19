# Online multiplayer

Create a private room from **PLAY ONLINE**, share its link or code, and have each
guest press **READY**. The host starts once 2–4 players are ready. The same course,
boost, rails, repair strip, and three-lap finish apply. Online races contain human
racers only. Craft are non-contact so network delay cannot cause unfair collision
impulses. Classic solo physics and the 99-rival field are unchanged.

Choose a circuit before creating the room. Skyline includes hills, banking, loops
and a corkscrew; Classic is the original flat track. The host's choice is shown in
the lobby and synchronized to guests. Skyline uses its wider launch grid for online
starts and rematches too. The network protocol version is now 3;
older builds receive a refresh/version message instead of joining an incompatible
race. Remote craft reconstruct their full 3D orientation from the shared course
and distance, so no independent Euler rotations can drift between clients.

## Connection and race lifecycle

- The host owns room membership, slots, readiness, starts, standings and rematches.
  A fifth player and joins after the start receive an explicit rejection.
- Guest browsers connect to the host over actual WebRTC data channels. The host
  relays player snapshots at 20 Hz. Rendering smooths remote positions; local
  controls still run at the game's fixed 120 Hz.
- A ping exchange estimates the host's clock offset before a guest can ready up.
  The host schedules the countdown 3.2 seconds ahead. Countdown corrections happen
  outside the simulation, which continues to consume only `dt`.
- Finish times use elapsed wall time from the shared start; a backgrounded or
  slow tab cannot obtain a faster time by simulating fewer steps. Each client
  simulates its own craft and reports its finish. This is casual play with trusted
  friends, not a server-validated competitive or anti-cheat system.
- Messages are versioned and validated. Sender identity comes from the connection,
  never a supplied player ID. Round and sequence numbers reject stale snapshots.
  Finish records become immutable for the round. The host distributes one result
  roster, ordered by finish time, then active race distance, then DNFs.
- Online pause/restart shortcuts are disabled. Leaving is always available. A
  guest disconnect is retained in race results; lobby slots can be reused. A
  missing heartbeat is treated as disconnected after 12 seconds. Losing the host
  closes the room with a message; there is no host migration or mid-race rejoin.
- When everyone finishes, loses power, or disconnects, the host can return the
  group to the lobby. Guests ready up again before the next round.

## Hosting

The normal static Vercel build works without extra configuration. PeerJS is loaded
only when opening a connection. Solo makes no multiplayer service requests.
PeerJS 1.5.5 includes public signaling, STUN and TURN defaults. Those external
services have their own availability and capacity limits; networks may block
WebRTC even when the website itself loads.

Optional **build-time** Vite settings:

| Variable           | Meaning                                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------------- |
| `VITE_PEER_SERVER` | Custom PeerServer HTTP(S) origin and path, e.g. `https://signal.example.com/peerjs`. Omit for PeerJS Cloud. |
| `VITE_ICE_SERVERS` | JSON array of browser `RTCIceServer` entries, overriding STUN/TURN defaults.                                |

Vite variables are public browser configuration. Never put a private service API
key or long-lived TURN secret in them. A managed private relay should issue
short-lived browser credentials through its own authenticated service.

API references: [PeerJS connection API](https://peerjs.com/client/api/peer) and
[PeerServer hosting](https://peerjs.com/server/getting-started).

## Verification

`pnpm verify` covers typechecking, lint, protocol and room lifecycle unit tests,
and the production build. `pnpm test:e2e` starts a local PeerServer on **5320**
and builds the test preview on **4318** against it. Browser contexts use separate
WebRTC peers, not a mocked network. The suite joins four players, rejects a fifth
and late join, drives a complete race with keyboard input, checks identical final
results, starts a rematch, exercises disconnect recovery, and returns to solo.
The original parity suite still compares world generation exactly.

To exercise the production public signaling service locally in PowerShell:

```powershell
$env:E_ZERO_PUBLIC_PEER = '1'
pnpm test:e2e tests/e2e/online.spec.ts --workers=1
Remove-Item Env:E_ZERO_PUBLIC_PEER
```

To check a deployed build, set `E_ZERO_BASE_URL` to its URL and run the online
suite. This skips local servers. Public-service tests use temporary private rooms
and close their connections afterwards. Same-machine browser tests verify actual
signaling and data channels but do not prove every NAT/firewall combination; test
friends on distinct networks for that coverage.

The e2e build contains the local signaling URL. Run `pnpm build` again before
manually shipping `dist/`; the regular GitHub/Vercel deployment performs a fresh
production build automatically.
