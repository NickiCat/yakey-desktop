FROM electronuserland/builder:22-wine

ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1

WORKDIR /app
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY . .
RUN npm run typecheck && npm test && npm run build

CMD ["bash", "docker/package.sh", "nsis"]
