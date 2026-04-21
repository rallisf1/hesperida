FROM node:22-trixie-slim

ARG NODE_ENV=production
ENV NODE_ENV=$NODE_ENV
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN npx playwright install chromium --with-deps

RUN apt install -y git

RUN rm -rf /var/lib/apt/lists/*

# prewarm browser
RUN find /ms-playwright -name chrome -type f -exec {} \
    --headless --no-sandbox --disable-gpu --dump-dom about:blank \; 2>/dev/null \
 || true

WORKDIR /app

ARG CACHE_BUST

RUN git clone https://github.com/seo-skills/seo-audit-skill.git seomator

WORKDIR /app/seomator

RUN npm install --include=dev && npm run build

WORKDIR /app

COPY ./seo /app

RUN npm install

ENTRYPOINT ["node", "/app/index.js"]