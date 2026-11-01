package com.arupiji.play

import org.json.JSONObject
import java.io.File

/**
 * Dekripsi aset RPG Maker MV/MZ (gambar dan audio) supaya gambar bisa dibaca app
 * dan game tidak lagi butuh dekripsi di dalam WebView.
 */
object GameCrypto {
    private val EXT_MAP = mapOf(
        "rpgmvp" to "png", "png_" to "png",
        "rpgmvo" to "ogg", "ogg_" to "ogg",
        "rpgmvm" to "m4a", "m4a_" to "m4a"
    )

    private fun keyOf(hex: String): ByteArray? {
        val h = hex.trim()
        if (h.length < 32) return null
        return try {
            ByteArray(16) { i -> h.substring(i * 2, i * 2 + 2).toInt(16).toByte() }
        } catch (_: Exception) {
            null
        }
    }

    private fun decryptFile(src: File, dst: File, key: ByteArray): Boolean {
        val bytes = src.readBytes()
        if (bytes.size <= 16) return false
        val out = bytes.copyOfRange(16, bytes.size)
        val n = minOf(16, out.size)
        for (i in 0 until n) out[i] = (out[i].toInt() xor key[i].toInt()).toByte()
        dst.writeBytes(out)
        return true
    }

    /** Balikin jumlah file yang didekripsi. Aman dipanggil berulang. */
    fun decryptAll(gameDir: File, progress: ((String) -> Unit)? = null): Int {
        val sysFile = File(gameDir, "data/System.json")
        if (!sysFile.exists()) return 0
        val sys = try {
            JSONObject(sysFile.readText().removePrefix("\uFEFF"))
        } catch (_: Exception) {
            return 0
        }
        val key = keyOf(sys.optString("encryptionKey", "")) ?: return 0

        var count = 0
        for (sub in listOf("img", "audio")) {
            val files = File(gameDir, sub).walkTopDown().filter { it.isFile }.toList()
            for (f in files) {
                val target = EXT_MAP[f.extension.lowercase()] ?: continue
                val dst = File(f.parentFile, f.nameWithoutExtension + "." + target)
                if (decryptFile(f, dst, key)) {
                    f.delete()
                    count++
                    if (count % 40 == 0) progress?.invoke("Mendekripsi file: $count")
                }
            }
        }

        if (sys.optBoolean("hasEncryptedImages") || sys.optBoolean("hasEncryptedAudio")) {
            sys.put("hasEncryptedImages", false)
            sys.put("hasEncryptedAudio", false)
            sysFile.writeText(sys.toString())
        }
        return count
    }
}
