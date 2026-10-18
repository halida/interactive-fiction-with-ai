#!/usr/bin/env bash
# Start a local HTTP server to serve Ghost Companion CCA.
#
# Why this file works:
#   The upstream CCA engine (vendor/advent/js/advent.js) uses
#   document.styleSheets[].cssRules internally.  When the page is
#   loaded via the file:// protocol, that throws a SecurityError
#   because CSS files in different directories are considered
#   different origins.  Result: the game silently stalls on
#   "Initializing... please wait".  An HTTP server fixes this.
#
# Usage:
#   ./start.sh                  # default port 8000
#   ./start.sh 8080             # custom port
#
# Then open http://localhost:8000/vendor/advent/advent.html in your
# browser.

set -euo pipefail

# Allow --help / -h even when no port given.
if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  sed -n '2,12p' "$0"
  exit 0
fi

PORT="${1:-8000}"
URL="http://localhost:${PORT}/vendor/advent/advent.html"

echo "Starting Ghost Companion CCA on port ${PORT}..."
echo "Project root: $(pwd)"
echo ""
echo "  → Open this URL in your browser:"
echo "    ${URL}"
echo ""
echo "Press Ctrl+C to stop."

# Use python3's built-in server.  Fall back to other options if missing.
if command -v python3 >/dev/null 2>&1; then
  exec python3 -m http.server "${PORT}"
elif command -v python >/dev/null 2>&1; then
  exec python -m http.server "${PORT}"
elif command -v npx >/dev/null 2>&1; then
  exec npx --yes serve -l "${PORT}" .
else
  echo "Error: need python3 or npx to start an HTTP server." >&2
  exit 1
fi