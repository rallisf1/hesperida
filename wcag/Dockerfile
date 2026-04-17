FROM node:22-trixie-slim

ARG NODE_ENV=production
ENV NODE_ENV=$NODE_ENV
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN apt-get update && apt-get install -y xvfb xbase-clients && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ARG CACHE_BUST

COPY ./wcag /app

RUN npm install

RUN npx playwright install chromium --with-deps

ENTRYPOINT ["sh", "-c", "xvfb-run --auto-servernum --server-args='-screen 0 1920x1080x24' node /app/index.js \"$@\"", "--"]