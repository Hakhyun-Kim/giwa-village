import { useEffect, useState } from "react";
import { useStore } from "../state/store";
import {
  connectWallet,
  getBalanceEth,
  shortAddress,
  colorFromString,
} from "../wallet/wallet";
import { joinVillage, closeStall } from "../net/colyseus";
import { giwaSepolia, DEMO, FAUCET_URL } from "../config/giwa";
import { loadCoupons } from "../state/coupons";
import { unlistOnMarket, isDojangVerified } from "../wallet/wallet";
import { useUpidName } from "../wallet/upid";

function StallButtons({ walletAddress }: { walletAddress: string }) {
  const myStall = useStore((s) =>
    s.stalls.find(
      (st) => !st.brand && st.ownerAddress.toLowerCase() === walletAddress.toLowerCase(),
    ),
  );
  useStore((s) => s.couponsVersion);
  const couponCount = loadCoupons(walletAddress).length;

  return (
    <div className="hud-stall-btns">
      {myStall ? (
        <button
          className="hud-btn sub"
          onClick={() => {
            closeStall();
            // 같은 지갑 병렬 전송은 nonce 충돌 — 언리스팅도 순차로
            const items = [...myStall.items];
            void (async () => {
              for (const it of items) {
                await unlistOnMarket(it.id).catch(() => {});
              }
            })();
          }}
        >
          🧺 노점 닫기
        </button>
      ) : (
        <button
          className="hud-btn sub"
          onClick={() => useStore.getState().setStallOpenDialog(true)}
        >
          🧺 노점 열기
        </button>
      )}
      <button
        className="hud-btn sub"
        onClick={() => useStore.getState().setCouponsOpen(true)}
      >
        🎫 쿠폰함 {couponCount > 0 ? couponCount : ""}
      </button>
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
        {DEMO && (
          <div className="hud-demo">
            데모 모드 · 온체인은 실동작
            <a href={FAUCET_URL} target="_blank" rel="noreferrer">
              테스트 ETH 받기 ↗
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
      </div>

      <div className="hud-bottom">
        {nearPortal ? (
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
