import { useEffect, useState } from "react";
import { useStore } from "../state/store";
import {
  connectWallet,
  getBalanceEth,
  shortAddress,
  colorFromString,
} from "../wallet/wallet";
import { joinVillage } from "../net/colyseus";
import { giwaSepolia, FAUCET_URL } from "../config/giwa";
import { loadCoupons } from "../state/coupons";
import { fundBurnerFromInjected } from "../wallet/wallet";
import { refreshBeaconBudget, marketDayLabel } from "../chain/village";
import {
  hopaeAvailable,
  linkHopaeFromInjected,
  unlinkHopae,
  useIdentity,
  type Identity,
} from "../wallet/identity";
import { currentDaylight } from "../game/daylight";
import { ambiencePreference, setAmbience } from "../audio/ambience";

function StallButtons({ walletAddress }: { walletAddress: string }) {
  const myStall = useStore((s) =>
    s.stalls.find(
      (st) => !st.brand && st.ownerAddress.toLowerCase() === walletAddress.toLowerCase(),
    ),
  );
  useStore((s) => s.couponsVersion);
  const couponCount = loadCoupons(walletAddress).length;

  const [bagOpen, setBagOpen] = useState(false);

  return (
    <div className="hud-stall-btns">
      {/* 내 노점: 없으면 개설, 있으면 장부(닫기 포함) */}
      <button
        className="hud-btn sub"
        onClick={() =>
          myStall
            ? useStore.getState().setLedgerOpen(true)
            : useStore.getState().setStallOpenDialog(true)
        }
      >
        🧺 {myStall ? "내 노점" : "노점 열기"}
      </button>
      {/* 가방: 쿠폰·칭호/장신구·공방 통합 진입점 */}
      <div className="hud-bag">
        <button className="hud-btn sub" onClick={() => setBagOpen((v) => !v)}>
          👜 가방 {couponCount > 0 ? couponCount : ""}
        </button>
        {bagOpen && (
          <div className="hud-bag-menu" onMouseLeave={() => setBagOpen(false)}>
            <button
              onClick={() => {
                setBagOpen(false);
                useStore.getState().setCouponsOpen(true);
              }}
            >
              🎫 쿠폰함 {couponCount > 0 ? `(${couponCount})` : ""}
            </button>
            <button
              onClick={() => {
                setBagOpen(false);
                useStore.getState().setHonorsOpen(true);
              }}
            >
              🎖 칭호 · 장신구
            </button>
            <button
              onClick={() => {
                setBagOpen(false);
                useStore.getState().setWorkshopOpen(true);
              }}
            >
              🎨 문양 공방
            </button>
          </div>
        )}
      </div>
      <button
        className="hud-btn sub"
        onClick={() => useStore.getState().setGuildOpen(true)}
      >
        🏯 길드
      </button>
    </div>
  );
}

/** 데모(서버리스) 모드: 방문자 자신의 지갑에서 버너로 테스트넷 ETH 충전 */
function FundButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onFund() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await fundBurnerFromInjected("0.002");
      const addr = useStore.getState().walletAddress;
      if (addr) useStore.getState().setBalance(await getBalanceEth(addr));
      void refreshBeaconBudget();
      setMsg("충전 완료! 이제 거래·비컨이 활성화됩니다");
      setTimeout(() => setMsg(null), 5000);
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      setMsg(m.length > 90 ? m.slice(0, 90) + "…" : m);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hud-stall-btns">
      <button
        className="hud-btn sub"
        onClick={onFund}
        disabled={busy}
        title="내 지갑(MetaMask 등)에서 이 버너로 0.002 테스트넷 ETH를 보냅니다 — 서명 팝업 1회"
      >
        {busy ? "충전 중…" : "🦊 내 지갑에서 충전"}
      </button>
      {msg && <div className="hud-fund-msg">{msg}</div>}
    </div>
  );
}

/**
 * 호패: 버너 뒤에 선 사람을 밝힌다. UP.ID 를 가진 내 지갑이 가스 없이 서명 한 번 하면
 * 이름표 · 노점 · 흥정 상대에게 그 사람의 UP.ID 와 업비트 인증이 보인다.
 */
function HopaeButton({ identity }: { identity: Identity | null }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (!hopaeAvailable || !identity) return null;

  async function run(fn: () => Promise<string>) {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      setMsg(await fn());
      setTimeout(() => setMsg(null), 5000);
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      setMsg(m.length > 90 ? m.slice(0, 90) + "…" : m);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hud-stall-btns">
      {identity.linked ? (
        <button
          className="hud-btn sub"
          onClick={() =>
            run(async () => {
              await unlinkHopae();
              return "호패를 내려놓았습니다";
            })
          }
          disabled={busy}
          title="이 버너에 건 호패를 내려놓습니다 — 이름표가 다시 나그네로 돌아갑니다"
        >
          {busy ? "처리 중…" : "🪪 호패 내려놓기"}
        </button>
      ) : (
        <button
          className="hud-btn sub"
          onClick={() =>
            run(async () => {
              const id = await linkHopaeFromInjected();
              return `호패를 걸었습니다 — 이제 ${id.name ?? "업비트 인증 상인"}(으)로 보입니다`;
            })
          }
          disabled={busy}
          title="UP.ID 를 가진 내 지갑이 서명 한 번(가스 없음)으로 이 버너를 대리로 세웁니다 — 이름표 · 노점에 UP.ID 와 인증이 보입니다"
        >
          {busy ? "서명 기다리는 중…" : "🪪 UP.ID 호패 걸기"}
        </button>
      )}
      {msg && <div className="hud-fund-msg">{msg}</div>}
    </div>
  );
}

const STATUS_LABEL = {
  connecting: "연결 중…",
  connected: "온라인",
  offline: "오프라인 (서버 확인 필요)",
} as const;

export default function Hud() {
  const status = useStore((s) => s.status);
  const onlineCount = useStore((s) => s.onlineCount);
  const walletAddress = useStore((s) => s.walletAddress);
  const walletKind = useStore((s) => s.walletKind);
  const walletSlot = useStore((s) => s.walletSlot);
  const balanceEth = useStore((s) => s.balanceEth);
  const walletError = useStore((s) => s.walletError);
  const nearPortal = useStore((s) => s.nearPortal);
  const nearFire = useStore((s) => s.nearFire);
  const selfSitting = useStore((s) => s.selfSitting);
  const nearBoss = useStore((s) => s.nearBoss);
  const boss = useStore((s) => s.boss);
  const bossSlain = !!boss?.slain;
  const bossNextStrikeAt = boss?.nextStrikeAt ?? 0;
  const pendingTx = useStore((s) => s.pendingTx);
  const [festival, setFestival] = useState(() => marketDayLabel());
  const [phase, setPhase] = useState(() => currentDaylight().label);
  const [soundOn, setSoundOn] = useState(false);
  const [bossNow, setBossNow] = useState(() => Date.now() / 1000);

  useEffect(() => {
    const id = setInterval(() => {
      setFestival(marketDayLabel());
      setPhase(currentDaylight().label);
    }, 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!nearBoss || bossSlain || bossNextStrikeAt <= 0) return;
    setBossNow(Date.now() / 1000);
    const id = setInterval(() => setBossNow(Date.now() / 1000), 1000);
    return () => clearInterval(id);
  }, [nearBoss, bossSlain, bossNextStrikeAt]);

  // 지난 방문에 켜 뒀다면 상태를 복원한다. 다만 자동재생 정책상 소리는
  // 사용자가 화면을 한 번 건드린 뒤에야 날 수 있어, 첫 입력까지 기다린다.
  useEffect(() => {
    if (!ambiencePreference()) return;
    setSoundOn(true);
    const start = () => {
      void setAmbience(true);
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
    };
    window.addEventListener("pointerdown", start);
    window.addEventListener("keydown", start);
    return () => {
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
    };
  }, []);

  // 환영 카드가 첫 선택 클릭에 풍류를 켜 주면 아이콘도 따라온다
  useEffect(() => {
    const sync = () => setSoundOn(ambiencePreference());
    window.addEventListener("giwa-ambience", sync);
    return () => window.removeEventListener("giwa-ambience", sync);
  }, []);

  async function toggleSound() {
    const next = !soundOn;
    setSoundOn(await setAmbience(next));
  }
  const myIdentity = useIdentity(walletAddress);
  const selfDojang = !!myIdentity?.dojang;
  const myUpid = myIdentity?.name ?? null;
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!walletAddress) {
      useStore.getState().setBalance(null);
      return;
    }
    let stop = false;
    const tick = async () => {
      try {
        const eth = await getBalanceEth(walletAddress);
        if (!stop) useStore.getState().setBalance(eth);
      } catch {
        // rate-limited testnet RPC — keep last known balance
      }
    };
    void tick();
    const id = setInterval(tick, 15000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [walletAddress]);

  async function onConnect() {
    if (busy) return;
    setBusy(true);
    const store = useStore.getState();
    try {
      const address = await connectWallet();
      const name = shortAddress(address);
      const color = colorFromString(address.toLowerCase());
      store.setWallet(address, "injected");
      store.setSelfIdentity(name, color);
      await joinVillage();
    } catch (err) {
      store.setWalletError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function onCopy() {
    if (!walletAddress) return;
    void navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  const bossCooldown = boss
    ? Math.max(0, Math.ceil(boss.nextStrikeAt - bossNow))
    : 0;

  return (
    <div className="hud">
      <div className="hud-card hud-topleft">
        <div className="hud-title">기와장터</div>
        <div className={`hud-status hud-status-${status}`}>
          {STATUS_LABEL[status]}
          {status === "connected" && ` · ${onlineCount}명`}
        </div>
        <div className="hud-festival">{festival}</div>
        <div className="hud-ambient">
          <span title="마을 시각은 한국 시간(KST)을 따릅니다">🕰 {phase}</span>
          <button
            className={`hud-sound${soundOn ? " on" : ""}`}
            onClick={toggleSound}
            title={
              soundOn
                ? "풍류 끄기"
                : "풍류 켜기 (즉석 생성 국악풍 배경음 + 거래·타격 효과음)"
            }
          >
            {soundOn ? "🎵" : "🔇"} 풍류
          </button>
        </div>
        {pendingTx > 0 && (
          <div className="hud-txchip">⛓ 체인 처리 중 {pendingTx > 1 ? pendingTx : ""}</div>
        )}
        {walletKind === "burner" && (
          <div className="hud-demo">
            마을 기록 · GIWA Sepolia
            <a href={FAUCET_URL} target="_blank" rel="noreferrer">
              테스트 ETH 받기 ↗
            </a>
            <a
              href="https://github.com/Hakhyun-Kim/giwa-village/blob/main/guide/PLAY.md"
              target="_blank"
              rel="noreferrer"
            >
              실제 테스트 방법 ↗
            </a>
            <a
              href="?gaekju=1"
              onClick={(e) => {
                e.preventDefault();
                useStore.getState().setGaekjuOpen(true);
              }}
              title="장터 전체의 에스크로 원장 — 보관 · 정산 · 환불 · 대사 (읽기 전용 · 지갑 없이 열린다)"
            >
              📜 객주 장부
            </a>
            <a
              href="https://github.com/Hakhyun-Kim/giwa-village/blob/main/guide/PRIVACY.md"
              target="_blank"
              rel="noreferrer"
              title="테스트넷 전용 · 금전 가치 없음 · 체인 기록은 지울 수 없음 (v0 초안)"
            >
              처리방침 · 약관 ↗
            </a>
          </div>
        )}
      </div>

      <div className="hud-topright">
        {walletAddress ? (
          <div className="hud-card hud-wallet">
            <span className="dot" />
            {walletKind === "burner" && (
              <span className="slot">슬롯 {walletSlot}</span>
            )}
            {selfDojang && <span className="dojang">Dojang ✔</span>}
            {myIdentity?.linked && (
              <span className="dojang" title={`호패 — ${myIdentity.holder} 가 이 버너를 대리로 세웠습니다`}>
                🪪
              </span>
            )}
            <button
              className="addr"
              onClick={onCopy}
              title={`${walletAddress} (클릭하여 복사)`}
            >
              {copied ? "복사됨!" : (myUpid ?? shortAddress(walletAddress))}
            </button>
            <span className="balance">
              {balanceEth === null ? "…" : balanceEth} ETH
            </span>
            <a
              className="chain"
              href={`${giwaSepolia.blockExplorers.default.url}/address/${walletAddress}`}
              target="_blank"
              rel="noreferrer"
            >
              GIWA Sepolia ↗
            </a>
          </div>
        ) : (
          <button className="hud-btn" onClick={onConnect} disabled={busy}>
            {busy ? "연결 중…" : "지갑 연결"}
          </button>
        )}
        {walletError && <div className="hud-error">{walletError}</div>}
        {walletAddress && <StallButtons walletAddress={walletAddress} />}
        {walletAddress && walletKind === "burner" && <FundButton />}
        {walletAddress && walletKind === "burner" && <HopaeButton identity={myIdentity} />}
      </div>

      <div className="hud-bottom">
        {nearBoss && boss && !boss.slain ? (
          <div className="hud-card hud-prompt">
            {bossCooldown > 0 ? (
              <>🕰 다음 타격까지 <b>{bossCooldown}초</b> · 이모트로 동료를 응원하세요</>
            ) : (
              <><b>R</b> — 도깨비 타격 준비 완료 · 함께 때려잡으세요</>
            )}
          </div>
        ) : nearFire ? (
          <div className="hud-card hud-prompt">
            <b>X</b> — {selfSitting ? "일어나기" : "모닥불 쬐기 (함께 쬐면 온기가 쌓입니다)"}
          </div>
        ) : nearPortal ? (
          <div className="hud-card hud-prompt">
            <b>F</b> — 백층 던전 입장
          </div>
        ) : (
          <div className="hud-card hud-hint">
            WASD 이동 · E 인사 · 아바타 클릭 선물 · 노점/상점 클릭 구매 · 포털 F
          </div>
        )}
      </div>
    </div>
  );
}
