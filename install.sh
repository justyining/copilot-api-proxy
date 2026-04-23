#!/usr/bin/env bash
set -euo pipefail

REPO="justyining/copilot-api"
SCRIPT="claude-copilot"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/bin}"
VERSION="${1:-latest}"

# Resolve version to a commit-ish
if [ "$VERSION" = "latest" ]; then
  REF="master"
else
  REF="$VERSION"
fi

URL="https://raw.githubusercontent.com/${REPO}/${REF}/${SCRIPT}"

echo "Installing ${SCRIPT} (${REF})..."

# Ensure install directory exists
mkdir -p "$INSTALL_DIR"

# Download
if ! curl -fsSL "$URL" -o "${INSTALL_DIR}/${SCRIPT}"; then
  echo "Error: failed to download from $URL" >&2
  exit 1
fi

chmod +x "${INSTALL_DIR}/${SCRIPT}"

# Check PATH
case ":$PATH:" in
  *":$INSTALL_DIR:"*)
    echo "Installed: ${INSTALL_DIR}/${SCRIPT}"
    ;;
  *)
    echo "Installed: ${INSTALL_DIR}/${SCRIPT}"
    echo ""
    echo "WARNING: $INSTALL_DIR is not in your PATH."
    echo "Add it by running:"
    echo "  echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.zshrc"
    echo "  source ~/.zshrc"
    ;;
esac

echo "Done. Run: ${SCRIPT}"
