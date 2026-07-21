# 기와장터 MCP 서버

LLM이 **사람과 같은 자격으로** 기와장터에 참여하게 하는 [MCP](https://modelcontextprotocol.io) 서버.

마을에 들어오는 자격은 지갑과 서명 하나뿐이라, 컨트랙트에는 그 트랜잭션이
사람 손가락에서 나왔는지 모델 루프에서 나왔는지 **구분할 자리가 없다**.
에이전트 전용 특권 API도 없다 — AI가 노점을 열려면 사람과 똑같이 `openStall`
트랜잭션을 보내고 똑같이 가스를 낸다. 도깨비 타격 쿨다운 30초도 그대로 걸린다.

## 도구

**읽기 — 키 없이 동작한다 (공개 RPC만 사용)**

| 도구 | 하는 일 |
|---|---|
| `look_around` | 마을 전경 한 번에 — 노점·접속자·도깨비 체력·장날 여부 |
| `list_stalls` | 열린 노점 전체 (품목·가격·좌표, `buy_item`에 쓸 index 포함) |
| `get_profile` | 지갑의 소셜 프로필 (길드·칭호·장신구·온기·전리품) |
| `guild_leaderboard` | 이번 주 던전 등반 순위 |
| `list_offers` | 판매자에게 걸린 활성 흥정 |
| `who_is_here` | 지금 움직이는 아바타 (프레즌스 비컨) |
| `my_status` | 내 주소·잔액·노점·들어온 흥정·남은 지출 예산 (키 필요) |

**쓰기 — `GIWA_PRIVATE_KEY`가 있을 때만 열린다**

| 도구 | 하는 일 |
|---|---|
| `open_stall` | 좌표를 정해 노점 개설 (개설+가격 등록이 한 tx) |
| `close_stall` | 노점 접기 |
| `buy_item` | 정가 구매 → 에스크로 + ERC-1155 쿠폰 |
| `make_offer` | 흥정 걸기 (제안액 에스크로) |
| `accept_offer` | 내 노점에 들어온 흥정 수락 → 즉시 체결 |
| `cancel_offer` | 내가 건 흥정 회수 |
| `strike_boss` | 주간 도깨비 타격 (쿨다운 30초 동일 적용) |

## 설치

```bash
cd mcp && npm install
npm run smoke      # 실제 GIWA Sepolia를 읽어 도구 14종을 검증 (키 불필요)
```

## Claude Code / Claude Desktop 등록

MCP 설정에 다음을 추가한다 (경로는 이 저장소의 절대 경로로).

```json
{
  "mcpServers": {
    "giwa-village": {
      "command": "node",
      "args": ["<클론경로>/mcp/src/index.mjs"]
    }
  }
}
```

읽기만 쓸 거면 이걸로 끝이다. 실제로 **장사까지 시키려면** 테스트넷 지갑 키를 준다:

```json
{
  "mcpServers": {
    "giwa-village": {
      "command": "node",
      "args": ["<클론경로>/mcp/src/index.mjs"],
      "env": {
        "GIWA_PRIVATE_KEY": "0x…",
        "GIWA_MAX_SPEND_ETH": "0.005",
        "GIWA_SESSION_BUDGET_ETH": "0.05"
      }
    }
  }
}
```

Claude Code라면 등록 한 줄로도 된다:

```bash
claude mcp add giwa-village -- node <클론경로>/mcp/src/index.mjs
```

## 안전 장치

키를 모델에게 쥐여 주는 구조라, 모델이 실수하거나 이상한 지시를 받아도 피해가
한정되도록 막아 둔다.

- **테스트넷 전용** — 매 트랜잭션 전에 체인 ID가 91342(GIWA Sepolia)인지 확인하고,
  아니면 거부한다. 실자산 지갑 키는 절대 넣지 말 것.
- **1회 지출 상한** (`GIWA_MAX_SPEND_ETH`, 기본 0.005) — 모델이 자릿수를 틀려도
  한 번에 나갈 수 있는 금액이 묶인다. 노점 개설 시 품목 가격에도 같은 상한을 건다.
- **세션 예산** (`GIWA_SESSION_BUDGET_ETH`, 기본 0.05) — 프로세스가 사는 동안의
  누적 지출 한도. 넘으면 쓰기가 멈춘다.
- **소유권 검증** — `accept_offer`는 내가 판매자인 흥정만 수락한다.
- **마을 경계** — `open_stall`은 반경 55 밖 좌표를 거부한다.
- **nonce 직렬화** — 같은 지갑의 트랜잭션을 큐로 한 줄 세운다.
- **재화만** — 파는 대상은 쿠폰·코스메틱 같은 재화로 한정한다. 금융상품·오더북은
  마을 규칙 밖이다 (도구 설명에도 명시돼 있어 모델이 읽는다).

키는 stderr 로그에도 찍히지 않는다. stdout은 MCP 프로토콜 전용이다.

## 관련

- [`../sdk/`](../sdk/README.md) — 읽기 전용 TypeScript SDK (이 서버와 같은 컨트랙트)
- [`../scripts/merchant-bot.mjs`](../scripts/merchant-bot.mjs) — 반대 방향: 자기 지갑을 든
  LLM 상인 NPC가 사람이 건 흥정을 판단한다
- [`../contracts/README.md`](../contracts/README.md) — 컨트랙트 10종 카탈로그
