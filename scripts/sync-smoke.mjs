// E2E smoke test: two clients join the village, one moves + emotes,
// the other must observe it through server snapshots/broadcasts.
// Usage: node scripts/sync-smoke.mjs (server must be running on :2567)
import { Client } from "colyseus.js";

const URL = process.env.WS_URL ?? "ws://localhost:2567";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

const A = new Client(URL);
const B = new Client(URL);

const roomA = await A.joinOrCreate("village", { name: "smokeA", color: 111 });
const roomB = await B.joinOrCreate("village", { name: "smokeB", color: 222 });

const aId = roomA.sessionId;
let lastSnapshotB = [];
let emoteSeenByB = null;

roomA.onMessage("snapshot", () => {});
roomA.onMessage("emote", () => {});
roomA.onMessage("leave", () => {});
roomB.onMessage("snapshot", (snap) => (lastSnapshotB = snap));
roomB.onMessage("emote", (m) => (emoteSeenByB = m));
roomB.onMessage("leave", () => {});

await sleep(400);
if (!aId) fail("client A has no sessionId");
const bId = roomB.sessionId;
const baseline = lastSnapshotB.length;
if (!lastSnapshotB.some((p) => p.id === aId) || !lastSnapshotB.some((p) => p.id === bId)) {
  fail("snapshot missing smoke clients");
}
console.log(`ok: both clients joined (room has ${baseline} players)`);

roomA.send("move", { x: 12.5, z: -7.25, rot: 1.57 });
roomA.send("emote", "👋");
await sleep(400);

const aSeenByB = lastSnapshotB.find((p) => p.id === aId);
if (!aSeenByB) fail("B does not see A in snapshot");
if (aSeenByB.x !== 12.5 || aSeenByB.z !== -7.25) {
  fail(`B sees A at (${aSeenByB.x}, ${aSeenByB.z}), expected (12.5, -7.25)`);
}
if (aSeenByB.rot !== 1.57) fail(`rot mismatch: ${aSeenByB.rot}`);
console.log("ok: A's movement visible to B via snapshot");

if (!emoteSeenByB || emoteSeenByB.id !== aId || emoteSeenByB.emote !== "👋") {
  fail(`emote broadcast wrong: ${JSON.stringify(emoteSeenByB)}`);
}
console.log("ok: A's emote broadcast to B");

// out-of-bounds move must be clamped by the server
roomA.send("move", { x: 9999, z: -9999, rot: 0 });
await sleep(300);
const clamped = lastSnapshotB.find((p) => p.id === aId);
if (Math.abs(clamped.x) > 55 || Math.abs(clamped.z) > 55) {
  fail(`server did not clamp position: (${clamped.x}, ${clamped.z})`);
}
console.log("ok: server clamps out-of-bounds movement");

await roomA.leave();
await sleep(400);
if (lastSnapshotB.some((p) => p.id === aId)) {
  fail("A still present in snapshot after leaving");
}
console.log("ok: leave removes player from snapshot");

await roomB.leave();
console.log("\nALL SYNC CHECKS PASSED");
process.exit(0);
