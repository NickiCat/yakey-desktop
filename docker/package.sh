#!/usr/bin/env bash
# Запускается внутри контейнера: упаковывает один таргет и выкладывает пакет в /app/dist (bind-mount на хост).
set -euo pipefail

target="${1:?usage: package.sh deb|pacman|rpm|nsis}"
out=/tmp/release

platform=--linux
[[ "$target" == nsis ]] && platform=--win

npx electron-builder "$platform" "$target" --x64 --publish never -c.directories.output="$out"

mkdir -p /app/dist
find "$out" -maxdepth 1 -type f \( -name '*.deb' -o -name '*.pkg.tar.zst' -o -name '*.rpm' -o -name '*-setup.exe' \) -exec cp -v {} /app/dist/ \;

# файлы, созданные root в контейнере, отдаём пользователю хоста
if [[ -n "${HOST_UID:-}" ]]; then
  chown "${HOST_UID}:${HOST_GID:-$HOST_UID}" /app/dist /app/dist/*
fi
