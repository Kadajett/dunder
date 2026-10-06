#!/bin/sh
# Dunder installer: https://dunder.yougotserved.dev
#
#   curl -fsSL https://dunder.yougotserved.dev/install.sh | sh
#   curl -fsSL https://dunder.yougotserved.dev/install.sh | sh -s -- --yes
#
# Makes sure Node.js >= 22 is available (installing a private, checksum-verified copy
# into ~/.local/share/dunder/node when it is not), then hands over to
# `npx dunder-ai@latest setup`, passing every flag through. Never uses sudo.
#
# Environment overrides:
#   DUNDER_HOME        install root (default: ~/.local/share/dunder)
#   DUNDER_NODE_LINE   Node.js major line to install when missing (default: 24)

set -eu

NODE_MIN_MAJOR=22
NODE_LINE="${DUNDER_NODE_LINE:-24}"
NODE_DIST="https://nodejs.org/dist/latest-v${NODE_LINE}.x"
DUNDER_HOME="${DUNDER_HOME:-${HOME:?HOME is not set}/.local/share/dunder}"
NODE_HOME="$DUNDER_HOME/node"
WORK_DIR=""

if [ -t 1 ]; then
	BOLD="$(printf '\033[1m')" DIM="$(printf '\033[2m')" GREEN="$(printf '\033[32m')"
	RED="$(printf '\033[31m')" RESET="$(printf '\033[0m')"
else
	BOLD="" DIM="" GREEN="" RED="" RESET=""
fi

say() { printf '%s\n' "$*"; }
step() { printf '%s==>%s %s\n' "$GREEN$BOLD" "$RESET$BOLD" "$*$RESET"; }
note() { printf '    %s%s%s\n' "$DIM" "$*" "$RESET"; }
die() {
	printf '%serror:%s %s\n' "$RED$BOLD" "$RESET" "$*" >&2
	exit 1
}

cleanup() {
	if [ -n "$WORK_DIR" ] && [ -d "$WORK_DIR" ]; then
		rm -rf "$WORK_DIR"
	fi
	WORK_DIR=""
}
trap cleanup EXIT
trap 'cleanup; exit 130' INT TERM

check_platform() {
	os="$(uname -s)"
	arch="$(uname -m)"
	[ "$os" = "Linux" ] || die "Dunder currently supports Linux only (found $os)."
	case "$arch" in
	x86_64 | amd64) ;;
	*) die "Dunder currently supports x86_64 only (found $arch)." ;;
	esac
}

# Prints the major version of the `node` on PATH, or nothing when there is none.
node_major() {
	command -v node >/dev/null 2>&1 || return 0
	node --version 2>/dev/null | sed -n 's/^v\([0-9][0-9]*\)\..*$/\1/p'
}

has_usable_node() {
	major="$(node_major)"
	[ -n "$major" ] && [ "$major" -ge "$NODE_MIN_MAJOR" ] && command -v npx >/dev/null 2>&1
}

download() {
	if command -v curl >/dev/null 2>&1; then
		curl -fsSL --retry 3 --connect-timeout 15 --max-time 600 -o "$2" "$1"
	elif command -v wget >/dev/null 2>&1; then
		wget -q --tries=3 --timeout=30 -O "$2" "$1"
	else
		die "Neither curl nor wget is installed; please install one of them first."
	fi
}

sha256_of() {
	if command -v sha256sum >/dev/null 2>&1; then
		sha256sum "$1" | cut -d ' ' -f 1
	elif command -v shasum >/dev/null 2>&1; then
		shasum -a 256 "$1" | cut -d ' ' -f 1
	else
		die "Neither sha256sum nor shasum is available to verify the Node.js download."
	fi
}

install_node() {
	step "Installing Node.js ${NODE_LINE}.x (private copy, no sudo)"
	note "into $NODE_HOME"
	WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/dunder-install.XXXXXX")"
	download "$NODE_DIST/SHASUMS256.txt" "$WORK_DIR/SHASUMS256.txt" ||
		die "Could not download $NODE_DIST/SHASUMS256.txt"
	line="$(grep -E '  node-v[0-9]+\.[0-9]+\.[0-9]+-linux-x64\.tar\.gz$' "$WORK_DIR/SHASUMS256.txt" | head -n 1)"
	[ -n "$line" ] || die "Could not find a linux-x64 tarball in $NODE_DIST/SHASUMS256.txt"
	expected="${line%% *}"
	tarball="${line##* }"
	note "downloading $tarball"
	download "$NODE_DIST/$tarball" "$WORK_DIR/$tarball" || die "Could not download $NODE_DIST/$tarball"
	actual="$(sha256_of "$WORK_DIR/$tarball")"
	[ "$actual" = "$expected" ] || die "Checksum mismatch for $tarball (expected $expected, got $actual)"
	note "checksum verified (sha256 $expected)"
	mkdir -p "$WORK_DIR/node"
	tar -xzf "$WORK_DIR/$tarball" -C "$WORK_DIR/node" --strip-components=1
	mkdir -p "$DUNDER_HOME"
	rm -rf "$NODE_HOME"
	mv "$WORK_DIR/node" "$NODE_HOME"
	cleanup
	say "    ${GREEN}✓${RESET} Node.js $("$NODE_HOME/bin/node" --version) installed"
}

ensure_node() {
	if has_usable_node; then
		note "using Node.js $(node --version) from $(command -v node)"
		return 0
	fi
	if [ -x "$NODE_HOME/bin/node" ]; then
		PATH="$NODE_HOME/bin:$PATH"
		export PATH
		if has_usable_node; then
			note "using Dunder's Node.js $(node --version) from $NODE_HOME"
			return 0
		fi
	fi
	found="$(node_major)"
	if [ -n "$found" ]; then
		note "found Node.js $found, but Dunder needs $NODE_MIN_MAJOR or newer"
	else
		note "Node.js not found"
	fi
	install_node
	PATH="$NODE_HOME/bin:$PATH"
	export PATH
	has_usable_node || die "Node.js was installed to $NODE_HOME but is not runnable."
	note "for later shells, add it to your PATH:"
	note "  export PATH=\"$NODE_HOME/bin:\$PATH\""
}

main() {
	say ""
	say "${BOLD}Dunder${RESET} ${DIM}· an office for your AI coding agents · dunder.ai${RESET}"
	say ""
	check_platform
	step "Checking for Node.js >= $NODE_MIN_MAJOR"
	ensure_node
	if [ "${NODE_HOME}/bin/node" = "$(command -v node)" ]; then
		DUNDER_NODE_BIN="$NODE_HOME/bin"
		export DUNDER_NODE_BIN
	fi
	step "Handing over to the Dunder setup (npx dunder-ai@latest setup)"
	say ""
	# Under `curl | sh` stdin is the script itself; give setup the terminal so it can ask first.
	if (exec </dev/tty) 2>/dev/null; then
		exec npx -y dunder-ai@latest setup "$@" </dev/tty
	fi
	exec npx -y dunder-ai@latest setup "$@"
}

main "$@"
