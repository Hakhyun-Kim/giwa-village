# 계측 — 모든 클라이언트가 같은 이름으로 센다

웹 · Unity · (동결된) Unreal 이 같은 마을에 들어오므로, "첫 1분에 몇 명이 움직였나"를
같은 자로 재려면 **이벤트 이름과 속성이 한 벌**이어야 한다. 이 문서가 그 한 벌이다.
클라이언트는 이 표를 옮겨 적지 말고 이 이름 그대로 보낸다. 표에 없는 이벤트를 새로 보내려면
먼저 여기에 적는다.

**기본값은 꺼짐이다.** 수집처 키 없이 빌드하면 아무것도 보내지 않는다 — 공개 데모와
모든 게이트(`smoke:boot` 등)는 꺼진 채로 돈다.

---

## 1. 프라이버시 규칙 (타협하지 않는다)

| 규칙 | 이유 |
|---|---|
| 식별자는 **설치마다 무작위**(`install_id`, UUID). 브라우저면 localStorage `giwa-install-id` | 지갑 주소의 해시는 쓰지 않는다 — 주소는 공개라 사전 대입으로 되돌릴 수 있다 |
| **주소 · tx 해시 · 서명 · 키를 싣지 않는다** | tx 해시 하나로 install_id 와 버너 주소가 이어진다. 웹 모듈은 혹시 섞여 든 `0x…` 긴 16진을 보내기 전에 지운다 |
| 오류 원문을 보내지 않는다 — **사유 갈래**만(`rejected` · `insufficient` · `reverted` · `nonce` · `network` · `other`) | 체인 오류 문자열에는 주소가 들어 있다 |
| 사람이 쓴 글(노점 이름 · 품목 이름 · 채팅)을 싣지 않는다 | 사용자 생성물은 개인정보일 수 있다 |
| 자동화 · 게이트에서는 끈다 | 웹: `navigator.webdriver`(Playwright) · `?noanalytics`. Unity: smoke · shots |
| 수집처는 처리방침에 적는다 | 국외 이전 · 처리 위탁 — [PRIVACY.md](PRIVACY.md) |

## 2. 공통 속성 (모든 이벤트)

| 속성 | 값 |
|---|---|
| `install_id` | 설치마다 무작위 UUID. `distinct_id` 에도 같은 값 |
| `session_id` | 앱을 열 때마다 새 UUID |
| `platform` | `web` · `unity-windows` · `unity-android` · `unity-ios` · `unreal` |
| `build` | 빌드 식별자(웹: `VITE_BUILD`, 없으면 `production`/`development`) |
| `invite_token` | 처음 들어올 때 `?invite=<토큰>`(영숫자 · `_` · `-`, 32자 이하). 저장해 두고 이후 모든 이벤트에 싣는다. 없으면 `null` |
| `$process_person_profile` | `false` — 사람 프로필을 만들지 않는 익명 이벤트 |

## 3. 이벤트

| 이벤트 | 속성 | 언제 | 웹 |
|---|---|---|---|
| `app_open` | `demo` | 앱이 열림 | ✅ |
| `first_frame` | `ms`(부팅부터) | 첫 3D 프레임 | ✅ |
| `session_start` | — | 세션 시작 | ✅ |
| `session_end` | `seconds` | 페이지를 떠남 · 앱 종료 | ✅ |
| `alive` | `minutes` | 보이는 동안 60초마다 | ✅ |
| `app_background` · `app_foreground` | `reason` | 모바일 앱 전환 | — |
| `input_first` | `kind`(`key` · `pointer` · `touch`) · `ms` | 첫 입력 | ✅ |
| `tutorial_step_start` | `step` · `quest` · `path` | 촌장의 부탁 한 단계가 보임 | ✅ |
| `tutorial_step_done` | `step` · `quest` · `path` | 그 단계를 마침 | ✅ |
| `tutorial_skip` | `step` | '숙련자'로 건너뜀 | ✅ |
| `paths_shown` | — | 세 갈래 길이 보임 | ✅ |
| `paths_chosen` | `path`(`merchant` · `expedition` · `artisan`) | 길을 고름 | ✅ |
| `stall_open` | `items` | 노점을 폄 | ✅ |
| `buy_click` | `brand` · `onchain_stall` · `price_eth` | 구매 버튼 | ✅ |
| `zone_enter` | `zone`(`village` · `field` · `dungeon`) | 구역이 바뀜 | ✅ |
| `raid_start` · `raid_end` | `party` · `result` | 원정 시작 · 끝 | — |
| `emote` | `icon` · `via`(`server` · `chain`) | 이모트 | ✅ |
| `sit` | — | 모닥불에 앉음(온기) | ✅ |
| `peers_seen` | `people` · `npc` | 처음 남을 봄 | — |
| `wallet_panel_open` | — | 지갑 창을 엶 | — |
| `faucet_open` | — | 포셋 링크를 누름 | ✅ |
| `wc_pair_start` · `wc_connected` | — | WalletConnect 짝짓기 | — (Unity) |
| `fund_sent` · `fund_confirmed` · `fund_failed` | `reason` | 충전 | — (Unity) |
| `balance_first_positive` | — | 잔액이 처음 0보다 커짐 | — |
| `tx_attempt` | — | 사람이 누른 전송(비컨 같은 silent 전송은 세지 않는다) | ✅ |
| `tx_result` | `ok` · `reason` · `ms` | 그 전송의 결과 | ✅ |
| `perf_bucket` | `fps` · `bucket`(`high` ≥50 · `ok` ≥28 · `low`) | 부팅 20초 뒤 5초 측정 | ✅ |
| `crash` | `kind` · `message`(주소 지움, 120자) | 미처리 예외 | ✅ |
| `anr` | — | 앱 응답 없음(모바일) | — |

"—" 는 아직 달지 않은 것이다. 코드에 분명한 자리가 생기면 이 이름으로 단다.

## 4. 전송 — PostHog 호환 batch

```
POST ${HOST}/batch/
Content-Type: text/plain        (웹: CORS 사전 요청 없이 보내려고. 본문은 JSON)

{ "api_key": "<프로젝트 키>",
  "batch": [ { "event": "app_open",
               "properties": { "distinct_id": "<install_id>", "install_id": "…", "platform": "web", … },
               "timestamp": "2026-09-26T12:00:00.000Z" } ] }
```

- 10초마다 또는 20개가 차면 보낸다. 떠날 때는 `keepalive` 로 한 번 더.
- 실패하면 버린다 — 계측 때문에 마을이 느려지거나 멈추면 안 된다.

## 5. 켜는 법 (웹)

```powershell
$env:VITE_ANALYTICS_KEY = "phc_…"                        # 없으면 꺼짐
$env:VITE_ANALYTICS_HOST = "https://us.i.posthog.com"   # 생략하면 이 값
$env:VITE_BUILD = "$(git rev-parse --short HEAD)"
npm run build -w client
```

구현은 `client/src/net/analytics.ts` 한 파일이다(외부 의존성 없음). `npm run smoke:boot` 은
"계측이 꺼져 있다(분석 전송 0건)"를 검사한다.
