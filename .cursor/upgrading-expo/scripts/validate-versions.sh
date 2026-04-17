#!/usr/bin/env bash
set -euo pipefail

# Cross-repo version alignment checker for WaveMaker RN ecosystem.
# Compares shared dependency versions across template, runtime, and codegen.
#
# Usage: bash validate-versions.sh [CODEGEN_DIR] [RUNTIME_DIR]
#   Defaults assume sibling repo layout under WAVEMAKER_STUDIO_FRONTEND_CODEBASE.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"

CODEGEN_DIR="${1:-${WAVEMAKER_STUDIO_FRONTEND_CODEBASE:-$(dirname "$CLI_DIR")}/wavemaker-rn-codegen}"
RUNTIME_DIR="${2:-${WAVEMAKER_STUDIO_FRONTEND_CODEBASE:-$(dirname "$CLI_DIR")}/wavemaker-rn-runtime}"

TEMPLATE_PKG="$CODEGEN_DIR/src/templates/project/package.json"
TEMPLATE_DIR="$CODEGEN_DIR/src/templates/project"
RUNTIME_PKG="$RUNTIME_DIR/package.json"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ERRORS=0

get_version() {
    local file="$1" pkg="$2" section="${3:-dependencies}"
    node -e "
        const p = require('$file');
        const v = (p['$section'] || {})['$pkg'];
        if (v) process.stdout.write(v);
    " 2>/dev/null
}

check_match() {
    local pkg="$1"
    local tmpl_section="${2:-dependencies}"
    local rt_section="${3:-dependencies}"

    local tv rv
    tv=$(get_version "$TEMPLATE_PKG" "$pkg" "$tmpl_section")
    rv=$(get_version "$RUNTIME_PKG" "$pkg" "$rt_section")

    if [[ -z "$tv" && -z "$rv" ]]; then
        return
    fi

    if [[ -z "$tv" ]]; then
        echo -e "  ${YELLOW}SKIP${NC} $pkg — not in template ($rt_section: $rv)"
        return
    fi

    if [[ -z "$rv" ]]; then
        echo -e "  ${YELLOW}SKIP${NC} $pkg — not in runtime ($tmpl_section: $tv)"
        return
    fi

    if [[ "$tv" == "$rv" ]]; then
        echo -e "  ${GREEN}OK${NC}   $pkg = $tv"
    else
        echo -e "  ${RED}MISMATCH${NC} $pkg — template: $tv | runtime: $rv"
        ERRORS=$((ERRORS + 1))
    fi
}

run_expo_compat_checks() {
    if [[ ! -f "$TEMPLATE_DIR/package.json" ]]; then
        echo -e "${YELLOW}SKIP${NC} Expo compatibility checks — template project not found at $TEMPLATE_DIR"
        return
    fi

    echo ""
    echo "--- expo compatibility checks (template project) ---"
    echo "Path: $TEMPLATE_DIR"

    if ! (
        local local_errors=0
        cd "$TEMPLATE_DIR"
        if npx expo-doctor; then
            echo -e "  ${GREEN}OK${NC}   npx expo-doctor"
        else
            echo -e "  ${RED}FAIL${NC} npx expo-doctor"
            local_errors=$((local_errors + 1))
        fi

        if CI=1 npx expo install --fix; then
            echo -e "  ${GREEN}OK${NC}   CI=1 npx expo install --fix"
        else
            echo -e "  ${RED}FAIL${NC} CI=1 npx expo install --fix"
            local_errors=$((local_errors + 1))
        fi

        exit "$local_errors"
    ); then
        ERRORS=$((ERRORS + 1))
    fi
}

echo ""
echo "=== WaveMaker RN Version Alignment Check ==="
echo "Template: $TEMPLATE_PKG"
echo "Runtime:  $RUNTIME_PKG"
echo ""

SHARED_DEPS=(
    react react-dom react-native
    expo-application expo-blur expo-clipboard expo-file-system expo-font
    expo-image expo-linear-gradient expo-navigation-bar expo-screen-capture
    expo-secure-store expo-sharing expo-video
    "@expo/vector-icons"
    react-native-reanimated react-native-screens react-native-svg
    react-native-web react-native-webview react-native-circular-progress
    react-native-mime-types
    lottie-react-native react-lottie-player
    "@react-navigation/native" "@react-navigation/drawer"
    "@react-native-async-storage/async-storage"
    "@react-native-community/datetimepicker" "@react-native-community/slider"
    "@react-native-community/netinfo"
    "@react-native-masked-view/masked-view"
    "@react-native/assets-registry"
    imask victory-native
)

echo "--- dependencies (template) vs dependencies (runtime) ---"
for pkg in "${SHARED_DEPS[@]}"; do
    check_match "$pkg" dependencies dependencies
done

SHARED_DEV=(
    react react-dom react-native
    "@babel/core"
    react-native-gesture-handler react-native-safe-area-context
    victory-native
)

echo ""
echo "--- dependencies (template) vs devDependencies (runtime) ---"
for pkg in "${SHARED_DEV[@]}"; do
    check_match "$pkg" dependencies devDependencies
done

run_expo_compat_checks

echo ""
if [[ $ERRORS -gt 0 ]]; then
    echo -e "${RED}Found $ERRORS version mismatch(es).${NC}"
    exit 1
else
    echo -e "${GREEN}All shared versions are aligned.${NC}"
fi
