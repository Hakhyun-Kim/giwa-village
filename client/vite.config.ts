import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { marked } from 'marked'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

const FAUCET_URL = 'https://faucet.giwa.io/'

// 머신 공유 데모 버너 키 (git-ignored, 테스트넷 전용).
// 브라우저마다 지갑을 새로 만들면 포셋(주소·IP당 24h 제한)을 지갑 수만큼
// 받아야 하므로, 로컬 개발에서는 이 파일의 키 하나를 모든 브라우저가 공유한다.
const BURNER_FILE = fileURLToPath(new URL('../.demo-burner.json', import.meta.url))

// dev 전용 엔드포인트 2개:
// - /__demo-burner: 공유 버너 키를 내려준다 (없으면 생성, created 플래그로 알림)
// - /__open-faucet: 새 버너가 만들어졌을 때 호출 — 페이지 로드 중 window.open은
//   팝업 차단에 걸리므로 dev 서버가 대신 기본 브라우저로 포셋 페이지를 열고
//   (Windows) 버너 주소를 클립보드에 복사한다.
function demoBurnerDev(): Plugin {
  return {
    name: 'giwa-demo-burner-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__demo-burner', (_req, res) => {
        let data: { privateKey: `0x${string}`; address: string } | null = null
        let created = false
        try {
          const raw = JSON.parse(fs.readFileSync(BURNER_FILE, 'utf8'))
          if (/^0x[0-9a-fA-F]{64}$/.test(raw?.privateKey)) data = raw
        } catch {
          // 파일 없음/손상 → 새로 생성
        }
        if (!data) {
          const privateKey = generatePrivateKey()
          data = { privateKey, address: privateKeyToAccount(privateKey).address }
          fs.writeFileSync(BURNER_FILE, JSON.stringify(data, null, 2) + '\n')
          created = true
        }
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ ...data, created }))
      })
      server.middlewares.use('/__open-faucet', (req, res) => {
        const address =
          new URL(req.url ?? '', 'http://localhost').searchParams.get('address') ?? ''
        if (process.platform === 'win32') {
          spawn('cmd', ['/c', 'start', '', FAUCET_URL], { stdio: 'ignore', detached: true }).unref()
          if (/^0x[0-9a-fA-F]{40}$/.test(address)) {
            const clip = spawn('clip', { stdio: ['pipe', 'ignore', 'ignore'] })
            clip.stdin.end(address)
          }
        } else {
          spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [FAUCET_URL], {
            stdio: 'ignore',
            detached: true,
          }).unref()
        }
        res.statusCode = 204
        res.end()
      })
    },
  }
}

// 마을 안에서 여는 문서(놀이 안내 · 처리방침 · 약관 · 객주 장부)는 guide/*.md 가 원본이다.
// 바깥 저장소 페이지로 내보내지 않고 같은 사이트의 guide/<이름>.html 로 굽는다 — 원본은 여전히 md 한 곳.
// 굽지 않는 문서를 가리키는 링크는 글자만 남긴다(사이트 밖으로 새지 않게).
const GUIDE_PAGES: Record<string, string> = {
  PLAY: '기와장터 놀이 안내',
  PRIVACY: '기와장터 개인정보 처리방침',
  TERMS: '기와장터 이용약관',
  GAEKJU: '객주 장부',
}
const GUIDE_DIR = fileURLToPath(new URL('../guide/', import.meta.url))

function guideHtml(name: string): string {
  const md = fs.readFileSync(GUIDE_DIR + name + '.md', 'utf8')
  const renderer = new marked.Renderer()
  renderer.link = function ({ href, tokens }) {
    const text = this.parser.parseInline(tokens)
    if (/^(https?:|mailto:)/.test(href)) return `<a href="${href}" rel="noreferrer">${text}</a>`
    const page = href.match(/^([A-Z]+)\.md(#.*)?$/)
    if (page && page[1] in GUIDE_PAGES) return `<a href="./${page[1].toLowerCase()}.html${page[2] ?? ''}">${text}</a>`
    return text
  }
  const body = marked.parse(md, { renderer, async: false }) as string
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${GUIDE_PAGES[name]}</title>
<style>
  body { margin: 0; background: #0d1017; color: #cfd6e2; line-height: 1.7; font-size: 15px;
    font-family: "Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif; }
  main { max-width: 820px; margin: 0 auto; padding: 28px 16px 60px; }
  h1 { color: #fff; font-size: 24px; } h2, h3 { color: #ffd66b; margin-top: 30px; }
  a { color: #ffd66b; }
  table { width: 100%; border-collapse: collapse; font-size: 13.5px; display: block; overflow-x: auto; }
  th, td { border: 1px solid #2a3040; padding: 7px 9px; text-align: left; vertical-align: top; }
  th { background: #161b26; color: #9ecbff; }
  code { background: #161b26; border-radius: 4px; padding: 1px 5px; font-size: 13px; }
  pre { background: #161b26; padding: 12px; overflow-x: auto; } pre code { padding: 0; }
  blockquote { margin: 12px 0; padding: 4px 14px; border-left: 3px solid #ffd66b; color: #aab4c5; }
</style></head>
<body><main><p><a href="../">← 마을로</a></p>
${body}</main></body></html>
`
}

function guidePages(): Plugin {
  return {
    name: 'giwa-guide-pages',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = req.url?.match(/\/guide\/([a-z]+)\.html$/)
        const name = m?.[1].toUpperCase()
        if (!name || !(name in GUIDE_PAGES)) return next()
        res.setHeader('content-type', 'text/html; charset=utf-8')
        res.end(guideHtml(name))
      })
    },
    generateBundle() {
      for (const name of Object.keys(GUIDE_PAGES)) {
        this.emitFile({ type: 'asset', fileName: `guide/${name.toLowerCase()}.html`, source: guideHtml(name) })
      }
    },
  }
}

// VITE_BASE: GitHub Pages 배포는 "./"(상대 경로) — giwa.metah.dev 루트와 github.io 하위 경로 둘 다 돈다 (기본 "/")
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react(), demoBurnerDev(), guidePages()],
  resolve: {
    alias: {
      // 결정론 게임 로직 코어 — 클라·봇·검증기가 공유하는 단일 소스 (repo 내 core/)
      '@giwa-village/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
    },
  },
})
