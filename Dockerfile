# giwa-village 서버 컨테이너 (Colyseus 룸 서버만 — 클라이언트는 정적 호스팅)
FROM node:22-alpine
WORKDIR /app

# 워크스페이스 메타데이터만 먼저 복사해 의존성 레이어를 캐시
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci -w server --no-audit --no-fund

COPY server/src server/src

ENV PORT=2567
EXPOSE 2567
# 노점 레지스트리 영속 (재시작에도 노점 유지)
VOLUME /app/server/data

CMD ["npm", "run", "start", "-w", "server"]
