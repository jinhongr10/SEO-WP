#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

image_tar="${IMAGE_TAR:-seo-wp-sync-amd64.tar}"
release_name="${RELEASE_NAME:-seo-wp-sync-amd64-private-full}"
release_root="${RELEASE_ROOT:-release}"
bundle_dir="$release_root/$release_name"
bundle_archive="$release_root/$release_name.tar.gz"

if [ ! -f "$image_tar" ]; then
  echo "Missing Docker image tar: $image_tar" >&2
  echo "Build and save it first:" >&2
  echo "  docker buildx build --platform linux/amd64 -f Dockerfile.combined -t seo-wp-sync:amd64 --load ." >&2
  echo "  docker save seo-wp-sync:amd64 -o $image_tar" >&2
  exit 1
fi

rm -rf "$bundle_dir" "$bundle_archive"
mkdir -p "$bundle_dir/wordpress-plugins"

cp "$image_tar" "$bundle_dir/"
cp docker-compose.private.yml "$bundle_dir/docker-compose.server.yml"
cp deploy-amd64.sh "$bundle_dir/"
cp .env.server.example "$bundle_dir/" 2>/dev/null || true

if [ -d wordpress-plugins ]; then
  cp -R wordpress-plugins/. "$bundle_dir/wordpress-plugins/"
fi

cat > "$bundle_dir/START_HERE.md" <<'EOF'
# seo-wp-sync private amd64 bundle

This deployment bundle includes the Docker image tar, compose file, start script,
environment template, and WordPress plugin files.

It intentionally excludes local secrets and runtime data. Create `.env` from
`.env.server.example`, put any Vertex service-account JSON on the target machine,
and let Docker create fresh `data/`, `cache/`, and `backup/` runtime volumes.

## Start on a Linux/amd64 server

```bash
tar -xzf seo-wp-sync-amd64-private-full.tar.gz
cd seo-wp-sync-amd64-private-full
bash deploy-amd64.sh
```

The deploy script loads `seo-wp-sync-amd64.tar` with `docker load` and starts
the service with `docker compose`.

Default URL after start:

```text
http://SERVER_IP:3000
```

Change `APP_PORT` in `.env` before running the script if you want another port.

## Important

Do not add developer `.env` files, API keys, service-account JSON files,
SQLite databases, caches, or backups to this archive before sharing it.
EOF

chmod 700 "$bundle_dir"
find "$bundle_dir" -type d -exec chmod 700 {} +

tar -czf "$bundle_archive" -C "$release_root" "$release_name"

echo "Created $bundle_archive"
du -sh "$bundle_dir" "$bundle_archive"
