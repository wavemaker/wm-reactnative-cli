#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI_DIR="$(dirname "$SCRIPT_DIR")"
CLI_BIN="node ${CLI_DIR}/index.js"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

print_header() {
    echo ""
    echo -e "${BOLD}${BLUE}╔══════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}${BLUE}║       WaveMaker React Native CLI             ║${NC}"
    echo -e "${BOLD}${BLUE}╚══════════════════════════════════════════════╝${NC}"
    echo ""
}

print_usage() {
    print_header
    echo -e "${BOLD}Usage:${NC} $0 <command> [options]"
    echo ""
    echo -e "${BOLD}Commands:${NC}"
    echo ""
    echo -e "  ${GREEN}web-preview${NC}    Run web preview (esbuild + expo web)"
    echo -e "  ${GREEN}sync${NC}           Run sync for Expo Go (Android & iOS)"
    echo -e "  ${GREEN}build${NC}          Run debug builds (Android APK / iOS IPA)"
    echo ""
    echo -e "${BOLD}Examples:${NC}"
    echo ""
    echo -e "  ${CYAN}$0 web-preview <previewUrl>${NC}"
    echo -e "  ${CYAN}$0 web-preview <previewUrl> --esbuild${NC}"
    echo -e "  ${CYAN}$0 sync <previewUrl>${NC}"
    echo -e "  ${CYAN}$0 sync <previewUrl> --clean --useProxy${NC}"
    echo -e "  ${CYAN}$0 build android <src>${NC}"
    echo -e "  ${CYAN}$0 build ios <src>${NC}"
    echo ""
    echo -e "Run ${YELLOW}$0 <command> --help${NC} for command-specific options."
}

# ─── Web Preview (esbuild / expo web) ────────────────────────────────────────

cmd_web_preview() {
    local preview_url=""
    local esbuild=false
    local clean=false
    local verbose=true
    local interactive=false
    local proxy_host=""
    local base_path="/rn-bundle/"

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --esbuild)    esbuild=true; shift ;;
            --clean)      clean=true; shift ;;
            --verbose)    verbose=true; shift ;;
            -i|--interactive) interactive=true; shift ;;
            --proxyHost)  proxy_host="$2"; shift 2 ;;
            --basePath)   base_path="$2"; shift 2 ;;
            --help|-h)
                echo -e "${BOLD}web-preview${NC} — Launch the app in a web browser via esbuild or expo web"
                echo ""
                echo -e "${BOLD}Usage:${NC} $0 web-preview <previewUrl> [options]"
                echo ""
                echo -e "  ${YELLOW}<previewUrl>${NC}       WaveMaker preview URL of the app"
                echo -e "  ${YELLOW}--esbuild${NC}          Use esbuild-based web preview (faster)"
                echo -e "  ${YELLOW}--clean${NC}            Remove existing folders before starting"
                echo -e "  ${YELLOW}--verbose${NC}          Show detailed logs"
                echo -e "  ${YELLOW}-i, --interactive${NC}  Show progress bar"
                echo -e "  ${YELLOW}--proxyHost <host>${NC} Custom proxy host (default: IP address)"
                echo -e "  ${YELLOW}--basePath <path>${NC}  Base path for web preview (default: /rn-bundle/)"
                return 0
                ;;
            -*)
                echo -e "${RED}Unknown option: $1${NC}"; return 1 ;;
            *)
                if [[ -z "$preview_url" ]]; then
                    preview_url="$1"
                fi
                shift
                ;;
        esac
    done

    if [[ -z "$preview_url" ]]; then
        echo -e "${RED}Error: previewUrl is required${NC}"
        echo -e "Usage: $0 web-preview <previewUrl> [--esbuild] [--clean]"
        return 1
    fi

    echo -e "${GREEN}▶ Starting web preview...${NC}"
    echo -e "  Preview URL: ${CYAN}${preview_url}${NC}"
    echo -e "  Mode:        ${CYAN}$([ "$esbuild" = true ] && echo "esbuild" || echo "expo web")${NC}"

    local args=("run" "web-preview" "$preview_url")
    [[ "$clean" = true ]]       && args+=("--clean")
    [[ "$verbose" = true ]]     && args+=("--verbose")
    [[ "$interactive" = true ]] && args+=("-i")
    [[ -n "$proxy_host" ]]      && args+=("--proxyHost" "$proxy_host")
    args+=("--basePath" "$base_path")

    $CLI_BIN "${args[@]}"
}

# ─── Sync (Expo Go — Android & iOS) ─────────────────────────────────────────

cmd_sync() {
    local preview_url=""
    local clean=false
    local use_proxy=false
    local verbose=true
    local interactive=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --clean)      clean=true; shift ;;
            --useProxy)   use_proxy=true; shift ;;
            --verbose)    verbose=true; shift ;;
            -i|--interactive) interactive=true; shift ;;
            --help|-h)
                echo -e "${BOLD}sync${NC} — Sync project for Expo Go on Android & iOS devices"
                echo ""
                echo -e "${BOLD}Usage:${NC} $0 sync <previewUrl> [options]"
                echo ""
                echo -e "  ${YELLOW}<previewUrl>${NC}       WaveMaker preview URL of the app"
                echo -e "  ${YELLOW}--clean${NC}            Remove existing folders before syncing"
                echo -e "  ${YELLOW}--useProxy${NC}         Route preview requests through internal proxy"
                echo -e "  ${YELLOW}--verbose${NC}          Show detailed logs"
                echo -e "  ${YELLOW}-i, --interactive${NC}  Show progress bar"
                return 0
                ;;
            -*)
                echo -e "${RED}Unknown option: $1${NC}"; return 1 ;;
            *)
                if [[ -z "$preview_url" ]]; then
                    preview_url="$1"
                fi
                shift
                ;;
        esac
    done

    if [[ -z "$preview_url" ]]; then
        echo -e "${RED}Error: previewUrl is required${NC}"
        echo -e "Usage: $0 sync <previewUrl> [--clean] [--useProxy]"
        return 1
    fi

    echo -e "${GREEN}▶ Starting sync for Expo Go...${NC}"
    echo -e "  Preview URL: ${CYAN}${preview_url}${NC}"
    echo -e "  Proxy:       ${CYAN}$([ "$use_proxy" = true ] && echo "enabled" || echo "disabled")${NC}"

    local args=("sync" "$preview_url")
    [[ "$clean" = true ]]       && args+=("--clean")
    [[ "$use_proxy" = true ]]   && args+=("--useProxy")
    [[ "$verbose" = true ]]     && args+=("--verbose")
    [[ "$interactive" = true ]] && args+=("-i")

    $CLI_BIN "${args[@]}"
}

# ─── Debug Builds (Android APK / iOS IPA) ───────────────────────────────────

cmd_build() {
    local platform=""
    local src="./"
    local dest=""
    local build_type="debug"
    local auto_eject=false
    local verbose=true
    local interactive=false
    local keystore="" store_pass="" key_alias="" key_pass=""
    local package_type="apk"
    local architectures=()
    local certificate="" cert_pass="" provisioning=""

    if [[ $# -lt 1 ]]; then
        echo -e "${BOLD}build${NC} — Generate debug builds for Android (APK) or iOS (IPA)"
        echo ""
        echo -e "${BOLD}Usage:${NC} $0 build <android|ios> [src] [options]"
        echo ""
        echo -e "${BOLD}Platforms:${NC}"
        echo -e "  ${GREEN}android${NC}  Build an Android APK/AAB"
        echo -e "  ${GREEN}ios${NC}      Build an iOS IPA"
        echo ""
        echo -e "Run ${YELLOW}$0 build <platform> --help${NC} for platform-specific options."
        return 0
    fi

    platform="$1"; shift

    case "$platform" in
        android)
            while [[ $# -gt 0 ]]; do
                case "$1" in
                    --aks|--aKeyStore)        keystore="$2"; shift 2 ;;
                    --asp|--aStorePassword)   store_pass="$2"; shift 2 ;;
                    --aka|--aKeyAlias)        key_alias="$2"; shift 2 ;;
                    --akp|--aKeyPassword)     key_pass="$2"; shift 2 ;;
                    -p|--packageType)         package_type="$2"; shift 2 ;;
                    --arch|--architecture)
                        shift
                        while [[ $# -gt 0 && ! "$1" =~ ^-- ]]; do
                            architectures+=("$1"); shift
                        done
                        ;;
                    --dest)         dest="$2"; shift 2 ;;
                    --bt|--buildType) build_type="$2"; shift 2 ;;
                    --auto-eject)   auto_eject=true; shift ;;
                    --verbose)      verbose=true; shift ;;
                    -i|--interactive) interactive=true; shift ;;
                    --help|-h)
                        echo -e "${BOLD}build android${NC} — Build Android APK or AAB"
                        echo ""
                        echo -e "${BOLD}Usage:${NC} $0 build android [src] [options]"
                        echo ""
                        echo -e "  ${YELLOW}[src]${NC}                        Path to RN project (default: ./)"
                        echo -e "  ${YELLOW}--dest <path>${NC}               Destination folder for extracted project"
                        echo -e "  ${YELLOW}--bt, --buildType <type>${NC}    debug | release (default: debug)"
                        echo -e "  ${YELLOW}-p, --packageType <type>${NC}    apk | bundle (default: apk)"
                        echo -e "  ${YELLOW}--aks <path>${NC}               Path to keystore"
                        echo -e "  ${YELLOW}--asp <password>${NC}           Keystore password"
                        echo -e "  ${YELLOW}--aka <alias>${NC}             Key alias"
                        echo -e "  ${YELLOW}--akp <password>${NC}           Key password"
                        echo -e "  ${YELLOW}--arch <arch...>${NC}           Target architectures (armeabi-v7a, arm64-v8a, x86, x86_64)"
                        echo -e "  ${YELLOW}--auto-eject${NC}              Skip eject confirmation prompt"
                        echo -e "  ${YELLOW}--verbose${NC}                 Show detailed logs"
                        echo -e "  ${YELLOW}-i, --interactive${NC}         Show progress bar"
                        return 0
                        ;;
                    -*)
                        echo -e "${RED}Unknown option: $1${NC}"; return 1 ;;
                    *)  src="$1"; shift ;;
                esac
            done

            echo -e "${GREEN}▶ Starting Android build...${NC}"
            echo -e "  Source:       ${CYAN}${src}${NC}"
            echo -e "  Build type:  ${CYAN}${build_type}${NC}"
            echo -e "  Package:     ${CYAN}${package_type}${NC}"

            local args=("build" "android" "$src" "--bt" "$build_type" "-p" "$package_type")
            [[ -n "$dest" ]]          && args+=("--dest" "$dest")
            [[ -n "$keystore" ]]      && args+=("--aks" "$keystore")
            [[ -n "$store_pass" ]]    && args+=("--asp" "$store_pass")
            [[ -n "$key_alias" ]]     && args+=("--aka" "$key_alias")
            [[ -n "$key_pass" ]]      && args+=("--akp" "$key_pass")
            [[ "$auto_eject" = true ]] && args+=("--auto-eject")
            [[ "$verbose" = true ]]   && args+=("--verbose")
            [[ "$interactive" = true ]] && args+=("-i")
            if [[ ${#architectures[@]} -gt 0 ]]; then
                args+=("--architecture" "${architectures[@]}")
            fi

            $CLI_BIN "${args[@]}"
            ;;

        ios)
            while [[ $# -gt 0 ]]; do
                case "$1" in
                    --ic|--iCertificate)          certificate="$2"; shift 2 ;;
                    --icp|--iCertificatePassword) cert_pass="$2"; shift 2 ;;
                    --ipf|--iProvisioningFile)    provisioning="$2"; shift 2 ;;
                    --dest)         dest="$2"; shift 2 ;;
                    --bt|--buildType) build_type="$2"; shift 2 ;;
                    --auto-eject)   auto_eject=true; shift ;;
                    --verbose)      verbose=true; shift ;;
                    -i|--interactive) interactive=true; shift ;;
                    --help|-h)
                        echo -e "${BOLD}build ios${NC} — Build iOS IPA"
                        echo ""
                        echo -e "${BOLD}Usage:${NC} $0 build ios [src] [options]"
                        echo ""
                        echo -e "  ${YELLOW}[src]${NC}                         Path to RN project (default: ./)"
                        echo -e "  ${YELLOW}--dest <path>${NC}                Destination folder for extracted project"
                        echo -e "  ${YELLOW}--bt, --buildType <type>${NC}     debug | release (default: debug)"
                        echo -e "  ${YELLOW}--ic <path>${NC}                  Path to p12 certificate"
                        echo -e "  ${YELLOW}--icp <password>${NC}             Certificate password"
                        echo -e "  ${YELLOW}--ipf <path>${NC}                 Path to provisioning profile"
                        echo -e "  ${YELLOW}--auto-eject${NC}                 Skip eject confirmation prompt"
                        echo -e "  ${YELLOW}--verbose${NC}                    Show detailed logs"
                        echo -e "  ${YELLOW}-i, --interactive${NC}            Show progress bar"
                        return 0
                        ;;
                    -*)
                        echo -e "${RED}Unknown option: $1${NC}"; return 1 ;;
                    *)  src="$1"; shift ;;
                esac
            done

            echo -e "${GREEN}▶ Starting iOS build...${NC}"
            echo -e "  Source:       ${CYAN}${src}${NC}"
            echo -e "  Build type:  ${CYAN}${build_type}${NC}"

            local args=("build" "ios" "$src" "--bt" "$build_type")
            [[ -n "$dest" ]]           && args+=("--dest" "$dest")
            [[ -n "$certificate" ]]    && args+=("--ic" "$certificate")
            [[ -n "$cert_pass" ]]      && args+=("--icp" "$cert_pass")
            [[ -n "$provisioning" ]]   && args+=("--ipf" "$provisioning")
            [[ "$auto_eject" = true ]] && args+=("--auto-eject")
            [[ "$verbose" = true ]]    && args+=("--verbose")
            [[ "$interactive" = true ]] && args+=("-i")

            $CLI_BIN "${args[@]}"
            ;;

        *)
            echo -e "${RED}Unknown platform: ${platform}${NC}"
            echo -e "Supported platforms: ${GREEN}android${NC}, ${GREEN}ios${NC}"
            return 1
            ;;
    esac
}

# ─── Main Dispatch ───────────────────────────────────────────────────────────

main() {
    if [[ $# -lt 1 ]]; then
        print_usage
        exit 0
    fi

    local command="$1"; shift

    case "$command" in
        web-preview)  cmd_web_preview "$@" ;;
        sync)         cmd_sync "$@" ;;
        build)        cmd_build "$@" ;;
        -h|--help|help) print_usage ;;
        *)
            echo -e "${RED}Unknown command: ${command}${NC}"
            print_usage
            exit 1
            ;;
    esac
}

main "$@"
