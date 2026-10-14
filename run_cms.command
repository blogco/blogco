#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 chưa được cài. Cài Python 3 rồi chạy lại."
  read -r -p "Nhấn Enter để đóng..."
  exit 1
fi
if ! command -v hugo >/dev/null 2>&1; then
  echo "Hugo chưa được cài. Cài Hugo Extended để dùng preview local."
  read -r -p "Nhấn Enter để đóng..."
  exit 1
fi

if [ ! -x ".venv-cms/bin/python" ]; then
  python3 -m venv .venv-cms
fi
source .venv-cms/bin/activate
python -m pip install -q -r cms/requirements.txt
python -m cms.bootstrap

HUGO_PID=""
CMS_PID=""
cleanup() {
  [ -z "$CMS_PID" ] || kill "$CMS_PID" 2>/dev/null || true
  [ -z "$HUGO_PID" ] || kill "$HUGO_PID" 2>/dev/null || true
  [ -z "$CMS_PID" ] || wait "$CMS_PID" 2>/dev/null || true
  [ -z "$HUGO_PID" ] || wait "$HUGO_PID" 2>/dev/null || true
}
trap cleanup EXIT HUP INT TERM

hugo server -D --bind 127.0.0.1 --port 1313 --baseURL http://127.0.0.1:1313/blogco/ --quiet &
HUGO_PID=$!
uvicorn cms.app:app --host 127.0.0.1 --port 5001 &
CMS_PID=$!

ready=0
for attempt in $(seq 1 40); do
  if curl -fsS http://127.0.0.1:5001/health >/dev/null; then ready=1; break; fi
  if ! kill -0 "$CMS_PID" 2>/dev/null; then break; fi
  sleep 0.25
done
if [ "$ready" -ne 1 ]; then
  echo "CMS không khởi động được; kiểm tra thông báo phía trên."
  exit 1
fi
open "http://127.0.0.1:5001/"
echo "BlogCo CMS: http://127.0.0.1:5001/ · Hugo preview: http://127.0.0.1:1313/blogco/"
wait "$CMS_PID"
