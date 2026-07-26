import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { Mesh, MeshStandardMaterial, PointLight } from "three";
import { useStore } from "../state/store";
import { currentDaylight, type DaylightState } from "./daylight";
import { feel, onDamagePop, type DamagePop } from "./feel";
// 배치 좌표(한옥·나무·등롱·간판)와 충돌은 collide.ts 한 곳에 있다 —
// 그리는 표와 막는 표가 같아야 보이는 것과 부딪히는 것이 어긋나지 않는다.
import {
  BILLBOARDS,
  BOSS_POS,
  CAMPFIRE_POS,
  HANOKS,
  LANTERNS,
  TREES,
  WORLD_RADIUS,
  setDynamicColliders,
} from "./collide";

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

/** 등불 달린 등롱대 — 해가 지면 불이 들어온다 */
function Lantern({ position, glow }: { position: [number, number, number]; glow: number }) {
  return (
    <group position={position}>
      <mesh position={[0, 1.5, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.09, 3, 8]} />
        <meshStandardMaterial color="#4a3527" />
      </mesh>
      <mesh position={[0, 2.85, 0]}>
        <sphereGeometry args={[0.26, 12, 12]} />
        <meshStandardMaterial
          color="#e04b3a"
          emissive="#ff6a4a"
          emissiveIntensity={0.9 + glow * 1.4}
        />
      </mesh>
      <mesh position={[0, 2.62, 0]}>
        <cylinderGeometry args={[0.1, 0.14, 0.12, 8]} />
        <meshStandardMaterial
          color="#ffd98a"
          emissive="#ffca5f"
          emissiveIntensity={0.6 + glow * 1.6}
        />
      </mesh>
      {glow > 0.05 && (
        <pointLight position={[0, 2.8, 0]} color="#ffb45c" intensity={glow * 2.6} distance={11} />
      )}
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

/** 모닥불 — 함께 쬐면 온기가 쌓인다 (X로 앉기) */
function Campfire() {
  const flame = useRef<Mesh>(null);
  const inner = useRef<Mesh>(null);
  const light = useRef<PointLight>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const f = 1 + Math.sin(t * 9) * 0.12 + Math.sin(t * 23) * 0.06;
    if (flame.current) flame.current.scale.set(f, 1.1 + Math.sin(t * 7) * 0.15, f);
    if (inner.current) inner.current.scale.setScalar(0.9 + Math.sin(t * 13) * 0.1);
    if (light.current) light.current.intensity = 2.2 + Math.sin(t * 11) * 0.5;
  });
  return (
    <group position={CAMPFIRE_POS}>
      {/* 돌 화덕 */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <mesh
          key={i}
          position={[Math.cos((i / 6) * Math.PI * 2) * 0.7, 0.12, Math.sin((i / 6) * Math.PI * 2) * 0.7]}
          castShadow
        >
          <sphereGeometry args={[0.16, 8, 8]} />
          <meshStandardMaterial color="#7b766c" />
        </mesh>
      ))}
      {/* 장작 */}
      <mesh position={[0, 0.14, 0]} rotation={[0, 0.5, 1.35]} castShadow>
        <cylinderGeometry args={[0.07, 0.07, 0.9, 8]} />
        <meshStandardMaterial color="#5a3d26" />
      </mesh>
      <mesh position={[0, 0.14, 0]} rotation={[0, -0.9, 1.35]} castShadow>
        <cylinderGeometry args={[0.07, 0.07, 0.9, 8]} />
        <meshStandardMaterial color="#6b4a30" />
      </mesh>
      {/* 불꽃 */}
      <mesh ref={flame} position={[0, 0.45, 0]}>
        <coneGeometry args={[0.28, 0.7, 10]} />
        <meshStandardMaterial color="#ff7b2f" emissive="#ff5a00" emissiveIntensity={1.8} transparent opacity={0.92} />
      </mesh>
      <mesh ref={inner} position={[0, 0.38, 0]}>
        <coneGeometry args={[0.15, 0.42, 8]} />
        <meshStandardMaterial color="#ffd66b" emissive="#ffb200" emissiveIntensity={2.2} />
      </mesh>
      <pointLight ref={light} position={[0, 0.8, 0]} color="#ff9a3d" intensity={2.2} distance={9} />
      {/* 통나무 의자 */}
      {[[1.6, 0.35], [-1.6, 0.35], [0, -1.7]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.18, z]} rotation={[0, i === 2 ? 0 : Math.PI / 2, 0]} castShadow>
          <cylinderGeometry args={[0.16, 0.16, 1.2, 10]} />
          <meshStandardMaterial color="#8a6a48" />
        </mesh>
      ))}
      <Html position={[0, 1.6, 0]} center distanceFactor={18} zIndexRange={[5, 0]}>
        <div className="portal-label">🔥 모닥불</div>
      </Html>
    </group>
  );
}

/** 주간 도깨비 — 마을 사람들이 함께 때려잡는 온체인 보스 (R로 타격) */
function BossGoblin() {
  const boss = useStore((s) => s.boss);
  const body = useRef<Mesh>(null);
  const skin = useRef<MeshStandardMaterial>(null);
  const glow = useRef<PointLight>(null);
  const [pops, setPops] = useState<DamagePop[]>([]);

  // 도깨비는 잡히면 사라진다 — 보이지 않는 것에 부딪히지 않도록 수명을 맞춘다
  const alive = !!boss && !boss.slain;
  useEffect(() => {
    setDynamicColliders(
      "boss",
      alive ? [{ kind: "circle", x: BOSS_POS[0], z: BOSS_POS[2], r: 0.95 }] : null,
    );
    return () => setDynamicColliders("boss", null);
  }, [alive]);

  // 떠오르는 숫자 — 애니메이션이 끝나면 스스로 사라진다 (풀 최대 5개)
  useEffect(
    () =>
      onDamagePop((p) => {
        setPops((cur) => [...cur.slice(-4), p]);
        setTimeout(() => setPops((cur) => cur.filter((x) => x.id !== p.id)), 1200);
      }),
    [],
  );

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const f = feel.bossFlash;
    if (body.current) {
      body.current.position.y = 1.15 + Math.sin(t * 1.7) * 0.1;
      body.current.rotation.y = Math.sin(t * 0.6) * 0.4;
      // 맞으면 살짝 부푼다 — 새 메시 없이 스케일 하나로 내는 타격감
      body.current.scale.setScalar(1 + f * 0.16);
    }
    // 밝게 틴트 + 발광. 재질을 새로 만들지 않고 있는 값을 흔든다.
    // 완전히 하얗게 태우지는 않는다 — 뿔·눈이 안 보이면 무엇이 맞았는지가 사라진다.
    if (skin.current) {
      skin.current.emissive.setRGB(0.23 + f * 0.42, 0.1 + f * 0.45, 0.29 + f * 0.36);
      skin.current.emissiveIntensity = 0.4 + f * 1.5;
    }
    if (glow.current) glow.current.intensity = 1.2 + f * 4;
  });

  if (!boss || boss.slain) return null;
  const hpRatio = Math.max(0, Math.min(1, boss.remaining / 2000));
  return (
    <group position={BOSS_POS}>
      {/* 몸통 */}
      <mesh ref={body} position={[0, 1.15, 0]} castShadow>
        <sphereGeometry args={[0.85, 16, 16]} />
        <meshStandardMaterial
          ref={skin}
          color="#7a4a8f"
          emissive="#3a1a4a"
          emissiveIntensity={0.4}
        />
      </mesh>
      {/* 뿔 */}
      <mesh position={[-0.3, 2.15, 0]} rotation={[0, 0, 0.35]} castShadow>
        <coneGeometry args={[0.11, 0.5, 8]} />
        <meshStandardMaterial color="#ffd66b" />
      </mesh>
      <mesh position={[0.3, 2.15, 0]} rotation={[0, 0, -0.35]} castShadow>
        <coneGeometry args={[0.11, 0.5, 8]} />
        <meshStandardMaterial color="#ffd66b" />
      </mesh>
      {/* 눈 */}
      <mesh position={[-0.25, 1.3, 0.72]}>
        <sphereGeometry args={[0.09, 8, 8]} />
        <meshStandardMaterial color="#ff5a5a" emissive="#ff2a2a" emissiveIntensity={1.4} />
      </mesh>
      <mesh position={[0.25, 1.3, 0.72]}>
        <sphereGeometry args={[0.09, 8, 8]} />
        <meshStandardMaterial color="#ff5a5a" emissive="#ff2a2a" emissiveIntensity={1.4} />
      </mesh>
      <pointLight ref={glow} position={[0, 1.6, 0]} color="#b06cff" intensity={1.2} distance={6} />
      {/* 간판(5~6)보다 위, 아바타 이름표(10~20)보다 아래 — 떠오르는 숫자가
          주변 간판에 가려지지 않게 한 칸 올려 둔다 */}
      <Html position={[0, 2.9, 0]} center distanceFactor={18} zIndexRange={[9, 0]}>
        <div className={`boss-tag${hpRatio < 0.2 ? " low" : ""}`}>
          <div className="boss-name">🧿 장터 도깨비 <span>주간 토벌</span></div>
          {/* 잔상 체력바: 앞 바는 즉시 줄고 뒤 바가 늦게 따라와 '얼마나 깎였나'가 보인다 */}
          <div className="boss-hp">
            <b style={{ width: `${hpRatio * 100}%` }} />
            <i style={{ width: `${hpRatio * 100}%` }} />
          </div>
          <div className="boss-sub">{boss.remaining} / 2000 · 내 기여 {boss.myContrib}</div>
          {pops.map((p) => (
            <span key={p.id} className={`boss-dmg${p.mine ? " mine" : ""}`}>
              −{p.amount}
            </span>
          ))}
        </div>
      </Html>
    </group>
  );
}

/** 광장 길드 깃발 — 이번 주 등반 상위 길드가 게양된다 (온체인 순위) */
function GuildFlags() {
  const guilds = useStore((s) => s.guilds);
  const top = guilds.filter((g) => g.dungeon.floor > 0).slice(0, 3);
  if (top.length === 0) return null;
  return (
    <group position={[11, 0, -9]}>
      {top.map((g, i) => {
        const h = 5.2 - i * 0.9;
        const x = i * 2.2;
        return (
          <group key={g.id} position={[x, 0, i * 0.6]}>
            <mesh position={[0, h / 2, 0]} castShadow>
              <cylinderGeometry args={[0.07, 0.09, h, 8]} />
              <meshStandardMaterial color="#5d4a33" />
            </mesh>
            <mesh position={[0.55, h - 0.55, 0]} castShadow>
              <boxGeometry args={[1.1, 0.75, 0.04]} />
              <meshStandardMaterial color={i === 0 ? "#b8433a" : i === 1 ? "#3d5a8f" : "#4a6b4f"} />
            </mesh>
            <Html position={[0.55, h - 0.55, 0.1]} center distanceFactor={16} zIndexRange={[5, 0]}>
              <div className="flag-label">
                {i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"} {g.emblem} {g.name} · {g.dungeon.floor}층
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

/**
 * 실시간 조명 상태. 매 프레임이 아니라 30초마다 갱신한다 —
 * 조명은 분 단위로만 눈에 띄게 변하므로 리렌더를 아낄 수 있다.
 */
function useDaylight(): DaylightState {
  const [light, setLight] = useState(() => currentDaylight());
  useEffect(() => {
    const id = setInterval(() => setLight(currentDaylight()), 30_000);
    return () => clearInterval(id);
  }, []);
  return light;
}

export default function Village() {
  const sun = useDaylight();

  return (
    <group>
      <color attach="background" args={[sun.sky]} />
      <fog attach="fog" args={[sun.sky, 45, 110]} />

      <ambientLight intensity={sun.ambient} />
      <directionalLight
        position={sun.sunPosition}
        intensity={sun.sunIntensity}
        color={sun.sunColor}
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

      {HANOKS.map((h, i) => (
        <Hanok key={i} {...h} />
      ))}

      {TREES.map((t, i) => (
        <Tree key={i} {...t} />
      ))}

      <Campfire />
      <BossGoblin />
      <GuildFlags />
      {LANTERNS.map(([x, z], i) => (
        <Lantern key={i} position={[x, 0, z]} glow={sun.lantern} />
      ))}

      {BILLBOARDS.map((b, i) => (
        <Billboard key={i} {...b} />
      ))}
    </group>
  );
}
