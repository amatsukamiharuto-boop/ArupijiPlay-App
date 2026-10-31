#!/usr/bin/env bash
# Membuat folder android/ lewat flutter create, lalu menimpa dengan kode native
# milik ArupijiPlay yang ada di android_overlay/.
set -euo pipefail

if [ ! -d android ]; then
  flutter create --platforms=android --org com.arupiji --project-name arupiji_play .
fi

APP=android/app
if [ -f "$APP/build.gradle.kts" ]; then
  GRADLE="$APP/build.gradle.kts"
elif [ -f "$APP/build.gradle" ]; then
  GRADLE="$APP/build.gradle"
else
  echo "File build.gradle tidak ditemukan di $APP" >&2
  exit 1
fi
echo "Patch gradle: $GRADLE"

sed -i -E 's/minSdk(Version)?[ =]+flutter\.minSdkVersion/minSdk = 26/' "$GRADLE"
sed -i -E 's/namespace[ =]+"[^"]*"/namespace = "com.arupiji.play"/' "$GRADLE"
sed -i -E 's/applicationId[ =]+"[^"]*"/applicationId = "com.arupiji.play"/' "$GRADLE"

rm -rf "$APP/src/main/kotlin" "$APP/src/main/java"
cp -r android_overlay/app/src/main/. "$APP/src/main/"
cp android_overlay/app/proguard-rules.pro "$APP/proguard-rules.pro"

# Pastikan aturan keep dipakai walaupun R8 aktif
if ! grep -q "arupiji-proguard" "$GRADLE"; then
  case "$GRADLE" in
    *.kts)
      cat >> "$GRADLE" <<'KTS'

// arupiji-proguard
android {
    buildTypes {
        release {
            proguardFiles("proguard-rules.pro")
        }
    }
}
KTS
      ;;
    *)
      cat >> "$GRADLE" <<'GROOVY'

// arupiji-proguard
android {
    buildTypes {
        release {
            proguardFiles 'proguard-rules.pro'
        }
    }
}
GROOVY
      ;;
  esac
fi
rm -rf test

grep -n "minSdk\|namespace\|applicationId" "$GRADLE" || true
if ! grep -q "minSdk = 26" "$GRADLE"; then
  echo "PERINGATAN: minSdk belum terpasang 26, cek isi $GRADLE" >&2
fi
echo "Selesai."
