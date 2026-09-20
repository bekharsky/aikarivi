#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIGURATION="${1:-release}"
INFO_TEMPLATE="$ROOT_DIR/Packaging/Info.plist"

CONFIG_FILES=("$ROOT_DIR/AppInfo.xcconfig")
if [[ -f "$ROOT_DIR/Local.xcconfig" ]]; then
    CONFIG_FILES+=("$ROOT_DIR/Local.xcconfig")
fi

read_setting() {
    local key="$1"
    awk -v key="$key" '
        /^[[:space:]]*($|#|\/\/)/ { next }
        {
            line = $0
            sub(/[[:space:]]*\/\/.*$/, "", line)
            if (line ~ "^[[:space:]]*" key "[[:space:]]*=") {
                sub("^[^=]*=", "", line)
                sub("^[[:space:]]*", "", line)
                sub("[[:space:]]*$", "", line)
                value = line
            }
        }
        END { print value }
    ' "${CONFIG_FILES[@]}"
}

PRODUCT_NAME="$(read_setting PRODUCT_NAME)"
PRODUCT_NAME="${PRODUCT_NAME:-Tickline}"
DISPLAY_NAME="$(read_setting APP_DISPLAY_NAME)"
DISPLAY_NAME="${DISPLAY_NAME:-$PRODUCT_NAME}"
BUNDLE_IDENTIFIER="$(read_setting APP_PRODUCT_BUNDLE_IDENTIFIER)"
BUNDLE_IDENTIFIER="${BUNDLE_IDENTIFIER:-com.example.tickline}"
COPYRIGHT="$(read_setting APP_PRODUCT_COPYRIGHT)"
CODE_SIGN_IDENTITY="$(read_setting APP_CODE_SIGN_IDENTITY)"
MARKETING_VERSION="$(read_setting MARKETING_VERSION)"
MARKETING_VERSION="${MARKETING_VERSION:-1.0}"
BUILD_NUMBER="$(read_setting CURRENT_PROJECT_VERSION)"
BUILD_NUMBER="${BUILD_NUMBER:-1}"

swift build -c "$CONFIGURATION" --product "$PRODUCT_NAME"

BINARY_DIR="$(swift build --show-bin-path -c "$CONFIGURATION" --product "$PRODUCT_NAME")"
BINARY_PATH="$BINARY_DIR/$PRODUCT_NAME"

if [[ ! -f "$BINARY_PATH" ]]; then
    echo "Could not find built executable for $PRODUCT_NAME" >&2
    exit 1
fi

APP_DIR="$ROOT_DIR/dist/$PRODUCT_NAME.app"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
INFO_PLIST="$CONTENTS_DIR/Info.plist"

rm -rf "$APP_DIR"
mkdir -p "$MACOS_DIR" "$RESOURCES_DIR"
cp "$BINARY_PATH" "$MACOS_DIR/$PRODUCT_NAME"
cp "$INFO_TEMPLATE" "$INFO_PLIST"

/usr/libexec/PlistBuddy -c "Set :CFBundleExecutable $PRODUCT_NAME" "$INFO_PLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleName $DISPLAY_NAME" "$INFO_PLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName $DISPLAY_NAME" "$INFO_PLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier $BUNDLE_IDENTIFIER" "$INFO_PLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $MARKETING_VERSION" "$INFO_PLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $BUILD_NUMBER" "$INFO_PLIST"

if [[ -n "$COPYRIGHT" ]]; then
    /usr/libexec/PlistBuddy -c "Set :NSHumanReadableCopyright $COPYRIGHT" "$INFO_PLIST" 2>/dev/null \
        || /usr/libexec/PlistBuddy -c "Add :NSHumanReadableCopyright string $COPYRIGHT" "$INFO_PLIST"
fi

if [[ -n "$CODE_SIGN_IDENTITY" ]]; then
    /usr/bin/codesign --force --deep --sign "$CODE_SIGN_IDENTITY" "$APP_DIR"
else
    /usr/bin/codesign --force --deep --sign - "$APP_DIR"
fi

echo "Built $APP_DIR"
echo "Bundle identifier: $BUNDLE_IDENTIFIER"
