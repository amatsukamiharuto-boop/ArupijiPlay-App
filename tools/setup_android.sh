#!/usr/bin/env bash
# Membuat folder android/ lewat flutter create, lalu menimpa dengan kode native
# milik ArupijiPlay yang ada di android_overlay/.
set -euo pipefail

if [ ! -d android ]; then
  flutter create --platforms=android --org com.arupiji --project-name arupiji_play .
fi

APP=android/app
GRADLE=$(ls "$APP/build.gradle.kts" "$APP/build.gradle" 2>/dev/null | head -n1)
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
echo "Selesai."
