#!/bin/bash
# cursor-cli installer
# Usage: curl -fsSL https://raw.githubusercontent.com/eroperez/cursor-cli/main/install.sh | bash

set -euo pipefail

REPO="eroperez/cursor-cli"
INSTALL_DIR="${CURSOR_CLI_INSTALL_DIR:-$HOME/.cursor-cli/bin}"
BIN_NAME="cursor-cli"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

info()    { echo -e "${CYAN}[info]${RESET} $*"; }
success() { echo -e "${GREEN}[ok]${RESET}  $*"; }
warn()    { echo -e "${YELLOW}[warn]${RESET} $*"; }
error()   { echo -e "${RED}[err]${RESET}  $*" >&2; }
die()     { error "$*"; exit 1; }

# ── Detect OS / arch ──────────────────────────────────────────────────────────

OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Linux)  PLATFORM="linux" ;;
  Darwin) PLATFORM="macos" ;;
  *)      die "Unsupported OS: $OS" ;;
esac

case "$ARCH" in
  x86_64)  ARCH="x64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *)       die "Unsupported architecture: $ARCH" ;;
esac

# ── Check dependencies ────────────────────────────────────────────────────────

check_bun() {
  if command -v bun &>/dev/null; then
    BUN_VERSION="$(bun --version)"
    MAJOR="${BUN_VERSION%%.*}"
    MINOR="${BUN_VERSION#*.}"; MINOR="${MINOR%%.*}"
    if [[ "$MAJOR" -gt 1 ]] || { [[ "$MAJOR" -eq 1 ]] && [[ "$MINOR" -ge 3 ]]; }; then
      success "bun $BUN_VERSION found"
      return 0
    fi
    warn "bun $BUN_VERSION found but 1.3+ is required. Upgrading..."
  else
    info "bun not found. Installing..."
  fi
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
  success "bun installed"
}

check_git() {
  command -v git &>/dev/null || die "git is required. Install it and re-run."
  success "git $(git --version | awk '{print $3}') found"
}

# ── Install ───────────────────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}cursor-cli installer${RESET}"
echo "────────────────────────────────────"
echo ""

check_git
check_bun

CLONE_DIR="$(mktemp -d)"
trap 'rm -rf "$CLONE_DIR"' EXIT

info "Cloning repository..."
git clone --depth 1 "https://github.com/$REPO.git" "$CLONE_DIR" 2>/dev/null \
  || die "Failed to clone $REPO. Check your internet connection."
success "Repository cloned"

info "Installing dependencies..."
(cd "$CLONE_DIR" && bun install)
success "Dependencies installed"

info "Building..."
(cd "$CLONE_DIR" && bun run build)
success "Build complete"

mkdir -p "$INSTALL_DIR"

# Copy compiled output and source
DEST="$HOME/.cursor-cli/app"
rm -rf "$DEST"
cp -r "$CLONE_DIR" "$DEST"

# Create launcher script
cat > "$INSTALL_DIR/$BIN_NAME" <<'LAUNCHER'
#!/bin/bash
exec bun "$HOME/.cursor-cli/app/src/index.ts" "$@"
LAUNCHER

chmod +x "$INSTALL_DIR/$BIN_NAME"
success "Installed to $INSTALL_DIR/$BIN_NAME"

# ── PATH setup ────────────────────────────────────────────────────────────────

add_to_path() {
  local shell_rc="$1"
  local export_line="export PATH=\"$INSTALL_DIR:\$PATH\""
  if [[ -f "$shell_rc" ]] && grep -qF "$INSTALL_DIR" "$shell_rc" 2>/dev/null; then
    return 0
  fi
  echo "" >> "$shell_rc"
  echo "# cursor-cli" >> "$shell_rc"
  echo "$export_line" >> "$shell_rc"
}

CURRENT_SHELL="$(basename "${SHELL:-bash}")"
case "$CURRENT_SHELL" in
  zsh)  add_to_path "$HOME/.zshrc" ;;
  bash)
    add_to_path "$HOME/.bashrc"
    [[ "$PLATFORM" == "macos" ]] && add_to_path "$HOME/.bash_profile"
    ;;
  fish)
    FISH_CONFIG="$HOME/.config/fish/config.fish"
    mkdir -p "$(dirname "$FISH_CONFIG")"
    if ! grep -qF "$INSTALL_DIR" "$FISH_CONFIG" 2>/dev/null; then
      echo "fish_add_path $INSTALL_DIR" >> "$FISH_CONFIG"
    fi
    ;;
esac

export PATH="$INSTALL_DIR:$PATH"

# ── Done ─────────────────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}${BOLD}Installation complete!${RESET}"
echo ""
echo "  Set your API key:"
echo -e "  ${CYAN}export CURSOR_API_KEY=\"crsr_...\"${RESET}"
echo ""
echo "  Run in current directory:"
echo -e "  ${CYAN}cursor-cli .${RESET}"
echo ""

if ! command -v cursor-cli &>/dev/null; then
  warn "Restart your shell or run:"
  echo -e "  ${CYAN}export PATH=\"$INSTALL_DIR:\$PATH\"${RESET}"
fi
