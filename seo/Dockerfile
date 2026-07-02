FROM node:22-trixie-slim

ARG NODE_ENV=production
ENV NODE_ENV=$NODE_ENV
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN npx playwright install chromium --with-deps \
    && rm -rf /var/lib/apt/lists/*

# prewarm browser
RUN find /ms-playwright -name chrome -type f -exec {} \
    --headless --no-sandbox --disable-gpu --dump-dom about:blank \; 2>/dev/null \
 || true

WORKDIR /app

COPY ./seo/package*.json /app/

RUN npm ci --omit=dev

ARG CACHE_BUST

COPY ./seo /app

ENTRYPOINT ["node", "/app/index.js"]
