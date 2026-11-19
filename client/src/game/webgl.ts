// 이 브라우저가 3D(WebGL)를 그릴 수 있는가 — 하드웨어 가속을 끈 PC · 오래된 기기 · 일부 회사 브라우저는 못 그린다.
// 못 그리는데 Canvas 를 세우면 three 가 콘솔에만 영어 오류를 남기고 화면은 HUD 아래가 검게 빈다.
// 그래서 세우기 전에 한 번 묻고, 시험으로 연 문맥은 바로 돌려준다(브라우저마다 문맥 수에 한도가 있다).
export function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") ?? c.getContext("webgl")) as WebGLRenderingContext | null;
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}
