# Kode ArupijiPlay tidak boleh diubah namanya, terutama method JavascriptInterface
-keepattributes JavascriptInterface,*Annotation*,Signature,InnerClasses,EnclosingMethod
-keep class com.arupiji.play.** { *; }
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
