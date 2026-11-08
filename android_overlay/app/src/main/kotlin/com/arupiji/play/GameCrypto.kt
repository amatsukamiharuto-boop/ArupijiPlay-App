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

    private fun readFully(input: java.io.InputStream, buf: ByteArray): Int {
        var n = 0
        while (n < buf.size) {
            val r = input.read(buf, n, buf.size - n)
            if (r < 0) break
            n += r
        }
        return n
    }

    /** Streaming: tidak memuat seluruh file ke memori. */
    private fun decryptFile(src: File, dst: File, key: ByteArray): Boolean {
        src.inputStream().buffered(256 * 1024).use { input ->
            val header = ByteArray(16)
            if (readFully(input, header) < 16) return false
            val first = ByteArray(16)
            val n = readFully(input, first)
            for (i in 0 until n) first[i] = (first[i].toInt() xor key[i].toInt()).toByte()
            dst.outputStream().buffered(256 * 1024).use { out ->
                out.write(first, 0, n)
                input.copyTo(out, 256 * 1024)
            }
        }
        return true
    }

    /** Dekripsi satu file ke tempat lain tanpa mengubah folder game (dipakai untuk cover). */
    fun decryptToFile(gameDir: File, src: File, dst: File): Boolean {
        return try {
            val sys = JSONObject(File(gameDir, "data/System.json").readText().removePrefix("\uFEFF"))
            val key = keyOf(sys.optString("encryptionKey", "")) ?: return false
            dst.parentFile?.mkdirs()
            decryptFile(src, dst, key)
        } catch (_: Exception) {
            false
        }
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
