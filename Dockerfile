# giwa-village 서버 컨테이너 (Colyseus 룸 서버만 — 클라이언트는 정적 호스팅)
FROM node:22-alpine
WORKDIR /app

# 워크스페이스 메타데이터만 먼저 복사해 의존성 레이어를 캐시
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci -w server --no-audit --no-fund

COPY server/src server/src
# 원정 규칙(ExpeditionRoom 이 ../../shared/expedition 을 읽는다)
COPY shared shared

# production: /dev/* 를 닫는다 · 서버는 영구 기록을 갖지 않는다(볼륨 없음 — 돈 · 소유권은 체인에만)
# HOST=0.0.0.0: 컨테이너 밖(호스팅 프록시)에서 들어올 수 있게 — 기본값 127.0.0.1 은 로컬 전용
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=2567
EXPOSE 2567

CMD ["npm", "run", "start", "-w", "server"]
