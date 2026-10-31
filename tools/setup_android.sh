#!/usr/bin/env bash
# Membuat folder android/ lewat flutter create, lalu menimpa dengan kode native
# milik ArupijiPlay yang ada di android_overlay/.
set -euo pipefail

if [ ! -d android ]; then
  flutter create --platforms=android --org com.arupiji --project-name arupiji_play .
fi

APP=android/app

# Perbaikan: ls tidak boleh gagal kalau salah satu file tidak ada
if [ -f "$APP/build.gradle.kts" ]; then
  GRADLE="$APP/build.gradle.kts"
elif [ -f "$APP/build.gradle" ]; then
  GRADLE="$APP/build.gradle"
else
  echo "Error: tidak menemukan build.gradle(.kts)" >&2
  exit 1
fi

echo "Patch gradle: $GRADLE"

sed -i -E 's/minSdk(Version)?[ =]+flutter\.minSdkVersion/minSdk = 26/' "$GRADLE"
sed -i -E 's/namespace[ =]+"[^"]*"/namespace = "com.arupiji.play"/' "$GRADLE"
sed -i -E 's/applicationId[ =]+"[^"]*"/applicationId = "com.arupiji.play"/' "$GRADLE"

rm -rf "$APP/src/main/kotlin" "$APP/src/main/java"
cp -r android_overlay/app/src/main/. "$APP/src/main/"
rm -rf test

grep -n "minSdk\|namespace\|applicationId" "$GRADLE" || true
echo "Selesai."