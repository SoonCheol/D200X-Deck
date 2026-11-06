#!/bin/sh
# Log WindowServer's Mach port count once a minute, plus which processes were
# created in the last minute. Read-only: it changes nothing on the machine.
#   sh scripts/port-monitor.sh [seconds-between-samples] [samples]
# Output: ~/Library/Logs/Ulanzi Deck Open/port-monitor.log
set -eu
INTERVAL="${1:-60}"
SAMPLES="${2:-0}" # 0 = until killed
LOG="$HOME/Library/Logs/Ulanzi Deck Open/port-monitor.log"
mkdir -p "$(dirname "$LOG")"
n=0
while :; do
  ws=$(ps -axo pid=,comm= | awk '/\/WindowServer$/{print $1; exit}')
  ports=$(top -l 1 -pid "$ws" -stats pid,ports 2>/dev/null | tail -1 | awk '{gsub(/[+-]/,"",$2); print $2}')
  # processes younger than one minute (etime "00:SS"), by program name
  young=$(ps -axo etime=,comm= | awk '$1 ~ /^00:[0-5][0-9]$/ {n=split($2,p,"/"); c[p[n]]++} END {for (k in c) printf "%s=%d ", k, c[k]}')
  app=$(ps -axo comm= | grep -c "Ulanzi Deck Open.app/Contents/MacOS" || true)
  printf '%s ws=%s ports=%s app=%s young: %s\n' "$(date '+%F %T')" "$ws" "$ports" "$app" "$young" >> "$LOG"
  n=$((n + 1))
  [ "$SAMPLES" -gt 0 ] && [ "$n" -ge "$SAMPLES" ] && break
  sleep "$INTERVAL"
done
