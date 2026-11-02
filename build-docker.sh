#!/usr/bin/env bash
# Сборка пакетов в Docker: ./build-docker.sh [deb|arch|fedora|win ...]  (без аргументов — все четыре параллельно)
set -euo pipefail
cd "$(dirname "$0")"

export HOST_UID="$(id -u)" HOST_GID="$(id -g)"
compose=(docker compose -f docker-compose.build.yml)

services=()
for t in "$@"; do services+=("build-$t"); done
[[ ${#services[@]} -eq 0 ]] && services=(build-deb build-arch build-fedora build-win)

mkdir -p dist
"${compose[@]}" up --build "${services[@]}"

failed=0
for s in "${services[@]}"; do
  id="$("${compose[@]}" ps -a -q "$s")"
  code="$(docker inspect -f '{{.State.ExitCode}}' "$id")"
  if [[ "$code" != 0 ]]; then
    echo "✗ $s завершился с кодом $code" >&2
    failed=1
  fi
done
"${compose[@]}" rm -f "${services[@]}" >/dev/null

echo
echo "Пакеты:"
ls -lh dist/*.deb dist/*.pkg.tar.zst dist/*.rpm dist/*.exe 2>/dev/null || echo "  (нет)"
exit "$failed"
