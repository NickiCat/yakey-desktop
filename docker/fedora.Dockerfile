FROM fedora:latest

ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1

# - libxcrypt-compat нужен fpm, который скачивает electron-builder (libcrypt.so.1)
# - репозиторий Cisco (openh264) часто недоступен и для сборки не нужен, как и слабые зависимости;
#   вместо группы @development-tools — только то, что нужно для npm-пакетов с нативным кодом
RUN dnf install -y \
      --disablerepo=fedora-cisco-openh264 \
      --setopt=install_weak_deps=False \
      --setopt=retries=10 \
      nodejs npm rpm-build libxcrypt-compat gcc gcc-c++ make python3 \
 && dnf clean all

WORKDIR /app
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY . .
RUN npm run typecheck && npm test && npm run build

CMD ["bash", "docker/package.sh", "rpm"]
