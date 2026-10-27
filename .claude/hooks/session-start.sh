#!/bin/bash
# Turn on the repo's git hooks for this clone, so every commit gets a build
# stamp (see .githooks/pre-commit and tools/stamp-build.sh). Idempotent.
# The project has no dependencies to install: the game needs no build step
# and the Node tests use only the standard library.
set -euo pipefail
cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"
git config core.hooksPath .githooks
