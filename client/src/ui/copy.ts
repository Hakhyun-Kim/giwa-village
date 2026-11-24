// 글자 복사 — 되었는지 아닌지를 돌려준다.
// navigator.clipboard 는 https 가 아니거나(사설망 주소로 연 개발 서버) 권한이 막히면 없거나 거절한다.
// 그때 "복사됨!"을 띄우면 사람은 빈 클립보드를 붙여 넣게 된다 — 옛 execCommand 로 한 번 더 해 보고, 그것도 안 되면 false.
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 아래 옛 길로 */
  }
  try {
    const ta = Object.assign(document.createElement("textarea"), { value: text });
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;opacity:0;pointer-events:none";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
