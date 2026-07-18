import { useState } from "react";
import { useStore } from "../state/store";
import { createGuild, joinGuild, leaveGuild } from "../net/colyseus";
import { shortAddress } from "../wallet/wallet";

const EMBLEMS = ["🏯", "🐯", "🐉", "🌸", "⚔️", "🍶", "🎏", "🐢"];

export default function GuildDialog() {
  const open = useStore((s) => s.guildOpen);
  const guilds = useStore((s) => s.guilds);
  const walletAddress = useStore((s) => s.walletAddress);
  const error = useStore((s) => s.guildError);
  const [name, setName] = useState("");
  const [emblem, setEmblem] = useState(EMBLEMS[0]);

  if (!open) return null;

  const myGuild = walletAddress
    ? guilds.find((g) =>
        g.members.some(
          (m) => m.address.toLowerCase() === walletAddress.toLowerCase(),
        ),
      )
    : undefined;

  function close() {
    useStore.getState().setGuildOpen(false);
  }

  function onCreate() {
    if (!name.trim()) {
      useStore.getState().setGuildError("길드 이름을 입력하세요.");
      return;
    }
    createGuild(name.trim(), emblem);
    setName("");
  }

  function goDungeon() {
    close();
    useStore.getState().setDungeonOpen(true);
  }

  return (
    <div className="gift-overlay" onClick={close}>
      <div className="gift-modal guild-modal" onClick={(e) => e.stopPropagation()}>
        <div className="gift-emoji">{myGuild?.emblem ?? "🏯"}</div>
        <div className="gift-title">{myGuild ? myGuild.name : "길드"}</div>

        {!walletAddress && (
          <div className="gift-warn">지갑이 있어야 길드에 참여할 수 있습니다.</div>
        )}

        {myGuild ? (
          <>
            <div className="gift-sub">
              길드원 {myGuild.members.length}명 · 이번 주{" "}
              <b>{myGuild.dungeon.floor}층</b> · 최고 {myGuild.dungeon.best}층 ·
              원정 {myGuild.dungeon.runs}회
            </div>
            <div className="guild-members">
              {myGuild.members.map((m) => (
                <span key={m.address} className="guild-member" title={m.address}>
                  {m.name || shortAddress(m.address)}
                </span>
              ))}
            </div>
            <div className="gift-actions">
              <button className="gift-btn" onClick={() => leaveGuild()}>
                탈퇴
              </button>
              <button className="gift-btn primary" onClick={goDungeon}>
                ⚔ 원정 떠나기
              </button>
            </div>
          </>
        ) : (
          walletAddress && (
            <>
              <div className="gift-sub">
                길드를 만들거나 가입해 <b>백층 던전</b>을 함께 등반하세요
              </div>
              <input
                className="gift-input wide"
                placeholder="길드 이름 (예: 달빛 원정대)"
                maxLength={12}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <div className="guild-emblems">
                {EMBLEMS.map((em) => (
                  <button
                    key={em}
                    className={`guild-emblem ${em === emblem ? "on" : ""}`}
                    onClick={() => setEmblem(em)}
                  >
                    {em}
                  </button>
                ))}
              </div>
              <div className="gift-actions">
                <button className="gift-btn" onClick={close}>
                  닫기
                </button>
                <button className="gift-btn primary" onClick={onCreate}>
                  길드 창설
                </button>
              </div>
            </>
          )
        )}

        {error && <div className="gift-warn">{error}</div>}

        <div className="guild-board">
          <div className="guild-board-title">이번 주 등반 순위</div>
          {guilds.length === 0 && (
            <div className="gift-note">아직 길드가 없습니다 — 첫 길드를 만들어보세요.</div>
          )}
          {guilds.map((g, i) => (
            <div key={g.id} className="guild-row">
              <span className="guild-rank">{i + 1}</span>
              <span className="guild-name">
                {g.emblem} {g.name}
              </span>
              <span className="guild-floor">{g.dungeon.floor}층</span>
              <span className="guild-count">{g.members.length}명</span>
              {!myGuild && walletAddress && (
                <button
                  className="gift-btn small"
                  onClick={() => joinGuild(g.id)}
                >
                  가입
                </button>
              )}
            </div>
          ))}
        </div>

        {myGuild && (
          <div className="gift-actions">
            <button className="gift-btn" onClick={close}>
              닫기
            </button>
          </div>
        )}
        <div className="gift-note">
          던전 시드는 매주 GIWA 블록 해시로 고정 · 길드원들이 각자의 시간에
          이어 등반하는 비동기 코업 · 보상은 양도 불가(소울바운드) 원칙
        </div>
      </div>
    </div>
  );
}
