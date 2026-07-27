// 반입한 글자꼴을 붙인다.
//
// 번들러를 거치지 않고 런타임에 <link>로 넣는 이유: 폰트 CSS는 public에 있고
// 그 안의 woff2 경로가 CSS 파일 기준 상대 경로다. 번들러가 손대면 그 관계가
// 깨지지만, 브라우저가 직접 읽으면 배포 베이스(/giwa-village/)가 어떻든 맞는다.
//
// 못 받아도 아무 일도 일어나지 않는다 — CSS의 폰트 스택이 시스템 글꼴로 내려간다.
// (에셋이 없어도 마을은 선다는 규칙은 소리·질감과 같다)

const BASE = import.meta.env.BASE_URL || "/";

/** 구글이 쪼개 준 서브셋을 그대로 셀프 호스팅한다 — 브라우저가 필요한 조각만 받는다 */
const FAMILIES = ["song-myung", "do-hyeon"];

export function installFonts(): void {
  for (const family of FAMILIES) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `${BASE}fonts/${family}/font.css`;
    document.head.appendChild(link);
  }
}
