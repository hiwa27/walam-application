#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "Resolving Flutter dependencies..."
flutter pub get

echo "Building iOS app (no code signing)..."
flutter build ios --release --no-codesign

APP_PATH="$ROOT_DIR/build/ios/iphoneos/Runner.app"
OUT_DIR="$ROOT_DIR/build/ios/unsigned"
PAYLOAD_DIR="$OUT_DIR/Payload"
IPA_PATH="$OUT_DIR/walam_app_unsigned.ipa"

if [[ ! -d "$APP_PATH" ]]; then
  echo "Runner.app was not found at: $APP_PATH"
  exit 1
fi

rm -rf "$OUT_DIR"
mkdir -p "$PAYLOAD_DIR"
cp -R "$APP_PATH" "$PAYLOAD_DIR/"

echo "Packaging unsigned IPA..."
(
  cd "$OUT_DIR"
  zip -qry "$(basename "$IPA_PATH")" Payload
)

echo "Done."
echo "Unsigned IPA: $IPA_PATH"
