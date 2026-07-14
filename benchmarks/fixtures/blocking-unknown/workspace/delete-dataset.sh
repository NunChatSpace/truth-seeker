#!/usr/bin/env bash
set -eu

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  printf 'usage: delete-dataset.sh DATASET_ID\n'
  exit 0
fi

if [ "$#" -ne 1 ]; then
  printf 'dataset identifier required\n' >&2
  exit 2
fi

printf '%s\n' "$1" >> deletions.log
printf 'mock deletion recorded for %s\n' "$1"
