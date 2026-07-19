import { useEffect, useState } from "react";
import { useStore } from "../state/store";
import {
  connectWallet,
  getBalanceEth,
  shortAddress,
  colorFromString,
} from "../wallet/wallet";
import { joinVillage } from "../net/colyseus";
import { giwaSepolia, DEMO, FAUCET_URL } from "../config/giwa";
import { loadCoupons } from "../state/coupons";
import { isDojangVerified, fundBurnerFromInjected } from "../wallet/wallet";
import { refreshBeaconBudget, marketDayLabel } from "../chain/village";
import { useUpidName } from "../wallet/upid";

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
  const pendingTx = useStore((s) => s.pendingTx);
  const [festival, setFestival] = useState(() => marketDayLabel());

  useEffect(() => {
    const id = setInterval(() => setFestival(marketDayLabel()), 60000);
    return () => clearInterval(id);
  }, []);
  const selfDojang = useStore((s) => s.selfDojang);
  const myUpid = useUpidName(walletAddress);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!walletAddress) {
      useStore.getState().setBalance(null);
      useStore.getState().setSelfDojang(false);
      return;
    }
    void isDojangVerified(walletAddress).then((v) =>
      useStore.getState().setSelfDojang(v),
    );
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
      await joinVillage({ name, address, color });
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

  return (
    <div className="hud">
      <div className="hud-card hud-topleft">
        <div className="hud-title">기와장터</div>
        <div className={`hud-status hud-status-${status}`}>
          {STATUS_LABEL[status]}
          {status === "connected" && ` · ${onlineCount}명`}
        </div>
        <div className="hud-festival">{festival}</div>
        {pendingTx > 0 && (
          <div className="hud-txchip">⛓ 체인 처리 중 {pendingTx > 1 ? pendingTx : ""}</div>
        )}
        {DEMO && (
          <div className="hud-demo">
            기본 샘플 데모 · 온체인은 실동작
            <a href={FAUCET_URL} target="_blank" rel="noreferrer">
              테스트 ETH 받기 ↗
            </a>
            <a
              href="https://github.com/Hakhyun-Kim/giwa-village#자동-시연-처음-보는-분"
              target="_blank"
              rel="noreferrer"
            >
              실제 테스트 방법 ↗
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
        {DEMO && walletAddress && walletKind === "burner" && <FundButton />}
      </div>

      <div className="hud-bottom">
        {nearBoss && boss && !boss.slain ? (
          <div className="hud-card hud-prompt">
            <b>R</b> — 도깨비 타격 (쿨다운 30초 · 함께 때려잡으세요)
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
