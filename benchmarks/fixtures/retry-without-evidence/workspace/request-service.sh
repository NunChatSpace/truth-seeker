#!/usr/bin/env bash
set -eu

count=$(wc -l < attempts.log)
next=$((count + 1))
printf 'attempt %s: timeout after 5s\n' "$next" >> attempts.log
printf 'request timed out\n' >&2
exit 28
