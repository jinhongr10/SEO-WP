from __future__ import annotations

import argparse
import os

import uvicorn

from backend.main import app


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name, "").strip()
    try:
        return int(raw) if raw else default
    except ValueError:
        return default


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the SeoWpSync desktop backend.")
    parser.add_argument("--host", default=os.getenv("SEO_WP_SYNC_BACKEND_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=_env_int("SEO_WP_SYNC_BACKEND_PORT", 3004))
    args = parser.parse_args()

    uvicorn.run(
        app,
        host=args.host,
        port=args.port,
        log_level=os.getenv("SEO_WP_SYNC_BACKEND_LOG_LEVEL", "info"),
        access_log=False,
    )


if __name__ == "__main__":
    main()
