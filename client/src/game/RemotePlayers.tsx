import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Group } from "three";
import Avatar from "./Avatar";
import { useStore, remoteTargets } from "../state/store";
import { isVerifiedIdentity, useIdentity } from "../wallet/identity";
import type { PlayerInfo } from "../types";

function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function RemotePlayer({ id, info }: { id: string; info: PlayerInfo }) {
  const group = useRef<Group>(null);
  const speedRef = useRef(0);
  const initialized = useRef(false);
  const emote = useStore((s) => s.emotes[id]);
  const say = useStore((s) => s.says[id]);
  // UP.ID 이름이 있으면(호패를 건 버너면 그 뒤의 진짜 지갑 것) 서버 이름 대신 표시
  const identity = useIdentity(info.address || null);

  function onClick(e: { stopPropagation: () => void }) {
    e.stopPropagation();
    useStore.getState().setSocialTarget(id);
  }

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const g = group.current;
    const target = remoteTargets.get(id);
    if (!g || !target) return;

    if (!initialized.current) {
      g.position.set(target.x, 0, target.z);
      g.rotation.y = target.rot;
      initialized.current = true;
      return;
    }

    const t = 1 - Math.pow(0.002, dt);
    const px = g.position.x;
    const pz = g.position.z;
    g.position.x += (target.x - px) * t;
    g.position.z += (target.z - pz) * t;
    g.rotation.y = lerpAngle(g.rotation.y, target.rot, t);

    const moved = Math.hypot(g.position.x - px, g.position.z - pz);
    speedRef.current = dt > 0 ? Math.min(6, moved / dt) : 0;
  });

  return (
    <group
      ref={group}
      onClick={onClick}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "auto";
      }}
    >
      <Avatar
        color={info.color}
        name={identity?.name ?? info.name}
        emote={emote?.icon}
        say={say?.icon}
        verified={isVerifiedIdentity(identity)}
        speedRef={speedRef}
        honor={info.honor}
        trinket={info.trinket}
        sitting={info.sitting}
        wear={info.wear}
      />
    </group>
  );
}

export default function RemotePlayers() {
  const players = useStore((s) => s.players);
  return (
    <>
      {Object.entries(players).map(([id, info]) => (
        <RemotePlayer key={id} id={id} info={info} />
      ))}
    </>
  );
}
