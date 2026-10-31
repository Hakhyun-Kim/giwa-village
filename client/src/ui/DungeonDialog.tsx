import { useEffect, useState } from "react";
import { useStore } from "../state/store";
import { chainDungeonEnter as dungeonEnter, chainDungeonPick as dungeonPick, chainDungeonBank as dungeonBank } from "../chain/village";
import { verifyLastRun } from "../chain/guilds";
import { giwaSepolia, DUNGEON_URL } from "../config/giwa";
import {
  DOOR_PROFILES,
  OMEN_NOTE,
  OMEN_WORDS,
  omenRecap,
  practicePick,
  startPractice,
  type PracticeRun,
} from "@giwa-village/core";
import { goField } from "../net/expedition";
import { fieldWalk } from "../state/world";

type Proof = ReturnType<typeof verifyLastRun>;

const OUTCOME_TEXT = {
  safe: "🕯️ 무사히 올랐다 — +1층",
  bonus: "🌬️ 순풍이 분다 — +2층!",
  trap: "💥 함정! 이번 원정의 수확을 잃었다…",
} as const;

/** 방금 연 문 앞에서 들었던 기척을 되짚는다 — 기척을 읽는 법은 결과와 나란히 볼 때 배운다 */
function Recap({ heard, door, outcome }: { heard?: { door: number; shows: "safe" | "bonus" | "trap" }; door?: number; outcome?: "safe" | "bonus" | "trap" }) {
  if (!heard || door === undefined || !outcome) return null;
  return <div className="gift-note dungeon-recap">{omenRecap(heard, door, outcome)}</div>;
}

const DOOR_ODDS = ["함정 15%", "함정 25% · 순풍 20%", "함정 40% · 순풍 35%"];

/** 연습 원정의 시드 — 이 브라우저가 뽑는다. 체인 블록이 아니므로 기록 · 검증 대상이 아니다 */
function practiceSeed(): `0x${string}` {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return `0x${[...b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

/** 기척 읽기 연습 — 길드 · 지갑 · 가스 없이 같은 문 규칙으로 몇 걸음 올라 본다 */
function Practice({ onExit }: { onExit: () => void }) {
  const [run, setRun] = useState<PracticeRun>(() => startPractice(practiceSeed()));
  return (
    <>
      <div className="gift-sub">
        👂 기척 읽기 연습 · <b>{run.climbed}층</b> — 가스 0 · 체인에 남지 않는 연습 판
      </div>
      <div className="dungeon-result">
        {run.lastOutcome ? OUTCOME_TEXT[run.lastOutcome] : "문 앞의 기척을 듣고 골라 보세요"}
      </div>
      <Recap heard={run.heard} door={run.lastDoor} outcome={run.lastOutcome} />
      {run.ended ? (
        <div className="gift-actions">
          <button className="gift-btn" onClick={onExit}>
            그만하기
          </button>
          <button className="gift-btn primary" onClick={() => setRun(startPractice(practiceSeed()))}>
            한 판 더
          </button>
        </div>
      ) : (
        <>
          <div className="dungeon-omen">
            👂 {DOOR_PROFILES[run.omen.door].emoji} {DOOR_PROFILES[run.omen.door].name} {OMEN_WORDS[run.omen.shows]}
            <small>{OMEN_NOTE}</small>
          </div>
          <div className="dungeon-doors">
            {DOOR_PROFILES.map((door) => (
              <button
                key={door.id}
                className={run.omen.door === door.id ? "dungeon-door omen" : "dungeon-door"}
                onClick={() => setRun((r) => practicePick(r, door.id))}
                title={`${door.name} · ${door.style}`}
              >
                <span>{door.emoji}</span>
                <b>{door.name}</b>
                <em>{DOOR_ODDS[door.id]}</em>
              </button>
            ))}
          </div>
          <div className="gift-actions">
            <button className="gift-btn" onClick={onExit}>
              그만하기
            </button>
            <button
              className="gift-btn primary"
              disabled={run.climbed === 0}
              onClick={() => setRun((r) => ({ ...r, ended: true, lastOutcome: undefined, heard: undefined }))}
            >
              귀환 — {run.climbed}층에서 멈추기
            </button>
          </div>
        </>
      )}
    </>
  );
}

export default function DungeonDialog() {
  const open = useStore((s) => s.dungeonOpen);
  const dungeon = useStore((s) => s.dungeon);
  const guilds = useStore((s) => s.guilds);
  const walletAddress = useStore((s) => s.walletAddress);
  const error = useStore((s) => s.guildError);
  const busy = useStore((s) => s.guildBusy);
  const [proof, setProof] = useState<Proof>(null);
  const [practicing, setPracticing] = useState(false);

  const myGuild = walletAddress
    ? guilds.find((g) =>
        g.members.some(
          (m) => m.address.toLowerCase() === walletAddress.toLowerCase(),
        ),
      )
    : undefined;
  const myGuildId = myGuild?.id;

  // 다이얼로그가 열리면 원정 세션을 시작한다
  useEffect(() => {
    if (open && myGuildId) dungeonEnter();
  }, [open, myGuildId]);

  if (!open) return null;

  function close() {
    setPracticing(false);
    useStore.getState().setDungeonOpen(false);
    useStore.getState().setDungeon(null);
  }

  function goGuild() {
    close();
    useStore.getState().setGuildOpen(true);
  }

  const explorer = giwaSepolia.blockExplorers.default.url;

  return (
    <div className="gift-overlay" onClick={close}>
      <div className="gift-modal" onClick={(e) => e.stopPropagation()}>
        <div className="gift-emoji">⚔</div>
        <div className="gift-title">백층 던전</div>

        {!myGuild && practicing ? (
          <Practice onExit={() => setPracticing(false)} />
        ) : !myGuild ? (
          <>
            <div className="gift-sub">
              던전은 <b>길드 원정</b>입니다 — 길드원들이 각자의 시간에
              이어 등반하는 비동기 코업
            </div>
            {error && <div className="gift-warn">{error}</div>}
            <div className="gift-actions">
              <button className="gift-btn" onClick={close}>
                닫기
              </button>
              {/* 길드가 없고 잔액도 없으면 여기가 막다른 길이었다 — 가스 0 인 산채 연습으로 가는 문을 함께 둔다 */}
              <button
                className="gift-btn"
                onClick={() => {
                  goField("길드가 없어도 산채에서 혼자 연습할 수 있어요. 다솔을 따라 북쪽 입구로 가세요.");
                  fieldWalk.active = true;
                }}
              >
                🌲 산채 혼자 연습
              </button>
              <button className="gift-btn" onClick={() => setPracticing(true)}>
                👂 기척 읽기 연습
              </button>
              <button className="gift-btn primary" onClick={goGuild}>
                🏯 길드 보러가기
              </button>
            </div>
          </>
        ) : !dungeon ? (
          <div className="gift-sub">입장 중…</div>
        ) : (
          <>
            <div className="gift-sub">
              {dungeon.emblem} {dungeon.guildName} · 원정 #{dungeon.attempt} ·
              이번 주 <b>{dungeon.floor}층</b>
              {dungeon.tentative > 0 && (
                <span className="dungeon-tentative"> +{dungeon.tentative}</span>
              )}
            </div>

            {dungeon.ended ? (
              <>
                <div className="dungeon-result">
                  {dungeon.banked
                    ? `🏮 +${dungeon.banked}층 확정! 길드가 ${dungeon.floor}층에 도달했다`
                    : (OUTCOME_TEXT[dungeon.lastOutcome ?? "trap"] ?? "")}
                </div>
                {!dungeon.banked && (
                  <Recap heard={dungeon.heard} door={dungeon.lastDoor} outcome={dungeon.lastOutcome} />
                )}
                {dungeon.banked ? (
                  <div className="gift-note">
                    {proof ? (
                      proof.matches ? (
                        <span>
                          🔒 검증됨 — 블록 시드로부터 <b>+{proof.reproduced}층</b>을 그대로
                          재현했고 온체인 확정값과 일치합니다. 누구나 같은 계산을 돌릴 수
                          있습니다.
                        </span>
                      ) : (
                        <span>
                          ⚠ 불일치 — 재현 {proof.reproduced}층 vs 온체인 {proof.onchain}층
                        </span>
                      )
                    ) : (
                      <button
                        className="gift-txlink"
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          cursor: "pointer",
                          font: "inherit",
                        }}
                        onClick={() => setProof(verifyLastRun())}
                      >
                        🔒 이 결과 검증하기 — 시드로 재현
                      </button>
                    )}
                  </div>
                ) : null}
                <div className="gift-actions">
                  <button className="gift-btn" onClick={close}>
                    마을로
                  </button>
                  <button
                    className="gift-btn primary"
                    disabled={busy}
                    onClick={() => {
                      setProof(null);
                      dungeonEnter();
                    }}
                  >
                    {busy ? "입장 중…" : "다시 입장"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="dungeon-result">
                  {dungeon.lastOutcome
                    ? OUTCOME_TEXT[dungeon.lastOutcome]
                    : "문을 골라 오르세요 — 욕심은 함정을 부른다"}
                </div>
                <Recap heard={dungeon.heard} door={dungeon.lastDoor} outcome={dungeon.lastOutcome} />
                {dungeon.omen && (
                  <div className="dungeon-omen">
                    👂 {DOOR_PROFILES[dungeon.omen.door].emoji} {DOOR_PROFILES[dungeon.omen.door].name}{" "}
                    {OMEN_WORDS[dungeon.omen.shows]}
                    <small>{OMEN_NOTE}</small>
                  </div>
                )}
                <div className="dungeon-doors">
                  {DOOR_PROFILES.map((door) => (
                    <button
                      key={door.id}
                      className={dungeon.omen?.door === door.id ? "dungeon-door omen" : "dungeon-door"}
                      disabled={dungeon.busy}
                      onClick={() => dungeonPick(door.id)}
                      title={`${door.name} · ${door.style}`}
                    >
                      <span>{door.emoji}</span>
                      <b>{door.name}</b>
                      <em>{DOOR_ODDS[door.id]}</em>
                    </button>
                  ))}
                </div>
                <div className="gift-actions">
                  <button className="gift-btn" onClick={close}>
                    마을로
                  </button>
                  <button
                    className="gift-btn primary"
                    disabled={dungeon.busy || dungeon.tentative === 0}
                    onClick={() => dungeonBank()}
                  >
                    귀환 — +{dungeon.tentative}층 확정
                  </button>
                </div>
              </>
            )}

            <div className="gift-note">
              시드:{" "}
              <a
                className="gift-txlink"
                href={`${explorer}/block/${dungeon.seedBlock}`}
                target="_blank"
                rel="noreferrer"
              >
                GIWA 블록 #{dungeon.seedBlock} ↗
              </a>{" "}
              · 함정을 밟으면 잠정 층수를 잃고, 귀환하면 길드 기록에 쌓입니다 ·{" "}
              <a
                className="gift-txlink"
                href={DUNGEON_URL}
                target="_blank"
                rel="noreferrer"
              >
                솔로 아케이드 ↗
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
