import { Html } from "@react-three/drei";
import { useStore } from "../state/store";
import { Hanok } from "./Village";
import type { Stall } from "../types";

function hover(on: boolean) {
  document.body.style.cursor = on ? "pointer" : "auto";
}

/** 좌판 노점: 평상 + 기둥 + 차양 + 상품 */
function StallBooth({ stall }: { stall: Stall }) {
  const awning = `#${((stall.ownerName.length * 2654435761) % 0xffffff | 0x404040).toString(16).padStart(6, "0")}`;
  return (
    <group
      position={[stall.x, 0, stall.z]}
      onClick={(e) => {
        e.stopPropagation();
        useStore.getState().setStallView(stall.id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        hover(true);
      }}
      onPointerOut={() => hover(false)}
    >
      {/* 평상(좌판) */}
      <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.0, 0.16, 1.3]} />
        <meshStandardMaterial color="#a3794f" />
      </mesh>
      {[
        [-0.85, -0.5],
        [0.85, -0.5],
        [-0.85, 0.5],
        [0.85, 0.5],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.22, z]} castShadow>
          <boxGeometry args={[0.12, 0.44, 0.12]} />
          <meshStandardMaterial color="#7a5836" />
        </mesh>
      ))}
      {/* 차양 기둥 + 천 */}
      <mesh position={[-0.95, 1.25, -0.6]} castShadow>
        <cylinderGeometry args={[0.045, 0.045, 1.7, 8]} />
        <meshStandardMaterial color="#6b4a30" />
      </mesh>
      <mesh position={[0.95, 1.25, -0.6]} castShadow>
        <cylinderGeometry args={[0.045, 0.045, 1.7, 8]} />
        <meshStandardMaterial color="#6b4a30" />
      </mesh>
      <mesh position={[0, 2.12, -0.15]} rotation={[0.32, 0, 0]} castShadow>
        <boxGeometry args={[2.3, 0.05, 1.5]} />
        <meshStandardMaterial color={awning} />
      </mesh>
      {/* 상품 진열 */}
      {stall.items.slice(0, 3).map((it, i) => (
        <mesh key={it.id} position={[-0.6 + i * 0.6, 0.62, 0.1]} castShadow>
          <boxGeometry args={[0.34, 0.22, 0.34]} />
          <meshStandardMaterial color={["#d8b45a", "#b5657a", "#5f96c4"][i % 3]} />
        </mesh>
      ))}

      <Html position={[0, 2.75, 0]} center distanceFactor={15} zIndexRange={[6, 0]}>
        <div className="stall-tag">
          <span className="badge">✓</span>
          {stall.title}
          <em>{stall.ownerName}</em>
        </div>
      </Html>
    </group>
  );
}

/** 브랜드 상점: 한옥 점포 + 현판 (클릭 판 포함) */
function BrandShop({ stall }: { stall: Stall }) {
  return (
    <group>
      <Hanok
        position={[stall.x, 0, stall.z]}
        rotation={stall.z > 0 ? Math.PI : 0}
        w={5.2}
        d={4}
        tint="#efe3cd"
        sign={stall.title}
        tag={stall.tag}
      />
      {/* 클릭 판정용 투명 박스 */}
      <mesh
        position={[stall.x, 1.8, stall.z]}
        onClick={(e) => {
          e.stopPropagation();
          useStore.getState().setStallView(stall.id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          hover(true);
        }}
        onPointerOut={() => hover(false)}
      >
        <boxGeometry args={[6, 4.4, 5]} />
        <meshStandardMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

export default function Stalls() {
  const stalls = useStore((s) => s.stalls);
  return (
    <>
      {stalls.map((st) =>
        st.brand ? (
          <BrandShop key={st.id} stall={st} />
        ) : (
          <StallBooth key={st.id} stall={st} />
        ),
      )}
    </>
  );
}
