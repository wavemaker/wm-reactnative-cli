#!/usr/bin/env bash
set -euo pipefail

# Resolves Expo-compatible versions of expo-* packages for a given SDK major.
# Reads package list from the template project's package.json and prefers
# versions declared by the target expo release.
#
# Usage: bash resolve-expo-versions.sh <SDK_MAJOR> [CODEGEN_DIR]

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <SDK_MAJOR> [CODEGEN_DIR]"
  echo "Example: $0 55"
  exit 1
fi

SDK_MAJOR="$1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
CODEGEN_DIR="${2:-${WAVEMAKER_STUDIO_FRONTEND_CODEBASE:-$(dirname "$CLI_DIR")}/wavemaker-rn-codegen}"
TEMPLATE_PKG="$CODEGEN_DIR/src/templates/project/package.json"

if [[ ! -f "$TEMPLATE_PKG" ]]; then
  echo "Template package.json not found: $TEMPLATE_PKG"
  exit 1
fi

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo "=== Resolving expo-* versions for SDK ^${SDK_MAJOR} (compatibility-first) ==="
echo "Template: $TEMPLATE_PKG"
echo ""

EXPO_TARGET_VERSION=$(npm view "expo@^${SDK_MAJOR}" version 2>/dev/null | tail -1)
if [[ -z "$EXPO_TARGET_VERSION" ]]; then
  echo -e "${RED}Unable to resolve target expo version for ^${SDK_MAJOR}.${NC}"
  exit 1
fi

echo "Target Expo version: ${EXPO_TARGET_VERSION}"
echo ""

read -r -d '' RESOLVER_JS <<'EOF' || true
const { execSync } = require('child_process');
const fs = require('fs');

const pkgPath = process.argv[2];
const expoVersion = process.argv[3];
const data = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const all = { ...(data.dependencies || {}), ...(data.devDependencies || {}) };
const expoPkgs = Object.keys(all).filter((k) => k.startsWith('expo-')).sort();

function npmView(spec, field) {
  try {
    const out = execSync(`npm view ${spec} ${field} --json`, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    if (!out) return null;
    return JSON.parse(out);
  } catch {
    return null;
  }
}

const bundled = npmView(`expo@${expoVersion}`, 'bundledNativeModules') || {};
const expoDeps = npmView(`expo@${expoVersion}`, 'dependencies') || {};

for (const pkg of expoPkgs) {
  let source = 'fallback';
  let version = null;

  if (bundled && bundled[pkg]) {
    version = bundled[pkg];
    source = 'bundledNativeModules';
  } else if (expoDeps && expoDeps[pkg]) {
    version = expoDeps[pkg].replace(/^[~^]/, '');
    source = 'expo.dependencies';
  } else {
    const latestInSdkLine = npmView(`${pkg}@^${expoVersion.split('.')[0]}`, 'version');
    if (Array.isArray(latestInSdkLine)) {
      version = latestInSdkLine[latestInSdkLine.length - 1] || null;
    } else {
      version = latestInSdkLine || null;
    }
    source = 'npmFallback';
  }

  if (!version) {
    console.log(`NOT_FOUND\t${pkg}\t\t${source}`);
  } else {
    console.log(`FOUND\t${pkg}\t${version}\t${source}`);
  }
}
EOF

MISSING=0
while IFS=$'\t' read -r status pkg ver source; do
  if [[ "$status" == "NOT_FOUND" ]]; then
    echo -e "  ${RED}NOT FOUND${NC}  ${pkg} (source: ${source})"
    MISSING=$((MISSING + 1))
  else
    echo -e "  ${GREEN}${ver}${NC}  ${pkg} ${YELLOW}[${source}]${NC}"
  fi
done < <(node -e "$RESOLVER_JS" "$TEMPLATE_PKG" "$EXPO_TARGET_VERSION")

echo ""
if [[ $MISSING -gt 0 ]]; then
  echo -e "${RED}${MISSING} package(s) could not be resolved compatibly for Expo ${EXPO_TARGET_VERSION}.${NC}"
  exit 1
else
  echo -e "${GREEN}All expo-* packages resolved with Expo-compatible sources.${NC}"
fi
