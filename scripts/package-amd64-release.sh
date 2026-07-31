#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

image_tar="${IMAGE_TAR:-seo-wp-sync-amd64.tar}"
release_name="${RELEASE_NAME:-seo-wp-sync-amd64-deploy}"
release_root="${RELEASE_ROOT:-release}"
bundle_dir="$release_root/$release_name"
bundle_archive="$release_root/$release_name.tar.gz"

if [ ! -f "$image_tar" ]; then
  echo "Missing Docker image tar: $image_tar" >&2
  echo "Build and save it first, for example:" >&2
  echo "  docker buildx build --platform linux/amd64 -f Dockerfile.combined -t seo-wp-sync:amd64 --load ." >&2
  echo "  docker save seo-wp-sync:amd64 -o $image_tar" >&2
  exit 1
fi

rm -rf "$bundle_dir" "$bundle_archive"
mkdir -p "$bundle_dir/keys" "$bundle_dir/wordpress-plugins"

cp "$image_tar" "$bundle_dir/"
cp docker-compose.server.yml "$bundle_dir/"
cp deploy-amd64.sh "$bundle_dir/"
cp .env.server.example "$bundle_dir/"

if [ -d wordpress-plugins ]; then
  cp -R wordpress-plugins/. "$bundle_dir/wordpress-plugins/"
fi

cat > "$bundle_dir/RUNTIME_DATA.md" <<'EOF'
# Runtime data

This bundle intentionally does not include local runtime data.

Docker volumes will hold:
- `/app/data`
- `/app/cache`
- `/app/backup`

Do not copy a developer machine's `data/`, `cache/`, `state/`, `backup/`, or old
`release/` directory into a fresh server bundle unless you are explicitly moving
an existing installation.
EOF

tar -czf "$bundle_archive" -C "$release_root" "$release_name"

echo "Created $bundle_archive"
du -sh "$bundle_dir" "$bundle_archive"
