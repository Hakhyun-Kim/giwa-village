# 서버 호스팅 — 퍼블릭 테스트넷 오픈

클라이언트는 이미 GitHub Pages(기본 샘플, `VITE_DEMO=1`)로 배포된다.
**멀티플레이 정식 오픈**은 Colyseus 서버를 호스팅하고, 클라이언트를
그 서버 주소로 빌드해 배포하면 된다.

## 1) 서버 배포 (Fly.io 권장 — 도쿄 리전, WebSocket 상시 연결)

```bash
# 최초 1회
flyctl launch --no-deploy        # 기존 fly.toml 사용 여부를 물으면 Yes

# 배포 (이후 갱신도 동일)
flyctl deploy
```

- 컨테이너는 `NODE_ENV=production` · `HOST=0.0.0.0` 으로 뜬다(Dockerfile). production 에서는
  `/dev/*`(테스트 지갑)가 **닫힌다**. 서버가 여는 룸은 `village_live` · `expedition` 둘뿐이고
  둘 다 영구 기록을 갖지 않는다 — 볼륨도 비밀값도 필요 없다.
- 상태 확인: `https://<앱이름>.fly.dev/` → `{"ok":true,...}`. `village_live` 정원은 방 하나에 30명이다.

다른 Docker 호스트(Railway·Render 유료 플랜·자가 VPS)도 동일하다:
`Dockerfile` 하나로 빌드되고, `PORT`(기본 2567)만 챙기면 된다. WebSocket을 지원하는 플랜이어야 한다
(무료 슬립형 인스턴스는 마을이 사라지므로 부적합).

## 2) 클라이언트를 호스팅 서버로 빌드

```powershell
# PowerShell (Git Bash에서 VITE_* 경로 변수 지정 금지 — MSYS 변환 이슈)
$env:VITE_WS_URL = "wss://<앱이름>.fly.dev"
$env:VITE_BASE = "/giwa-village/"
npm run build -w client
```

- `VITE_DEMO`를 **설정하지 않으면** 실서버 접속 모드로 빌드된다.
- GitHub Actions 배포를 실서버 모드로 전환하려면 워크플로의 `VITE_DEMO=1`을 제거하고
  `VITE_WS_URL`을 추가하면 된다 (기본 샘플을 유지할지, 정식 오픈으로 바꿀지는 선택).

## 3) 호스팅 환경에서의 지갑

- 테스트 지갑 슬롯(A~D)은 **로컬 개발 전용**이다 (`/dev/wallets`가 localhost에서만 응답).
- 퍼블릭 방문자는 **지갑 연결(MetaMask 등)** 버튼으로 GIWA Sepolia에 연결하거나,
  게스트(지갑 없음)로 입장해 구경할 수 있다.
