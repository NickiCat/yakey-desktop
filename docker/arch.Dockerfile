FROM archlinux:base-devel

ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1 \
    GEM_HOME=/opt/gems \
    PATH=/opt/gems/bin:$PATH \
    USE_SYSTEM_FPM=true

# Системный fpm свежее встроенного в electron-builder и умеет --pacman-compression zstd
RUN pacman -Syu --noconfirm --needed nodejs npm ruby rubygems libarchive zstd \
 && pacman -Scc --noconfirm \
 && gem install --no-document --no-user-install fpm erb

WORKDIR /app
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY . .
RUN npm run typecheck && npm test && npm run build

CMD ["bash", "docker/package.sh", "pacman"]
