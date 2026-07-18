import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
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

// VITE_BASE: GitHub Pages 배포 시 "/<repo-name>/" (기본 "/")
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react(), demoBurnerDev()],
})
