import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import { touchInput } from "../game/touch";

/** 키 입력을 재사용하기 위해 합성 키이벤트를 쏜다 (Player의 핸들러가 받는다) */
function pressKey(code: string) {
  window.dispatchEvent(new KeyboardEvent("keydown", { code }));
  window.dispatchEvent(new KeyboardEvent("keyup", { code }));
}

/** 모바일 터치 조작 — 가상 조이스틱(왼쪽) + 상황별 액션 버튼(오른쪽) */
export default function TouchControls() {
  const [isTouch, setIsTouch] = useState(false);
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const activeId = useRef<number | null>(null);

  const nearFire = useStore((s) => s.nearFire);
  const nearPortal = useStore((s) => s.nearPortal);
  const nearBoss = useStore((s) => s.nearBoss);
  const selfSitting = useStore((s) => s.selfSitting);
  const boss = useStore((s) => s.boss);

  useEffect(() => {
    setIsTouch(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  if (!isTouch) return null;

  const RADIUS = 52;

  function setKnob(dx: number, dz: number) {
    if (knobRef.current) {
      knobRef.current.style.transform = `translate(${dx * RADIUS}px, ${dz * RADIUS}px)`;
    }
  }

  function onMove(e: React.PointerEvent) {
    if (activeId.current !== e.pointerId || !baseRef.current) return;
    const r = baseRef.current.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cz = r.top + r.height / 2;
    let dx = (e.clientX - cx) / RADIUS;
    let dz = (e.clientY - cz) / RADIUS;
    const len = Math.hypot(dx, dz);
    if (len > 1) {
      dx /= len;
      dz /= len;
    }
    touchInput.x = dx;
    touchInput.z = dz;
    setKnob(dx, dz);
  }

  function onDown(e: React.PointerEvent) {
    activeId.current = e.pointerId;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    onMove(e);
  }

  function onUp(e: React.PointerEvent) {
    if (activeId.current !== e.pointerId) return;
    activeId.current = null;
    touchInput.x = 0;
    touchInput.z = 0;
    setKnob(0, 0);
  }

  return (
    <>
      <div
        ref={baseRef}
        className="joystick"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <div ref={knobRef} className="joystick-knob" />
      </div>
      <div className="touch-actions">
        {nearBoss && boss && !boss.slain && (
          <button className="touch-btn boss" onClick={() => pressKey("KeyR")}>
            🧿
            <span>타격</span>
          </button>
        )}
        {nearFire && (
          <button className="touch-btn" onClick={() => pressKey("KeyX")}>
            🔥
            <span>{selfSitting ? "일어나기" : "앉기"}</span>
          </button>
        )}
        {nearPortal && (
          <button className="touch-btn" onClick={() => pressKey("KeyF")}>
            ⚔
            <span>던전</span>
          </button>
        )}
        <button className="touch-btn" onClick={() => pressKey("KeyE")}>
          👋
          <span>인사</span>
        </button>
      </div>
    </>
  );
}
