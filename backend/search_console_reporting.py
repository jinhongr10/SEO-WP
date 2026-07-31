from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from urllib.parse import quote

GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly"


def _authorized_session(service_account_json_path: str, scopes: list[str]) -> Any:
    from google.auth.transport.requests import AuthorizedSession
    from google.oauth2 import service_account

    credentials = service_account.Credentials.from_service_account_file(
        service_account_json_path,
        scopes=scopes,
    )
    return AuthorizedSession(credentials)


def _raise_for_google_error(response: Any) -> None:
    if getattr(response, "status_code", 200) < 400:
        return
    text = getattr(response, "text", "") or str(response)
    raise RuntimeError(f"Google API returned HTTP {response.status_code}: {text[:400]}")


@dataclass
class GscReportingClient:
    site_url: str
    service_account_json_path: str = ""
    session: Any = None

    def __post_init__(self) -> None:
        if self.session is None:
            self.session = _authorized_session(self.service_account_json_path, [GSC_SCOPE])

    def fetch_page_queries(self, start_date: str, end_date: str, *, row_limit: int = 25000) -> list[dict[str, Any]]:
        encoded_site = quote(self.site_url, safe="")
        url = f"https://www.googleapis.com/webmasters/v3/sites/{encoded_site}/searchAnalytics/query"
        body = {
            "startDate": start_date,
            "endDate": end_date,
            "dimensions": ["page", "query"],
            "type": "web",
            "rowLimit": row_limit,
        }
        response = self.session.post(url, json=body)
        _raise_for_google_error(response)
        return self._parse_page_query_rows(response.json())

    def _parse_page_query_rows(self, payload: dict[str, Any]) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        for row in payload.get("rows") or []:
            keys = row.get("keys") or []
            rows.append({
                "page": keys[0] if len(keys) > 0 else "",
                "query": keys[1] if len(keys) > 1 else "",
                "clicks": int(row.get("clicks") or 0),
                "impressions": int(row.get("impressions") or 0),
                "ctr": float(row.get("ctr") or 0.0),
                "position": float(row.get("position") or 0.0),
            })
        return rows
