#!/bin/sh
# Writes src/version.js with the current time and branch, so the title and
# results screens show exactly which build is running. Run it before
# committing a change you want testers to be able to identify:
#   sh tools/stamp-build.sh
cd "$(dirname "$0")/.." || exit 1
stamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
branch=$(git rev-parse --abbrev-ref HEAD)
printf "/* Written by tools/stamp-build.sh. Don't edit by hand. */\nwindow.BOWL_BUILD = { time: '%s', branch: '%s' };\n" "$stamp" "$branch" > src/version.js
echo "stamped $stamp ($branch)"
