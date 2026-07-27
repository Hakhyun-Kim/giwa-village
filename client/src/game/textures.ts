// 반입한 표면 질감 — 절차 생성 지오메트리 위에 사진을 한 겹 씌운다.
//
// 왜 이것만 받았나: 형태는 코드가 이긴다(한옥 한 채가 몇 줄이고, 배치는 시드로
// 바뀐다). 하지만 **표면**은 다르다 — 기와의 결, 회벽의 얼룩, 흙바닥의 자갈은
// 절차 생성으로 흉내 내려면 노이즈 셰이더가 필요하고, 그러면 코드가 늘고
// 저사양에서 느려진다. 사진 한 장이 더 짧고 더 그럴듯하다.
//
// 규율은 소리와 같다: **없으면 없는 대로 선다.** 파일이 안 오면 map이 붙지 않고
// 지금까지 쓰던 색만으로 그려진다 — 404·오프라인이어도 마을이 검게 변하지 않는다.
//
// 텍스처 개수 = GPU 업로드 개수다. 같은 사진을 반복 배수만 달리해 쓰려면 clone이
// 필요한데 clone은 GPU에 따로 올라가므로, **자리마다 하나씩만** 만들어 공유한다.

import { RepeatWrapping, SRGBColorSpace, TextureLoader, type Texture } from "three";
import { useEffect, useState } from "react";

const BASE = import.meta.env.BASE_URL || "/";

export interface Surfaces {
  /** 광장·길의 다져진 흙 (바깥 풀밭에는 얹지 않는다 — 위 주석 참고) */
  plaza?: Texture;
  /** 기와지붕 */
  roof?: Texture;
  /** 기둥·평상 */
  wood?: Texture;
  /** 회벽 */
  plaster?: Texture;
}

const loader = new TextureLoader();
let ready: Surfaces | null = null;
let started = false;
const listeners = new Set<(s: Surfaces) => void>();

function get(file: string, rx: number, ry: number): Promise<Texture | null> {
  return new Promise((resolve) => {
    loader.load(
      `${BASE}tex/${file}`,
      (t) => {
        t.colorSpace = SRGBColorSpace;
        t.wrapS = RepeatWrapping;
        t.wrapT = RepeatWrapping;
        t.repeat.set(rx, ry);
        t.anisotropy = 4;
        resolve(t);
      },
      undefined,
      () => resolve(null), // 없으면 색만으로 그린다
    );
  });
}

async function loadAll(): Promise<void> {
  const [plaza, roof, wood, plaster] = await Promise.all([
    // 반복이 너무 촘촘하면 멀리서 평평한 색으로 뭉개진다 — 한 칸이 3~4m는 되게
    get("ground.jpg", 5, 5),
    get("roof.jpg", 4, 3),
    get("wood.jpg", 2, 2),
    get("plaster.jpg", 2, 1),
  ]);
  ready = {
    ...(plaza ? { plaza } : {}),
    ...(roof ? { roof } : {}),
    ...(wood ? { wood } : {}),
    ...(plaster ? { plaster } : {}),
  };
  for (const fn of listeners) fn(ready);
}

/**
 * 한 번만 받아 모두가 나눠 쓴다. 받는 동안에는 빈 객체를 돌려주므로
 * 첫 프레임은 색만으로 뜨고, 도착하면 조용히 질감이 얹힌다.
 */
export function useSurfaces(): Surfaces {
  const [s, setS] = useState<Surfaces>(() => ready ?? {});
  useEffect(() => {
    if (ready) {
      setS(ready);
      return;
    }
    listeners.add(setS);
    if (!started) {
      started = true;
      void loadAll();
    }
    return () => {
      listeners.delete(setS);
    };
  }, []);
  return s;
}
