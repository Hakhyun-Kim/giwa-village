import { useMemo } from "react";
import { Html } from "@react-three/drei";

export const WORLD_RADIUS = 55;
export const PORTAL_POS: [number, number, number] = [0, 0, -30];

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WALL_COLORS = ["#e8dcc8", "#e2d4bc", "#ded0b0", "#e5d9c5"];

/** 절차 생성 한옥: 기단 + 목재 기둥 + 회벽 + 기와 팔작지붕 근사 */
export function Hanok({
  position,
  rotation,
  w = 4.6,
  d = 3.6,
  tint = "#e8dcc8",
  sign,
  tag,
}: {
  position: [number, number, number];
  rotation: number;
  w?: number;
  d?: number;
  tint?: string;
  sign?: string;
  tag?: string;
}) {
  const wallH = 2.1;
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* 기단 (돌 단) */}
      <mesh position={[0, 0.18, 0]} receiveShadow castShadow>
        <boxGeometry args={[w + 0.7, 0.36, d + 0.7]} />
        <meshStandardMaterial color="#9a958a" />
      </mesh>
      {/* 회벽 */}
      <mesh position={[0, 0.36 + wallH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, wallH, d]} />
        <meshStandardMaterial color={tint} />
      </mesh>
      {/* 모서리 목재 기둥 */}
      {[
        [-w / 2, -d / 2],
        [w / 2, -d / 2],
        [-w / 2, d / 2],
        [w / 2, d / 2],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.36 + wallH / 2, z]} castShadow>
          <boxGeometry args={[0.22, wallH, 0.22]} />
          <meshStandardMaterial color="#6b4a30" />
        </mesh>
      ))}
      {/* 문 */}
      <mesh position={[0, 1.15, d / 2 + 0.01]}>
        <boxGeometry args={[1.1, 1.6, 0.06]} />
        <meshStandardMaterial color="#5a3d28" />
      </mesh>
      {/* 창(문살 느낌의 밝은 사각) */}
      <mesh position={[w * 0.28, 1.45, d / 2 + 0.01]}>
        <boxGeometry args={[0.8, 0.8, 0.04]} />
        <meshStandardMaterial color="#f4ead2" emissive="#d8c9a0" emissiveIntensity={0.25} />
      </mesh>
      {/* 기와지붕: 넓은 처마의 낮은 사각뿔 2단 + 용마루 */}
      <mesh position={[0, wallH + 0.85, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[Math.hypot(w, d) * 0.62, 1.0, 4]} />
        <meshStandardMaterial color="#3b3f46" flatShading />
      </mesh>
      <mesh position={[0, wallH + 1.28, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[Math.hypot(w, d) * 0.38, 0.62, 4]} />
        <meshStandardMaterial color="#464b54" flatShading />
      </mesh>
      {/* 용마루 */}
      <mesh position={[0, wallH + 1.62, 0]} castShadow>
        <boxGeometry args={[w * 0.5, 0.14, 0.3]} />
        <meshStandardMaterial color="#2e3138" />
      </mesh>
      {/* 처마 끝 흰 선(막새 느낌) */}
      <mesh position={[0, wallH + 0.42, 0]} rotation={[0, Math.PI / 4, 0]}>
        <torusGeometry args={[Math.hypot(w, d) * 0.55, 0.045, 6, 4]} />
        <meshStandardMaterial color="#c9cdd4" />
      </mesh>

      {sign && (
        <Html position={[0, wallH + 0.15, d / 2 + 0.35]} center distanceFactor={16} zIndexRange={[5, 0]}>
          <div className="shop-sign">
            <b>{sign}</b>
            {tag && <span>{tag}</span>}
          </div>
        </Html>
      )}
    </group>
  );
}

function Tree({
  position,
  scale,
  pine,
}: {
  position: [number, number, number];
  scale: number;
  pine: boolean;
}) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.8, 0]} castShadow>
        <cylinderGeometry args={[0.18, 0.28, 1.6, 8]} />
        <meshStandardMaterial color="#6b4a30" />
      </mesh>
      {pine ? (
        <>
          <mesh position={[0, 2.1, 0]} castShadow>
            <coneGeometry args={[1.15, 1.8, 10]} />
            <meshStandardMaterial color="#3f7245" />
          </mesh>
          <mesh position={[0, 3.1, 0]} castShadow>
            <coneGeometry args={[0.8, 1.4, 10]} />
            <meshStandardMaterial color="#498151" />
          </mesh>
        </>
      ) : (
        <>
          <mesh position={[0, 2.2, 0]} castShadow>
            <sphereGeometry args={[1.1, 12, 12]} />
            <meshStandardMaterial color="#5a9147" />
          </mesh>
          <mesh position={[0.6, 1.8, 0.3]} castShadow>
            <sphereGeometry args={[0.7, 10, 10]} />
            <meshStandardMaterial color="#6aa254" />
          </mesh>
        </>
      )}
    </group>
  );
}

/** 홍등 달린 등롱대 */
function Lantern({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 1.5, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.09, 3, 8]} />
        <meshStandardMaterial color="#4a3527" />
      </mesh>
      <mesh position={[0, 2.85, 0]}>
        <sphereGeometry args={[0.26, 12, 12]} />
        <meshStandardMaterial color="#e04b3a" emissive="#ff6a4a" emissiveIntensity={0.9} />
      </mesh>
      <mesh position={[0, 2.62, 0]}>
        <cylinderGeometry args={[0.1, 0.14, 0.12, 8]} />
        <meshStandardMaterial color="#ffd98a" emissive="#ffca5f" emissiveIntensity={0.6} />
      </mesh>
    </group>
  );
}

function Fountain() {
  return (
    <group>
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[2.4, 2.6, 0.6, 24]} />
        <meshStandardMaterial color="#9a9a92" />
      </mesh>
      <mesh position={[0, 0.62, 0]}>
        <cylinderGeometry args={[2.05, 2.05, 0.1, 24]} />
        <meshStandardMaterial color="#4f9dd8" transparent opacity={0.85} />
      </mesh>
      <mesh position={[0, 1.1, 0]} castShadow>
        <cylinderGeometry args={[0.28, 0.4, 1.4, 12]} />
        <meshStandardMaterial color="#8b8b84" />
      </mesh>
      <mesh position={[0, 1.95, 0]} castShadow>
        <sphereGeometry args={[0.42, 14, 14]} />
        <meshStandardMaterial color="#6db3e0" emissive="#3f7fb0" emissiveIntensity={0.3} />
      </mesh>
    </group>
  );
}

/** 광고 배너 입간판 */
function Billboard({
  position,
  rotation,
  text,
  sub,
}: {
  position: [number, number, number];
  rotation: number;
  text: string;
  sub: string;
}) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[-1.1, 1.4, 0]} castShadow>
        <boxGeometry args={[0.14, 2.8, 0.14]} />
        <meshStandardMaterial color="#4a3527" />
      </mesh>
      <mesh position={[1.1, 1.4, 0]} castShadow>
        <boxGeometry args={[0.14, 2.8, 0.14]} />
        <meshStandardMaterial color="#4a3527" />
      </mesh>
      <mesh position={[0, 2.1, 0]} castShadow>
        <boxGeometry args={[2.6, 1.3, 0.08]} />
        <meshStandardMaterial color="#20242e" emissive="#12141c" emissiveIntensity={0.4} />
      </mesh>
      <Html position={[0, 2.1, 0.1]} center distanceFactor={14} zIndexRange={[4, 0]}>
        <div className="billboard">
          <b>{text}</b>
          <span>{sub}</span>
        </div>
      </Html>
    </group>
  );
}

export default function Village() {
  // 한옥 링 — 동쪽(식당가)과 북쪽(포털 길)은 비워둔다
  const hanoks = useMemo(() => {
    const rand = mulberry32(20260718);
    const list: {
      position: [number, number, number];
      rotation: number;
      tint: string;
    }[] = [];
    // 남서~서~북서 구간에 배치
    const angles = [100, 130, 160, 195, 230, 255];
    for (let i = 0; i < angles.length; i++) {
      const a = (angles[i] * Math.PI) / 180;
      const r = 25 + rand() * 5;
      list.push({
        position: [Math.cos(a) * r, 0, Math.sin(a) * r],
        rotation: -a - Math.PI / 2,
        tint: WALL_COLORS[i % WALL_COLORS.length],
      });
    }
    return list;
  }, []);

  const trees = useMemo(() => {
    const rand = mulberry32(91342);
    const list: { position: [number, number, number]; scale: number; pine: boolean }[] = [];
    while (list.length < 20) {
      const angle = rand() * Math.PI * 2;
      const r = 13 + rand() * 38;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      const nearPortal = Math.hypot(x - PORTAL_POS[0], z - PORTAL_POS[2]) < 8;
      const inHanokBand = r > 22 && r < 33;
      const inFoodStreet = x > 10 && x < 34 && Math.abs(z) < 9;
      if (nearPortal || inHanokBand || inFoodStreet) continue;
      list.push({
        position: [x, 0, z],
        scale: 0.8 + rand() * 0.7,
        pine: rand() > 0.5,
      });
    }
    return list;
  }, []);

  return (
    <group>
      <color attach="background" args={["#a8c6e4"]} />
      <fog attach="fog" args={["#a8c6e4", 45, 110]} />

      <ambientLight intensity={0.55} />
      <directionalLight
        position={[25, 40, 20]}
        intensity={1.15}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-50}
        shadow-camera-right={50}
        shadow-camera-top={50}
        shadow-camera-bottom={-50}
      />

      {/* ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[WORLD_RADIUS + 8, 48]} />
        <meshStandardMaterial color="#7fae64" />
      </mesh>
      {/* plaza */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
        <circleGeometry args={[10, 36]} />
        <meshStandardMaterial color="#cbb896" />
      </mesh>
      {/* 포털로 가는 북쪽 길 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, -19]} receiveShadow>
        <planeGeometry args={[3.4, 20]} />
        <meshStandardMaterial color="#cbb896" />
      </mesh>
      {/* 동쪽 식당가 거리 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[21, 0.015, 0]} receiveShadow>
        <planeGeometry args={[24, 5]} />
        <meshStandardMaterial color="#cbb896" />
      </mesh>

      <Fountain />

      {hanoks.map((h, i) => (
        <Hanok key={i} {...h} />
      ))}

      {trees.map((t, i) => (
        <Tree key={i} {...t} />
      ))}

      <Lantern position={[7, 0, 7]} />
      <Lantern position={[-7, 0, 7]} />
      <Lantern position={[7, 0, -7]} />
      <Lantern position={[-7, 0, -7]} />
      <Lantern position={[12, 0, 3]} />
      <Lantern position={[30, 0, -1]} />

      <Billboard
        position={[-3.4, 0, -22]}
        rotation={0.35}
        text="광고 배너 자리"
        sub="온체인 분양 예정 · ad@giwa.village"
      />
      <Billboard
        position={[12.5, 0, 8.5]}
        rotation={-2.6}
        text="GIWA 저잣거리"
        sub="인증 상인 노점 환영 🧧"
      />
    </group>
  );
}
