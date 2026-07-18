import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Group, Vector3 } from "three";
import Avatar from "./Avatar";
import { WORLD_RADIUS, PORTAL_POS } from "./Village";
import { localPos, sendMove, sendEmote } from "../net/colyseus";
import { useStore } from "../state/store";

const SPEED = 6;
const SEND_INTERVAL = 1 / 15;

export default function Player() {
  const group = useRef<Group>(null);
  const speedRef = useRef(0);
  const keys = useRef<Set<string>>(new Set());
  const sendTimer = useRef(0);
  const lastSent = useRef({ x: NaN, z: NaN, rot: NaN });
  const camTarget = useRef(new Vector3());
  const camDesired = useRef(new Vector3());
  const camera = useThree((s) => s.camera);

  const selfId = useStore((s) => s.selfId);
  const selfName = useStore((s) => s.selfName);
  const selfColor = useStore((s) => s.selfColor);
  const walletAddress = useStore((s) => s.walletAddress);
  const emote = useStore((s) => (s.selfId ? s.emotes[s.selfId] : undefined));

  useEffect(() => {
    const isTyping = () => {
      const el = document.activeElement;
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
    };
    const down = (e: KeyboardEvent) => {
      if (isTyping()) return;
      keys.current.add(e.code);
      if (e.repeat) return;
      if (e.code === "KeyE") {
        sendEmote("👋");
        const id = useStore.getState().selfId;
        if (id) {
          useStore.getState().setEmote(id, "👋");
          const at = useStore.getState().emotes[id]?.at;
          if (at) setTimeout(() => useStore.getState().clearEmote(id, at), 2200);
        }
      }
      if (e.code === "KeyF" && useStore.getState().nearPortal) {
        // 길드 코업 던전 — 서버리스(데모)에선 완전 온체인으로 동작
        useStore.getState().setDungeonOpen(true);
      }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    const blur = () => keys.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const k = keys.current;
    let dx = 0;
    let dz = 0;
    if (k.has("KeyW") || k.has("ArrowUp")) dz -= 1;
    if (k.has("KeyS") || k.has("ArrowDown")) dz += 1;
    if (k.has("KeyA") || k.has("ArrowLeft")) dx -= 1;
    if (k.has("KeyD") || k.has("ArrowRight")) dx += 1;

    const moving = dx !== 0 || dz !== 0;
    if (moving) {
      const len = Math.hypot(dx, dz);
      localPos.x += (dx / len) * SPEED * dt;
      localPos.z += (dz / len) * SPEED * dt;
      const dist = Math.hypot(localPos.x, localPos.z);
      if (dist > WORLD_RADIUS) {
        localPos.x = (localPos.x / dist) * WORLD_RADIUS;
        localPos.z = (localPos.z / dist) * WORLD_RADIUS;
      }
      localPos.rot = Math.atan2(dx, dz);
    }
    speedRef.current = moving ? SPEED : 0;

    if (group.current) {
      group.current.position.set(localPos.x, 0, localPos.z);
      group.current.rotation.y = localPos.rot;
    }

    // follow camera
    camTarget.current.set(localPos.x, 0, localPos.z);
    camDesired.current.set(localPos.x, 9.5, localPos.z + 11.5);
    camera.position.lerp(camDesired.current, 1 - Math.pow(0.0001, dt));
    camera.lookAt(camTarget.current.x, 1.4, camTarget.current.z);

    // portal proximity
    const near =
      Math.hypot(localPos.x - PORTAL_POS[0], localPos.z - PORTAL_POS[2]) < 4.5;
    if (near !== useStore.getState().nearPortal) {
      useStore.getState().setNearPortal(near);
    }

    // throttled network send
    sendTimer.current += dt;
    if (sendTimer.current >= SEND_INTERVAL) {
      sendTimer.current = 0;
      const last = lastSent.current;
      if (
        last.x !== localPos.x ||
        last.z !== localPos.z ||
        last.rot !== localPos.rot
      ) {
        sendMove(localPos.x, localPos.z, localPos.rot);
        lastSent.current = { x: localPos.x, z: localPos.z, rot: localPos.rot };
      }
    }
  });

  if (!selfId) return null;

  return (
    <group ref={group}>
      <Avatar
        color={selfColor}
        name={selfName || "나"}
        emote={emote?.icon}
        verified={!!walletAddress}
        speedRef={speedRef}
      />
    </group>
  );
}
