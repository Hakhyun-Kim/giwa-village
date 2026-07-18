import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { spawn } from 'node:child_process'

const FAUCET_URL = 'https://faucet.giwa.io/'

// dev 전용: 데모 모드가 새 버너를 만들면 /__open-faucet 을 호출한다.
// 페이지 로드 중 window.open은 팝업 차단에 걸리므로, dev 서버가 대신
// 기본 브라우저로 포셋 페이지를 열고 (Windows) 버너 주소를 클립보드에 복사.
function openFaucet(): Plugin {
  return {
    name: 'giwa-open-faucet',
    apply: 'serve',
    configureServer(server) {
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
  plugins: [react(), openFaucet()],
})
