# 시연 서버 — 0원으로, 모이는 때만

마을은 서버 없이 돈다(체인이 정본이다). 룸 서버(`village_live` · `expedition`)는 걸음을 부드럽게 하고
동료와 함께하는 원정을 여는 **선택 사항**이다. 그래서 상시 호스팅하지 않고, 사람이 모이는 창에만 **0원으로** 띄운다.

**공개 빌드는 하나다.** Pages 배포가 저장소 변수 `DEMO_WS_URL` 을 룸 서버 주소로 굽는다.

- 비어 있으면 서버 없이 돈다.
- 있으면 페이지가 먼저 `GET /` 로 서버가 떠 있는지 묻는다. 떠 있으면 붙고, 꺼져 있거나 자고 있으면 조용히 서버 없이 돈다
  (4초부터 두 배씩, 최대 60초 간격으로 다시 묻는다). **서버를 켜고 끄는 데 재배포가 필요 없다.**
- 탭이 2분 숨어 있으면 마을 룸에서 내린다 — 잊고 열어 둔 탭이 무료 대역폭을 갉지 않게. 다시 보이면 잇는다.
- 주소는 빌드가 정한다. 페이지 주소(`?server=` 같은 것)로 바꾸는 길은 두지 않는다 — 버너가 서명하는 곳은 빌드가 정한 서버뿐이다
  ([PROTOCOL.md](../PROTOCOL.md) §3.8 의 경계와 같다).

## 1) 기본 — Render 무료 · 싱가포르 · 결제 수단 없음

설정은 저장소 루트의 [`render.yaml`](../render.yaml) 하나다(Dockerfile 그대로 · free · singapore · 상태 확인 `/` · `NODE_ENV=production`).
아래 수치는 2026-10 기준이다 — 바뀔 수 있으니 Render 의 Free 문서로 확인한다.

**처음 한 번** (사람이 누른다):

1. <https://render.com> 에 **GitHub 로 로그인**한다. **카드를 등록하지 않는다** — 그것이 0원의 조건이다(아래 "넘치면").
2. Dashboard → **New → Blueprint** → 이 저장소를 고른다. `render.yaml` 을 읽어 서비스 `giwa-village` 를 보여 준다.
   리전 **Singapore** · 인스턴스 **Free** 인지 보고 **Apply**. (리전은 만든 뒤 바꿀 수 없다.)
3. 배포가 끝나면 서비스 주소 `https://<서비스>.onrender.com/` 을 연다 → `{"ok":true,"service":"giwa-village-server"}` 이면 됐다.
4. GitHub 저장소 → Settings → Secrets and variables → Actions → **Variables** →
   `DEMO_WS_URL` = `wss://<서비스>.onrender.com` (끝에 `/` 없이 · `gh variable set DEMO_WS_URL --body wss://<서비스>.onrender.com`).
5. Actions → **Deploy demo to GitHub Pages** → **Run workflow** (약 3분). 이제 공개 데모는 서버가 깨어 있으면 붙는다.

**시연할 때:**

- 무료 서비스는 **15분 조용하면 잠들고**, 첫 요청에 **약 1분** 걸려 깬다. 시연 1~2분 전에 휴대폰으로
  `https://<서비스>.onrender.com/` 을 한 번 열어 깨워 둔다. 깨는 동안 페이지는 서버 없이 돌다가 다음 차례에 붙는다.
- 웹소켓 메시지가 오가는 동안은 잠들지 않는다. 대신 Render 는 무료 서비스를 아무 때나 재시작할 수 있다 —
  마을은 다시 붙고, 원정은 20초 안에 이어 붙거나 들판으로 돌아온다(PROTOCOL.md §3.7).
- 서버를 이루는 파일(`server/` · `shared/` · Dockerfile · 패키지 파일)이 바뀐 main 푸시에만 서버를 다시 짓는다(`render.yaml` 의 `buildFilter`).

**넘치면 — 월 송신 5GB.** 카드가 없는 무료 작업 공간은 송신 5GB 를 넘는 순간 **그달 남은 기간 정지**된다. 청구는 없다.
정지돼도 공개 데모는 서버 없이 돈다.

- 송신은 마을 인원의 제곱으로 는다(실측 · `village_live` 만: 2명 0.03 GiB/h · 5명 0.18 · 10명 0.74 · 20명 2.9).
  다섯 명 남짓이면 넉넉하고, 스무 명이 몰리면 1시간 반이면 다 쓴다.
- 시연 뒤에 Dashboard → 서비스 → **Metrics** 의 대역폭으로 이번 달 사용량을 본다. 많이 모일 창이면 아래 대체 경로를 쓴다.

## 2) 대체 — 이 PC + Cloudflare 빠른 터널 (계정 없음)

Render 가 정지됐거나 사람이 많이 모이는 창에 쓴다. 이 PC 의 업로드로 내보낸다 — 집의 데스크톱이 맞다
(휴대폰 핫스팟에 물린 노트북이면 시간당 1GB 가까운 데이터를 쓴다).

```powershell
winget install Cloudflare.cloudflared   # 처음 한 번
npm run demo-server                     # 룸 서버(production · 127.0.0.1) + 터널 — 다음 할 일을 출력한다
```

- 출력된 `wss://<단어들>.trycloudflare.com` 을 `DEMO_WS_URL` 에 넣고 Pages 워크플로를 다시 돌린다(약 3분). 주소는 실행할 때마다 바뀐다.
- 끝나면 Ctrl-C — 서버와 터널이 함께 내려간다. `DEMO_WS_URL` 을 Render 주소로 되돌리고 워크플로를 다시 돌린다
  (그대로 두어도 꺼진 주소는 조용히 서버 없이 돈다).
- 빠른 터널은 시험용이다 — 동시 요청 200 · 보증 없음.

**개발 모드 서버를 터널 · 프록시 뒤에 두지 않는다.** 개발 모드는 `/dev/wallets`(이 기기의 테스트 지갑 키)를 연다.
터널은 루프백으로 들어오므로 "이 기기에서만" 검사를 지나친다. 서버는 전달 헤더(`X-Forwarded-For` · `X-Forwarded-Host` ·
`CF-Connecting-IP` · `True-Client-IP` · `Forwarded` · `X-Real-IP` · `Via`)가 붙은 요청, localhost 가 아닌 `Host`(DNS 리바인딩)와 `Origin`(다른 웹페이지)을 403 으로 막지만
(`npm run smoke:realtime` 이 본다), 그것은 두 번째 문이다 — 헤더를 붙이지 않는 TCP 전달(`ssh -R` · `ngrok tcp`)은 알아채지 못한다.
막아 주는 것은 **production 모드**뿐이다. `npm run demo-server` 는 언제나 `NODE_ENV=production` · `HOST=127.0.0.1` 로 띄우고,
같은 포트에 서버가 이미 떠 있으면 거절한다.

## 3) 손으로 확인하기

공개 빌드가 서버와 붙는지 이 기기에서 보려면(PowerShell — Git Bash 에서 `VITE_*` 경로 변수 지정 금지):

```powershell
npm run dev:server                                             # 다른 창에서
$env:VITE_DEMO = "1"; $env:VITE_WS_URL = "ws://localhost:2567"
npm run build -w client; npm run preview -w client
```

마을 아래 가운데(북문 단추 옆) 표시가 "실시간 서버 연결됨"이면 붙은 것이고, 서버 창을 닫으면 "서버 없이 마을 진행 중"으로 내려간다.
배포 게이트(`smoke:boot`)는 일부러 닫힌 포트(`ws://127.0.0.1:2599`)로 빌드해 꺼진 서버 갈래를 본다.

## 4) 지갑

- 테스트 지갑 슬롯(A~D)은 **로컬 개발 전용**이다 — `/dev/wallets` 는 개발 모드 서버만 열고, 루프백으로 들어와 전달 헤더가 없고
  `Host` · `Origin` 이 localhost 인 요청에만 답한다(TCP 터널은 가려내지 못한다 — 개발 모드 서버를 밖에 내놓지 않는다),
  웹은 그 키를 언제나 `http://localhost:2567` 에서만 받는다(빌드가 가리키는 룸 서버가 키를 주입하지 못하게). 공개 빌드(`VITE_DEMO=1`)는 `?slot` 을 끈다.
- 퍼블릭 방문자는 **지갑 연결(MetaMask 등)** 로 GIWA Sepolia 에 연결하거나, 이 기기에서 만든 버너로 입장해 구경할 수 있다.
