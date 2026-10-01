#!/usr/bin/env bash
# Upsert Resend keys into /etc/safescribe/api.env without rewriting other secrets.
# Values are bash-quoted so From addresses like `Rxnow <noreply@phix.now>` source safely.
#
# Usage (on the VM as root):
#   sudo bash /opt/safescribe/infra/production/scripts/apply-resend-env.sh /tmp/resend.env
#
# resend.env should contain only:
#   RESEND_ENABLED=true
#   RESEND_API_KEY=re_...
#   RESEND_FROM_EMAIL=Rxnow <noreply@phix.now>
#   RESEND_WEBHOOK_SECRET=whsec_...
#   EMAIL_APP_URL=https://safescribe.ca
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run as root (sudo)" >&2
  exit 1
fi

SRC="${1:?Path to resend.env required}"
TARGET="${API_ENV_FILE:-/etc/safescribe/api.env}"
APP_USER="${APP_USER:-safescribe}"

if [[ ! -f "$SRC" ]]; then
  echo "Missing source file: $SRC" >&2
  exit 1
fi
if [[ ! -f "$TARGET" ]]; then
  echo "Missing API env file: $TARGET" >&2
  exit 1
fi

python3 - "$SRC" "$TARGET" <<'PY'
import re
import shlex
import sys
from pathlib import Path

src, target = Path(sys.argv[1]), Path(sys.argv[2])
allowed = {
    "RESEND_ENABLED",
    "RESEND_API_KEY",
    "RESEND_FROM_EMAIL",
    "RESEND_WEBHOOK_SECRET",
    "EMAIL_APP_URL",
    "CONTACT_TO_EMAIL",
}

incoming: dict[str, str] = {}
for raw in src.read_text().splitlines():
    line = raw.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    key, value = line.split("=", 1)
    key = key.strip()
    if key not in allowed:
        continue
    value = value.strip().strip("'").strip('"').strip()
    incoming[key] = value

if "RESEND_API_KEY" in incoming and not incoming["RESEND_API_KEY"].startswith("re_"):
    raise SystemExit("RESEND_API_KEY must start with re_")
if "RESEND_WEBHOOK_SECRET" in incoming and incoming["RESEND_WEBHOOK_SECRET"] and not incoming[
    "RESEND_WEBHOOK_SECRET"
].startswith("whsec_"):
    raise SystemExit("RESEND_WEBHOOK_SECRET must start with whsec_")
if "RESEND_FROM_EMAIL" in incoming and "@" not in incoming["RESEND_FROM_EMAIL"]:
    raise SystemExit("RESEND_FROM_EMAIL must include a verified sender address")

text = target.read_text()
for key, value in incoming.items():
    rendered = f"{key}={shlex.quote(value)}"
    pattern = re.compile(rf"^{re.escape(key)}=.*$", re.M)
    if pattern.search(text):
        text = pattern.sub(rendered, text, count=1)
    else:
        text = text.rstrip() + "\n" + rendered + "\n"

target.write_text(text)
print("Updated Resend keys:", ", ".join(sorted(incoming)))
PY

chmod 640 "$TARGET"
chown root:"$APP_USER" "$TARGET"
echo "Resend env applied to $TARGET (values not printed)"
