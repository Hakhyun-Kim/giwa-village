# 기와장터 (GIWA Village)

GIWA 체인 위의 **한옥 저잣거리** — 지갑으로 접속해 아바타로 마을을 돌아다니고,
노점을 열어 장사하고, 다른 주민에게 실제 ETH를 선물하고, 던전 포털로 미니게임에
입장하는 "지갑을 공간으로" 만드는 실험. 라그나로크 프론테라 노점 문화의 온체인 재해석.

🌐 **라이브 데모**: https://hakhyun-kim.github.io/giwa-village/
📄 **기술 문서(원페이저)**: https://hakhyun-kim.github.io/giwa-village/tech.html

핵심 기능 세 가지:
1. **노점(장사)** — 아무 곳에나 노점을 펴고 상품·가격을 올리면, 접속을 끊어도
   노점은 마을에 남는다(영속). 손님은 노점을 클릭해 **GIWA Sepolia 실결제**로 구매.
2. **선물** — 아바타 클릭 → 금액 선택 → 실제 온체인 전송 → 🎁 + 공유 피드.
3. **식당가 거리** — 가상 브랜드 상점(화덕피자공방·달빛편의점·번개버거)에서 쿠폰 구매
   → 🎫 쿠폰함 저장. 실브랜드 기프티콘 API 연동은 로드맵 참고.

**온체인 구성** (GIWA Sepolia):
- **GiwaMarketV2 컨트랙트** [`0x67cddd…ad67`](https://sepolia-explorer.giwa.io/address/0x67cddd9be658dd334730e34c3791959a6681ad67)
  — 온체인 리스팅(가격 체인 강제) + **에스크로**(구매자 확정 또는 24시간 후 정산) +
  **ERC-1155 쿠폰 토큰**(구매 즉시 지갑에 민팅). 리스팅 없는 노점(봇 등)은 영수증
  전용 폴백. `npm run deploy-market`로 재배포. (v1: `0x61491f…1357`)
- **Dojang Verified Address 실연동** — DojangScroll `isVerified(주소, 업비트 발행자 ID)`
  온체인 조회로 상인 인증 표시: 🟡 *Dojang 인증 상인*(업비트 신원 인증) vs ✓ *지갑 상인*.
  "시각적으로 인증받고 거래"의 GIWA 네이티브 구현 (버너 지갑은 미인증이 정상).
- **UP.ID(Upbit Web3 Names) 이름표** — UPNameRegistry에서 주소→이름 역방향 조회.
  이름이 있으면 아바타 이름표·HUD·노점 다이얼로그에 주소 대신 표시된다.
  (이름 등록에는 Dojang 인증 필요 — 인증 상인 서사와 동일 축)

## 구조

```
client/   Vite + React + react-three-fiber 3D 클라이언트
server/   Colyseus 실시간 룸 서버 (아바타 위치/이모트 동기화, /dev/* 개발 API)
scripts/  launch-test.mjs(원클릭 실행) · gen-wallets.mjs(테스트 지갑) · bridge-deposit.mjs · faucet-check.mjs
          sync-smoke.mjs(동기화 테스트) · gift-smoke.mjs(선물 온체인 E2E)
```

## 실행

**테스트 (원클릭)** — `test.cmd` 더블클릭, 또는:

```bash
npm run playtest     # 서버+클라이언트+봇 주민 자동 기동 → 듀얼 테스트 페이지 열림
npm run playtest -- --no-bots   # 봇 없이
```

http://localhost:5173/test.html 이 열리며 한 화면에 클라이언트 2개가 나란히 뜬다
(+ 버튼으로 최대 4개). 패널을 클릭하면 그 클라이언트가 조작된다.

### 테스트 지갑 (버너 월렛)

`npm run playtest` 최초 실행 시 슬롯 A~D 테스트 지갑 4개가 자동 생성된다
(`.testwallets.json`, git 제외 — **테스트 전용, 실제 자산 금지**).
테스트 페이지의 각 클라이언트는 자기 슬롯 지갑으로 **자동 연결**되어
HUD에 주소·잔액·GIWA Sepolia 뱃지가 뜬다. 수동 관리:

```bash
npm run wallets           # 주소 목록 + 포셋 링크 출력
npm run wallets -- --force  # 전부 재생성
```

### 테스트 ETH 확보

**포셋 (수동 클레임— 봇 차단/로그인이 있어 자동화 불가):**
[GIWA Faucet](https://faucet.giwa.io/) (0.005/24h) ·
[Nodit Faucet](https://faucet.lambda256.io/giwa-sepolia) (0.01/24h, Nodit 계정 필요)

L2 가스비는 극히 저렴해서 **클레임 1회면 개발 기간 내내 충분**하다.
대시보드에서 주소 복사 → 포셋에 붙여넣기.

**브리지 (대량 필요 시):** Sepolia ETH를 GIWA Sepolia로 옮긴다.

```bash
npm run bridge -- A 0.01   # 슬롯 A 지갑의 Sepolia ETH 0.01을 GIWA로
```

Sepolia ETH는 [Google Cloud Faucet](https://cloud.google.com/application/web3/faucet/ethereum/sepolia)(0.05/day),
[PoW Faucet](https://sepolia-faucet.pk910.de/)(브라우저 채굴, 무제한)에서 확보.
L1StandardBridge(`0x77b2…A7E7`)로 전송하면 1~3분 뒤 L2 잔액에 반영된다.

**잔액 리포트 / 일일 클레임 도우미:**

```bash
npm run faucet            # 슬롯별 L1/L2 잔액 표 + 조언
npm run faucet -- --open  # + Google 포셋 열기, 대상 주소 클립보드 복사
```

Windows 작업 스케줄러에 `GIWA Faucet Check` 태스크가 등록되어 있으면
매일 09:30에 잔액 표를 보여주고 Google 포셋을 열어준다 (주소는 클립보드에 있음 —
Ctrl+V 후 클레임 클릭만 하면 됨. 자동 클레임은 하지 않는다).

```
등록:   schtasks /Create /TN "GIWA Faucet Check" /TR "C:\work\github\Giwa\scripts\faucet-daily.cmd" /SC DAILY /ST 09:30 /F
해제:   schtasks /Delete /TN "GIWA Faucet Check" /F
```

### 테스트 대시보드

test.html 상단에 서버 상태 · 현재 접속자 명단 · 슬롯별 지갑 주소/잔액(복사·익스플로러 링크) ·
포셋 바로가기가 표시된다. 데이터 출처는 개발 서버의 로컬 전용 엔드포인트:

- `GET :2567/dev/wallets` — 슬롯 지갑 목록 (localhost에서만 응답)
- `GET :2567/dev/status` — 현재 방 접속자 명단

### 개발 편의 동작

- 서버가 재시작되면 클라이언트가 2초 간격으로 **자동 재접속**한다.
- 클라이언트는 5초마다 하트비트를 보내고, 서버는 120초 무응답 연결을 정리한다.

**일반 실행**:

```bash
npm install
npm run dev          # 서버(:2567) + 클라이언트(:5173) 동시 실행
```

- **WASD / 방향키** — 이동
- **E** — 인사(👋 이모트)
- **다른 아바타 클릭** — 선물 다이얼로그 → 금액 선택 → GIWA Sepolia에서 실제 전송
- **F** — 포털 근처에서 백층 던전 입장
- **지갑 연결** — MetaMask 등 인젝티드 지갑으로 GIWA Sepolia(체인 91342) 연결.
  연결하면 아바타 이름이 지갑 주소가 되고 인증 뱃지(✓)가 붙는다.

### 봇 주민 (북적이는 마을)

```bash
npm run bots              # 봇 주민 10명 입장 (Ctrl+C로 전원 퇴장)
npm run bots -- --count 15
```

WebGL 창 없이 서버에만 접속하는 헤드리스 주민들 — 조선 저잣거리풍 이름(보부상 두칠,
주모 향단…)으로 돌아다니고 인사하며, 앞의 4명은 노점을 편다. 지갑 주소는
`.botwallets.json`에 영속(봇 노점 결제 수신용).

## 검증

```bash
npm run smoke         # 동기화: 접속/이동/이모트/좌표클램프/퇴장
npm run gift          # 선물 온체인 E2E: A→B 실제 전송 + gift 브로드캐스트
npm run stall-smoke   # 노점 E2E: 개설→실결제 구매→판매 전파→영속성→폐점 + 거부 케이스
npm run market-smoke  # 컨트랙트 E2E: 리스팅→가격 강제→영수증 이벤트→미등록 폴백
node scripts/dojang-smoke.mjs  # Dojang isVerified 조회 경로 확인
```

`gift`/`stall-smoke`/`market-smoke`는 슬롯 A/B 지갑에 GIWA Sepolia ETH가 있어야 실행된다.

## 네트워크

| | |
|---|---|
| 체인 | GIWA Sepolia (OP Stack L2) |
| Chain ID | 91342 |
| RPC | https://sepolia-rpc.giwa.io |
| 익스플로러 | https://sepolia-explorer.giwa.io |

## 로드맵

- [x] 마을 씬 + 아바타 실시간 동기화 (Colyseus, 15Hz 스냅샷)
- [x] 지갑 연결 → 아바타 아이덴티티 (GIWA Sepolia)
- [x] 던전 포털 (dungeon100 연결)
- [x] 아바타 간 선물 (지갑 전송의 공간화) — 실제 온체인 ETH 전송 + 공유 피드
- [x] 한옥 저잣거리 리스타일 + 아바타 외형 다양화 (갓/패랭이/두건)
- [x] 노점 시스템 — 개설/영속/실결제 구매/판매 피드/쿠폰함
- [x] 가상 브랜드 식당가 3곳 + 광고 배너 자리
- [x] 봇 주민 (헤드리스, 노점상 포함)
- [x] GiwaMarket 컨트랙트 — 온체인 리스팅·가격 강제·구매 영수증 이벤트
- [x] Dojang Verified Address 인증 뱃지 (DojangScroll 온체인 조회)
- [x] GiwaMarket v2 — 에스크로(확정/24h 자동 정산) + ERC-1155 쿠폰 토큰
- [x] UP.ID 이름표 (UPNameRegistry 역방향 조회)
- [ ] 실브랜드 기프티콘 API 연동
- [ ] 에스크로 분쟁 처리 (v3)
- [ ] 길드 + 비동기 코업 던전 (온체인 시드, 길드 리더보드)
- [ ] 소울바운드 성장 / 코스메틱 ERC-1155

## 설계 원칙 (규제 안전선)

게임 플레이의 결과로 양도 가능한 자산을 지급하지 않는다.
성장치는 소울바운드, 거래는 소셜 레이어의 지갑 기능(전송/선물/스왑)으로만.
