#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIGURATION="${1:-release}"

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
PRODUCT_NAME="${PRODUCT_NAME:-Aikarivi}"
DISPLAY_NAME="$(read_setting APP_DISPLAY_NAME)"
DISPLAY_NAME="${DISPLAY_NAME:-$PRODUCT_NAME}"
BUNDLE_IDENTIFIER="$(read_setting APP_PRODUCT_BUNDLE_IDENTIFIER)"
BUNDLE_IDENTIFIER="${BUNDLE_IDENTIFIER:-com.example.aikarivi}"
COPYRIGHT="$(read_setting APP_PRODUCT_COPYRIGHT)"
CODE_SIGN_IDENTITY="$(read_setting APP_CODE_SIGN_IDENTITY)"
MARKETING_VERSION="$(read_setting MARKETING_VERSION)"
MARKETING_VERSION="${MARKETING_VERSION:-1.0}"
BUILD_NUMBER="$(read_setting CURRENT_PROJECT_VERSION)"
BUILD_NUMBER="${BUILD_NUMBER:-1}"

case "$CONFIGURATION" in
    debug|Debug) XCODE_CONFIGURATION="Debug" ;;
    release|Release) XCODE_CONFIGURATION="Release" ;;
    *) echo "Unsupported configuration: $CONFIGURATION" >&2; exit 1 ;;
esac

# Build the Xcode target, not a bare SwiftPM executable. Xcode owns the
# macOS SDK linkage and asset-catalog compilation; both are required for the
# native Liquid Glass toolbar and the AppIcon.icns inside the final bundle.
DERIVED_DATA_DIR="$ROOT_DIR/.build/xcode"
xcodebuild \
    -project "$ROOT_DIR/Aikarivi.xcodeproj" \
    -scheme "$PRODUCT_NAME" \
    -configuration "$XCODE_CONFIGURATION" \
    -derivedDataPath "$DERIVED_DATA_DIR" \
    CODE_SIGNING_ALLOWED=NO \
    build

SOURCE_APP="$DERIVED_DATA_DIR/Build/Products/$XCODE_CONFIGURATION/$PRODUCT_NAME.app"
if [[ ! -d "$SOURCE_APP" ]]; then
    echo "Could not find built app bundle for $PRODUCT_NAME" >&2
    exit 1
fi

APP_DIR="$ROOT_DIR/dist/$PRODUCT_NAME.app"
INFO_PLIST="$APP_DIR/Contents/Info.plist"

mkdir -p "$ROOT_DIR/dist"
rm -rf "$APP_DIR"
cp -R "$SOURCE_APP" "$APP_DIR"

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
