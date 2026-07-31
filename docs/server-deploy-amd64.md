# AMD64 server deployment

This bundle is intended for an Ubuntu/Linux server that needs to import a prebuilt Docker image.

## Files

- `seo-wp-sync-amd64.tar` - Docker image tagged `seo-wp-sync:amd64`
- `docker-compose.server.yml` - server compose file using the prebuilt image
- `.env.server.example` - server environment template
- `deploy-amd64.sh` - load image and start the service

Secrets and local runtime data are not included. Create `.env` from `.env.server.example` and put your Vertex service-account JSON at `keys/vertex-sa.json` if using Vertex AI.

The release bundle should be generated with:

```bash
bash scripts/package-amd64-release.sh
```

That script intentionally excludes local `data/`, `cache/`, `state/`, `backup/`, and old `release/` contents. Docker volumes create fresh runtime storage on the server.

## Quick start

```bash
tar -xzf seo-wp-sync-amd64-deploy.tar.gz
cd seo-wp-sync-amd64-deploy
cp .env.server.example .env
mkdir -p keys
# edit .env and put keys/vertex-sa.json in place
bash deploy-amd64.sh
```

The app listens on `APP_PORT`, defaulting to `3000`.

## Manual commands

```bash
docker load -i seo-wp-sync-amd64.tar
docker compose --env-file .env -f docker-compose.server.yml up -d
docker compose -f docker-compose.server.yml logs -f --tail=100
```

## Upgrade

Copy a newer `seo-wp-sync-amd64.tar` into the same directory, then run:

```bash
bash deploy-amd64.sh
```
