import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { MeshStandardMaterial } from "three";
import { PORTAL_POS } from "./Village";

export default function Portal() {
  const ringMat = useRef<MeshStandardMaterial>(null);
  const discMat = useRef<MeshStandardMaterial>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (ringMat.current)
      ringMat.current.emissiveIntensity = 1.4 + Math.sin(t * 2.4) * 0.6;
    if (discMat.current) discMat.current.opacity = 0.45 + Math.sin(t * 1.8) * 0.15;
  });

  return (
    <group position={PORTAL_POS}>
      {/* steps */}
      <mesh position={[0, 0.15, 1.2]} receiveShadow castShadow>
        <boxGeometry args={[5, 0.3, 2.4]} />
        <meshStandardMaterial color="#8b8b84" />
      </mesh>
      {/* ring */}
      <mesh position={[0, 2.6, 0]} castShadow>
        <torusGeometry args={[2.1, 0.24, 14, 40]} />
        <meshStandardMaterial
          ref={ringMat}
          color="#5b3d8f"
          emissive="#9a6cff"
          emissiveIntensity={1.4}
        />
      </mesh>
      {/* swirl disc */}
      <mesh position={[0, 2.6, 0]}>
        <circleGeometry args={[1.9, 32]} />
        <meshStandardMaterial
          ref={discMat}
          color="#2a1a4a"
          emissive="#6a3cff"
          emissiveIntensity={0.8}
          transparent
          opacity={0.5}
          side={2}
        />
      </mesh>
      {/* pillars */}
      <mesh position={[-2.6, 1.4, 0]} castShadow>
        <boxGeometry args={[0.6, 2.8, 0.6]} />
        <meshStandardMaterial color="#6f6f68" />
      </mesh>
      <mesh position={[2.6, 1.4, 0]} castShadow>
        <boxGeometry args={[0.6, 2.8, 0.6]} />
        <meshStandardMaterial color="#6f6f68" />
      </mesh>

      <Html position={[0, 5.4, 0]} center distanceFactor={20} zIndexRange={[5, 0]}>
        <div className="portal-label">⚔ 백층 던전</div>
      </Html>
    </group>
  );
}
