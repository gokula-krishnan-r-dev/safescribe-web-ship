#!/usr/bin/env bash
# Apply production DNS + TLS zone settings for safescribe.ca via Cloudflare API.
# Auth (first match):
#   CLOUDFLARE_API_TOKEN
#   wrangler oauth token (~/.wrangler/config/default.toml)
#
# Canada / PHI notes:
#   Web → Vercel yul1 (Montréal), DNS-only (no Cloudflare proxy)
#   API/AI → GCP northamerica-northeast1 (Montréal), DNS-only so clinical
#   traffic and pharmacy IP allowlisting stay on the Canadian origin.
set -euo pipefail

ZONE_NAME="${ZONE_NAME:-safescribe.ca}"
ORIGIN_IP="${ORIGIN_IP:-34.19.234.40}"
VERCEL_CNAME="${VERCEL_CNAME:-cname.vercel-dns.com}"

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
export ZONE_NAME ORIGIN_IP VERCEL_CNAME ROOT

python3 - <<'PY'
from __future__ import annotations

import json
import os
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ZONE_NAME = os.environ["ZONE_NAME"]
ORIGIN_IP = os.environ["ORIGIN_IP"]
VERCEL_CNAME = os.environ["VERCEL_CNAME"]
API = "https://api.cloudflare.com/client/v4"

DESIRED = [
    # Clinical origin — DNS only so traffic stays on the Montreal VM.
    {"name": "api", "type": "A", "content": ORIGIN_IP, "proxied": False, "ttl": 300, "comment": "SafeScribe API Montreal origin"},
    {"name": "ai", "type": "A", "content": ORIGIN_IP, "proxied": False, "ttl": 300, "comment": "SafeScribe AI Montreal origin"},
    # Frontend — Vercel yul1. DNS-only; do not double-proxy.
    {"name": "@", "type": "CNAME", "content": VERCEL_CNAME, "proxied": False, "ttl": 1, "comment": "SafeScribe web Vercel Montréal"},
    {"name": "www", "type": "CNAME", "content": VERCEL_CNAME, "proxied": False, "ttl": 1, "comment": "SafeScribe www → Vercel"},
    {"name": "app", "type": "CNAME", "content": VERCEL_CNAME, "proxied": False, "ttl": 1, "comment": "SafeScribe app alias → Vercel"},
]


def die(msg: str, code: int = 1) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(code)


def load_token() -> str:
    env = os.environ.get("CLOUDFLARE_API_TOKEN") or os.environ.get("CF_API_TOKEN")
    if env:
        return env.strip()
    root = Path(os.environ.get("ROOT") or ".")
    for path in [
        root / "infra/production/secrets/cloudflare.env",
        Path.home() / "Library/Preferences/.wrangler/config/default.toml",
        Path.home() / ".config/.wrangler/config/default.toml",
        Path.home() / ".wrangler/config/default.toml",
    ]:
        if not path.exists():
            continue
        if path.suffix == ".env":
            for line in path.read_text().splitlines():
                if line.startswith("CLOUDFLARE_API_TOKEN="):
                    value = line.split("=", 1)[1].strip().strip('"')
                    if value:
                        return value
            continue
        token = None
        for line in path.read_text().splitlines():
            if line.startswith("oauth_token"):
                token = line.split("=", 1)[1].strip().strip('"')
        if token:
            return token
    die(
        "No Cloudflare DNS token. Wrangler login can read the zone but cannot edit DNS. "
        "Create a zone-scoped API token (DNS Edit + SSL Edit + Zone Settings Edit for safescribe.ca) "
        "and run: CLOUDFLARE_API_TOKEN=... ./infra/production/scripts/cloudflare-dns-setup.sh"
    )
    raise AssertionError


def req(method: str, path: str, token: str, body: dict | None = None, optional: bool = False):
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(
        f"{API}{path}",
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30, context=ssl.create_default_context()) as resp:
            payload = json.load(resp)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")
        if optional:
            print(f"  skip {method} {path} (HTTP {exc.code})")
            return None
        die(f"Cloudflare {method} {path} → HTTP {exc.code}: {detail[:500]}")
    if not payload.get("success", True):
        if optional:
            print(f"  skip {path}: {payload.get('errors')}")
            return None
        die(f"Cloudflare {method} {path} failed: {payload.get('errors')}")
    return payload
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(
        f"{API}{path}",
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30, context=ssl.create_default_context()) as resp:
            payload = json.load(resp)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")
        die(f"Cloudflare {method} {path} → HTTP {exc.code}: {detail[:500]}")
    if not payload.get("success", True):
        die(f"Cloudflare {method} {path} failed: {payload.get('errors')}")
    return payload


def fqdn(name: str) -> str:
    if name in ("@", ZONE_NAME, ""):
        return ZONE_NAME
    if name.endswith(f".{ZONE_NAME}") or name == ZONE_NAME:
        return name
    return f"{name}.{ZONE_NAME}"


def upsert_record(token: str, zone_id: str, desired: dict, existing: list[dict]) -> str:
    name = fqdn(desired["name"])
    rtype = desired["type"]
    matches = [r for r in existing if r.get("name") == name and r.get("type") == rtype]
    extras = [
        r
        for r in existing
        if r.get("name") == name and r.get("type") in {"A", "AAAA", "CNAME"} and r.get("type") != rtype
    ]
    for extra in extras:
        print(f"  remove conflicting {extra['type']} {extra['name']} → {extra.get('content')}")
        req("DELETE", f"/zones/{zone_id}/dns_records/{extra['id']}", token)

    body = {
        "type": rtype,
        "name": name,
        "content": desired["content"],
        "proxied": desired["proxied"],
        "ttl": desired["ttl"] if not desired["proxied"] else 1,
        "comment": desired.get("comment", "SafeScribe production"),
    }
    if matches:
        record = matches[0]
        for leftover in matches[1:]:
            print(f"  remove duplicate {leftover['type']} {leftover['name']}")
            req("DELETE", f"/zones/{zone_id}/dns_records/{leftover['id']}", token)
        same = (
            record.get("content") == body["content"]
            and bool(record.get("proxied")) is body["proxied"]
        )
        if same:
            print(f"  ok {rtype} {name} → {body['content']} (dns-only)")
            return "unchanged"
        req("PUT", f"/zones/{zone_id}/dns_records/{record['id']}", token, body)
        print(f"  updated {rtype} {name} → {body['content']} (dns-only)")
        return "updated"
    req("POST", f"/zones/{zone_id}/dns_records", token, body)
    print(f"  created {rtype} {name} → {body['content']} (dns-only)")
    return "created"


def set_zone_setting(token: str, zone_id: str, setting: str, value, optional: bool = False) -> None:
    payload = req(
        "PATCH",
        f"/zones/{zone_id}/settings/{setting}",
        token,
        {"value": value},
        optional=optional,
    )
    if payload is not None:
        print(f"  setting {setting} = {value}")


def main() -> None:
    token = load_token()
    zones = req("GET", f"/zones?name={urllib.parse.quote(ZONE_NAME)}", token).get("result") or []
    if not zones:
        die(f"Zone {ZONE_NAME} not found for this Cloudflare account")
    zone = zones[0]
    zone_id = zone["id"]
    print(f"Zone {zone['name']} ({zone.get('status')}) id={zone_id}")
    print(f"Plan {zone.get('plan', {}).get('name', 'unknown')}")

    records = req("GET", f"/zones/{zone_id}/dns_records?per_page=200", token).get("result") or []
    print("Applying DNS records (Canada origin, DNS-only):")
    for desired in DESIRED:
        upsert_record(token, zone_id, desired, records)
        records = req("GET", f"/zones/{zone_id}/dns_records?per_page=200", token).get("result") or []

    print("Applying secure TLS settings:")
    set_zone_setting(token, zone_id, "ssl", "strict")
    set_zone_setting(token, zone_id, "always_use_https", "on")
    set_zone_setting(token, zone_id, "min_tls_version", "1.2")
    set_zone_setting(token, zone_id, "tls_1_3", "on")
    set_zone_setting(token, zone_id, "automatic_https_rewrites", "on")
    set_zone_setting(
        token,
        zone_id,
        "security_header",
        {
            "strict_transport_security": {
                "enabled": True,
                "max_age": 31536000,
                "include_subdomains": True,
                "preload": True,
                "nosniff": True,
            }
        },
        optional=True,
    )

    print("Done. Next: wait for DNS, then ./infra/production/scripts/promote-from-staging.sh --certs")


if __name__ == "__main__":
    main()
PY
