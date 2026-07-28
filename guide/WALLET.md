# 지갑과 테스트 ETH

[← 문서 색인](README.md)

라이브 데모는 방문자마다 **버너 지갑**을 하나 만들어 준다. 잔액이 없어도 마을은
그대로 돌아간다 — 읽기는 무료이고, 관전과 [구경 모드 시연](PLAY.md#처음-오신-분)은
쓰기를 하나도 하지 않는다. 실제로 사고팔려면 테스트 ETH가 조금 필요하다.

## 라이브 데모에서 충전하기

두 갈래다.

1. **포셋** — HUD의 `테스트 ETH 받기 ↗` 버튼. 주소는 클립보드에 복사된다.
2. **🦊 내 지갑에서 충전** — MetaMask 등 자기 지갑의 테스트넷 ETH를 버너로 보낸다
   (서명 팝업 1회 — 이후 모든 조작은 버너가 조용히 서명한다).

## 로컬 개발 — 테스트 지갑 (버너 월렛)

`npm run playtest` 최초 실행 시 슬롯 A~D 테스트 지갑 4개가 자동 생성된다
(`.testwallets.json`, git 제외 — **테스트 전용, 실제 자산 금지**).
[듀얼 테스트 창](PLAY.md#로컬-실행)의 각 클라이언트는 자기 슬롯 지갑으로 **자동
연결**되어 HUD에 주소·잔액·GIWA Sepolia 뱃지가 뜬다.

```bash
npm run wallets             # 주소 목록 + 포셋 링크 출력
npm run wallets -- --force  # 전부 재생성
```

## 포셋

수동 클레임만 된다 — 봇 차단·로그인이 있어 자동화가 불가능하고, 자동 클레임은
시도하지 않는다.

| 포셋 | 양 |
|---|---|
| [GIWA Faucet](https://faucet.giwa.io/) | 0.005 / 24h |
| [Nodit Faucet](https://faucet.lambda256.io/giwa-sepolia) | 0.01 / 24h (Nodit 계정 필요) |

L2 가스비는 극히 저렴해서 **클레임 1회면 개발 기간 내내 충분**하다.
대시보드에서 주소 복사 → 포셋에 붙여넣기.

## 브리지 (대량 필요 시)

Sepolia ETH를 GIWA Sepolia로 옮긴다.

```bash
npm run bridge -- A 0.01   # 슬롯 A 지갑의 Sepolia ETH 0.01을 GIWA로
```

Sepolia ETH는 [Google Cloud Faucet](https://cloud.google.com/application/web3/faucet/ethereum/sepolia)(0.05/day),
[PoW Faucet](https://sepolia-faucet.pk910.de/)(브라우저 채굴, 무제한)에서 확보한다.
L1StandardBridge(`0x77b2…A7E7`)로 전송하면 1~3분 뒤 L2 잔액에 반영된다.

## 잔액 리포트 / 일일 클레임 도우미

```bash
npm run faucet            # 슬롯별 L1/L2 잔액 표 + 조언
npm run faucet -- --open  # + Google 포셋 열기, 대상 주소 클립보드 복사
```

Windows 작업 스케줄러에 `GIWA Faucet Check` 태스크가 등록되어 있으면 매일 09:30에
잔액 표를 보여주고 포셋을 열어 준다 (주소는 클립보드에 있으니 Ctrl+V 후 클레임
클릭만 하면 된다 — 자동 클레임은 하지 않는다).

```
등록:   schtasks /Create /TN "GIWA Faucet Check" /TR "<클론경로>\scripts\faucet-daily.cmd" /SC DAILY /ST 09:30 /F
해제:   schtasks /Delete /TN "GIWA Faucet Check" /F
```

## 네트워크

| | |
|---|---|
| 체인 | GIWA Sepolia (OP Stack L2) |
| Chain ID | 91342 |
| RPC | https://sepolia-rpc.giwa.io |
| 익스플로러 | https://sepolia-explorer.giwa.io |

> 공개 RPC는 레이트리밋과 리플리카 지연이 있다. 전송 직후 상태 조회가 한 박자
> 늦으므로, 검증은 잔액 비교 대신 **영수증 status + 이벤트**로 한다.
