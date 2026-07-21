import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { CanvasTexture, Color, Group, Mesh, NearestFilter } from "three";
import { honorCharmColor } from "../chain/honors";
import { trinketColor } from "../chain/boxes";
import { patternCanvas } from "../chain/workshop";

export interface AvatarVariant {
  hat: 0 | 1 | 2 | 3; // 0 없음, 1 갓, 2 패랭이, 3 두건
  headScale: number;
  bodyWidth: number;
}

export function variantFrom(seed: string): AvatarVariant {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 33 + seed.charCodeAt(i)) >>> 0;
  return {
    hat: (h % 4) as AvatarVariant["hat"],
    headScale: 0.9 + ((h >> 3) % 25) / 100,
    bodyWidth: 0.85 + ((h >> 8) % 30) / 100,
  };
}

interface AvatarProps {
  color: number;
  name: string;
  emote?: string;
  /** 페르소나 한마디 — 이모트와 달리 텍스트 말풍선으로 뜬다 */
  say?: string;
  verified?: boolean;
  speedRef: React.RefObject<number>;
  variant?: AvatarVariant;
  /** 장착한 소울바운드 칭호 id — 어깨 위 발광 부적으로 렌더 */
  honor?: number;
  /** 장착한 랜덤박스 장신구 id — 반대쪽 어깨의 작은 모트로 렌더 */
  trinket?: number;
  /** 모닥불에 앉아 있음 — 앉은 자세로 렌더 */
  sitting?: boolean;
  /** 착용한 공방 문양 ("pixelsHex:palette") — 가슴팍에 렌더 */
  wear?: string;
}

/** 장신구 코스메틱: 왼쪽 어깨 옆의 작은 모트 (부적보다 작고 빠르게 맴돈다) */
function TrinketMote({ color }: { color: string }) {
  const orb = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (orb.current) {
      orb.current.position.y = 1.5 + Math.sin(t * 3.1 + 1.7) * 0.06;
      orb.current.position.x = -0.5 - Math.sin(t * 1.6) * 0.05;
    }
  });
  return (
    <mesh ref={orb} position={[-0.5, 1.5, 0]}>
      <sphereGeometry args={[0.06, 10, 10]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.4} />
    </mesh>
  );
}

/** 칭호 코스메틱: 어깨 옆에 떠서 맴도는 발광 부적(등불) */
function HonorCharm({ color }: { color: string }) {
  const orb = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (orb.current) {
      orb.current.position.y = 1.75 + Math.sin(t * 2.2) * 0.08;
      orb.current.position.x = 0.55 + Math.sin(t * 1.1) * 0.04;
    }
  });
  return (
    <group>
      <mesh ref={orb} position={[0.55, 1.75, 0]}>
        <sphereGeometry args={[0.09, 12, 12]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={1.6}
        />
      </mesh>
      <pointLight position={[0.55, 1.75, 0]} color={color} intensity={1.2} distance={2.2} />
    </group>
  );
}

function Hat({ type, color }: { type: AvatarVariant["hat"]; color: number }) {
  if (type === 1) {
    // 갓: 넓은 챙 + 원통 관모
    return (
      <group position={[0, 1.94, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.42, 0.42, 0.03, 16]} />
          <meshStandardMaterial color="#1c1c22" />
        </mesh>
        <mesh position={[0, 0.1, 0]} castShadow>
          <cylinderGeometry args={[0.15, 0.17, 0.2, 12]} />
          <meshStandardMaterial color="#1c1c22" />
        </mesh>
      </group>
    );
  }
  if (type === 2) {
    // 패랭이: 짚색 원뿔
    return (
      <mesh position={[0, 1.98, 0]} castShadow>
        <coneGeometry args={[0.4, 0.22, 12]} />
        <meshStandardMaterial color="#c9a86a" />
      </mesh>
    );
  }
  if (type === 3) {
    // 두건: 머리색 띠
    return (
      <mesh position={[0, 1.85, 0]}>
        <torusGeometry args={[0.25, 0.05, 8, 16]} />
        <meshStandardMaterial color={color} />
      </mesh>
    );
  }
  return null;
}

export default function Avatar({
  color,
  name,
  emote,
  say,
  verified,
  speedRef,
  variant,
  honor,
  trinket,
  sitting,
  wear,
}: AvatarProps) {
  const charm = honorCharmColor(honor);
  const mote = trinketColor(trinket);
  const patternTex = useMemo(() => {
    if (!wear) return null;
    const [pixels, palette] = wear.split(":");
    const tex = new CanvasTexture(patternCanvas(pixels, Number(palette), 8));
    tex.magFilter = NearestFilter;
    return tex;
  }, [wear]);
  const body = useRef<Group>(null);
  const leftArm = useRef<Group>(null);
  const rightArm = useRef<Group>(null);
  const leftLeg = useRef<Group>(null);
  const rightLeg = useRef<Group>(null);

  const v = useMemo(() => variant ?? variantFrom(name), [variant, name]);

  const headColor = useMemo(
    () => new Color(color).lerp(new Color("#ffffff"), 0.4),
    [color],
  );

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (sitting) {
      // 앉은 자세: 몸을 낮추고 다리를 앞으로
      if (body.current) body.current.position.y = -0.34;
      if (leftLeg.current) leftLeg.current.rotation.x = -1.5;
      if (rightLeg.current) rightLeg.current.rotation.x = -1.5;
      if (leftArm.current) leftArm.current.rotation.x = -0.3;
      if (rightArm.current) {
        rightArm.current.rotation.z = 0;
        rightArm.current.rotation.x = -0.3;
      }
      return;
    }
    const speed = Math.min(1, (speedRef.current ?? 0) / 6);
    const swing = Math.sin(t * 9) * speed;

    if (body.current) body.current.position.y = Math.abs(Math.sin(t * 9)) * 0.06 * speed;
    if (leftArm.current) leftArm.current.rotation.x = swing * 0.9;
    if (leftLeg.current) leftLeg.current.rotation.x = -swing * 0.8;
    if (rightLeg.current) rightLeg.current.rotation.x = swing * 0.8;

    if (rightArm.current) {
      if (emote) {
        // wave: arm raised, oscillating
        rightArm.current.rotation.x = 0;
        rightArm.current.rotation.z = -2.4 + Math.sin(t * 12) * 0.35;
      } else {
        rightArm.current.rotation.z = 0;
        rightArm.current.rotation.x = -swing * 0.9;
      }
    }
  });

  return (
    <group>
      <group ref={body}>
        {/* torso */}
        <mesh position={[0, 0.95, 0]} scale={[v.bodyWidth, 1, v.bodyWidth]} castShadow>
          <capsuleGeometry args={[0.32, 0.55, 6, 12]} />
          <meshStandardMaterial color={color} />
        </mesh>
        {/* head */}
        <group position={[0, 1.72, 0]} scale={v.headScale}>
          <mesh castShadow>
            <sphereGeometry args={[0.26, 20, 20]} />
            <meshStandardMaterial color={headColor} />
          </mesh>
          <mesh position={[-0.09, 0.04, 0.22]}>
            <sphereGeometry args={[0.035, 8, 8]} />
            <meshStandardMaterial color="#222222" />
          </mesh>
          <mesh position={[0.09, 0.04, 0.22]}>
            <sphereGeometry args={[0.035, 8, 8]} />
            <meshStandardMaterial color="#222222" />
          </mesh>
        </group>
        {/* 공방 문양 (가슴팍) */}
        {patternTex && (
          <mesh position={[0, 1.04, 0.33 * v.bodyWidth + 0.02]}>
            <planeGeometry args={[0.4, 0.4]} />
            <meshStandardMaterial map={patternTex} transparent />
          </mesh>
        )}
        <Hat type={v.hat} color={color} />
        {/* arms (pivot at shoulder) */}
        <group ref={leftArm} position={[-0.42 * v.bodyWidth, 1.32, 0]}>
          <mesh position={[0, -0.28, 0]} castShadow>
            <capsuleGeometry args={[0.09, 0.42, 4, 8]} />
            <meshStandardMaterial color={color} />
          </mesh>
        </group>
        <group ref={rightArm} position={[0.42 * v.bodyWidth, 1.32, 0]}>
          <mesh position={[0, -0.28, 0]} castShadow>
            <capsuleGeometry args={[0.09, 0.42, 4, 8]} />
            <meshStandardMaterial color={color} />
          </mesh>
        </group>
        {/* legs (pivot at hip) */}
        <group ref={leftLeg} position={[-0.15, 0.55, 0]}>
          <mesh position={[0, -0.26, 0]} castShadow>
            <capsuleGeometry args={[0.11, 0.36, 4, 8]} />
            <meshStandardMaterial color="#3a3f4a" />
          </mesh>
        </group>
        <group ref={rightLeg} position={[0.15, 0.55, 0]}>
          <mesh position={[0, -0.26, 0]} castShadow>
            <capsuleGeometry args={[0.11, 0.36, 4, 8]} />
            <meshStandardMaterial color="#3a3f4a" />
          </mesh>
        </group>
      </group>

      {charm && <HonorCharm color={charm} />}
      {mote && <TrinketMote color={mote} />}

      <Html position={[0, 2.45, 0]} center distanceFactor={14} zIndexRange={[10, 0]}>
        <div className="nametag">
          {verified && <span className="badge">✓</span>}
          {name}
        </div>
      </Html>

      {emote && (
        <Html position={[0, 3.05, 0]} center distanceFactor={14} zIndexRange={[20, 0]}>
          <div className="emote-bubble">{emote}</div>
        </Html>
      )}

      {/* 이모트가 떠 있으면 그 위로 비켜 준다 */}
      {say && !emote && (
        <Html position={[0, 3.0, 0]} center distanceFactor={14} zIndexRange={[19, 0]}>
          <div className="speech-bubble">{say}</div>
        </Html>
      )}
    </group>
  );
}
