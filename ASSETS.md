# 반입한 에셋 — 출처와 라이선스

이 파일은 **자동 생성물**이다. 고칠 곳은 `data/assets.json`이고, `npm run assets`가
받아 오면서 다시 쓴다. `npm test`가 원장에 없는 바이너리를 잡는다.

**바이너리는 원본 그대로 둔다.** 손질(게인·피치·필터·타일링·색조)은 전부 코드에서
한다 — 그래야 "이게 정말 그 출처에서 온 것인가"에 체크섬으로 답할 수 있다.

허용 라이선스: **CC0-1.0** · **CC-BY-4.0** · **OFL-1.1** — 그 밖의 것은 반입하지 않는다.
저작자 표기가 필요한 라이선스(CC-BY)는 아래 표와 화면 크레딧 양쪽에 이름이 있어야 한다.

용량 4,672KB / 예산 20,480KB

| 자리 | 무엇 | 저작자 | 라이선스 | 우리가 한 손질 |
|---|---|---|---|---|
| `client/public/audio/sfx` | 발소리(흙)·타격 바디·격파 종소리 | [Kenney](https://kenney.nl/assets/impact-sounds) | CC0-1.0 | 130개 중 10개만 추림. 게인·피치 랜덤·레이어는 코드에서. |
| `client/public/audio/sfx` | 동전·책장·문·쇠걸쇠·칼날 — 거래와 UI에 붙는 소리 | [Kenney](https://kenney.nl/assets/rpg-audio) | CC0-1.0 | 55개 중 6개만 추림. |
| `client/public/audio/amb` | 모닥불 장작 타는 소리 (자리 소리 — 가까이 갈수록 커진다) | [AntumDeluge](https://opengameart.org/content/fire-crackling) | CC0-1.0 | 그대로. 반복 재생·거리 감쇠는 코드에서. |
| `client/public/tex` | 기와·나무·회벽·흙바닥 컬러맵 (1K JPG) | [Poly Haven](https://polyhaven.com/textures) | CC0-1.0 | 1K 컬러맵만. 타일링·색조·거칠기는 코드에서. |
| `client/public/fonts/song-myung` | 제목·간판용 명조 (기와장터 로고, 노점 간판) | [Sandoll Communications](https://fonts.google.com/specimen/Song+Myung) | OFL-1.1 | 구글이 쪼개 주는 유니코드 서브셋 그대로 셀프 호스팅(브라우저가 필요한 조각만 받는다). |
| `client/public/fonts/do-hyeon` | HUD·버튼용 고딕 (숫자와 짧은 라벨이 또렷해야 한다) | [Woowa Brothers](https://fonts.google.com/specimen/Do+Hyeon) | OFL-1.1 | 위와 같음. |

## 만들지 않고 받은 이유

절차 생성이 이기는 곳(끝나지 않는 배경음·절차 지오메트리)은 그대로 두고, 합성이
약한 곳만 받았다 — 발소리·동전·문소리 같은 **한 번 나고 마는 실물 소리**, 그리고
사진이 아니면 안 되는 **표면 질감**. 배경음은 여전히 파일이 0개다.

## 다시 받기

```bash
npm run assets
```

없는 파일만 받고, 있는 파일은 지문을 대조한다. 지문이 어긋나면 실패한다 —
받은 것이 출처와 다르다는 뜻이므로.
