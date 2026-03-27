#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "Scanning for legacy asset aliases..."

grep -RIl --exclude-dir=.git --exclude='*.png' --exclude='*.jpg' --exclude='*.jpeg' --exclude='*.webp' \
  -e 'assets/BAJA_1000/' \
  -e 'assets/BAJA_500/' \
  -e 'assets/BAJA_400/' \
  -e 'assets/SF_250/' \
  -e 'assets/BAJA1000/' \
  -e 'assets/BAJA500/' \
  -e 'assets/BAJA400/' \
  -e 'assets/SF250/' \
  -e 'assets/OTRAS_EDICIONES/' \
  . | while read -r file; do
    sed -i \
      -e 's|assets/BAJA_1000/|assets/edicion_2025/|g' \
      -e 's|assets/BAJA_500/|assets/baja500/|g' \
      -e 's|assets/BAJA_400/|assets/baja400/|g' \
      -e 's|assets/SF_250/|assets/sf250/|g' \
      -e 's|assets/BAJA1000/|assets/edicion_2025/|g' \
      -e 's|assets/BAJA500/|assets/baja500/|g' \
      -e 's|assets/BAJA400/|assets/baja400/|g' \
      -e 's|assets/SF250/|assets/sf250/|g' \
      -e 's|assets/OTRAS_EDICIONES/|assets/otras_ediciones/|g' \
      "$file"
    echo "Updated: $file"
  done

echo "Alias normalization completed."