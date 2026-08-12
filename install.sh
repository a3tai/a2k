#!/bin/sh
# A2K installer. Served at https://a2k.a3t.ai/install.sh
# Installs the a2k CLI from source into $A2K_HOME and links a wrapper into $A2K_BIN_DIR.
# ponytail: source install until prebuilt binaries ship (RFC 0001, product track P3).
set -eu

REPO_URL="${A2K_REPO_URL:-https://github.com/a3tai/a2k.git}"
A2K_HOME="${A2K_HOME:-$HOME/.a2k}"
A2K_BIN_DIR="${A2K_BIN_DIR:-$HOME/.local/bin}"
SRC_DIR="$A2K_HOME/src"

fail() {
  echo "a2k install: $1" >&2
  exit 1
}

command -v git >/dev/null 2>&1 || fail "git is required"
command -v node >/dev/null 2>&1 || fail "Node.js >= 24 is required (https://nodejs.org)"
command -v npm >/dev/null 2>&1 || fail "npm is required"

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 24 ] || fail "Node.js >= 24 is required (found $(node --version))"

if [ -d "$SRC_DIR/.git" ]; then
  echo "Updating $SRC_DIR"
  git -C "$SRC_DIR" fetch origin --tags --prune
  git -C "$SRC_DIR" reset --hard origin/main
else
  echo "Cloning $REPO_URL into $SRC_DIR"
  mkdir -p "$A2K_HOME"
  git clone --depth 1 "$REPO_URL" "$SRC_DIR"
fi

echo "Building"
cd "$SRC_DIR"
npm ci --ignore-scripts --no-audit --no-fund
npm run build

mkdir -p "$A2K_BIN_DIR"
cat >"$A2K_BIN_DIR/a2k" <<WRAPPER
#!/bin/sh
exec node "$SRC_DIR/packages/cli/dist/cli.js" "\$@"
WRAPPER
chmod +x "$A2K_BIN_DIR/a2k"

echo
echo "Installed a2k to $A2K_BIN_DIR/a2k"
case ":$PATH:" in
  *":$A2K_BIN_DIR:"*) ;;
  *) echo "Add $A2K_BIN_DIR to your PATH." ;;
esac
echo
echo "Enable directory-aware context by adding one line to your shell rc file:"
echo '  zsh:  eval "$(a2k hook zsh)"'
echo '  bash: eval "$(a2k hook bash)"'
