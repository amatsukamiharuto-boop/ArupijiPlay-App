package com.arupiji.play

import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * Perubahan data game yang disimpan permanen (harga item, stat musuh, posisi event, dan lain-lain).
 * Perubahan dicatat di arupiji_patches.json lalu ditulis ke file di folder data.
 * File asli dicadangkan sekali di data_orig.
 */
object DataPatch {
    private val MAP_RE = Regex("Map\\d+\\.json")

    private fun patchFile(dir: File) = File(dir, "arupiji_patches.json")

    private fun read(dir: File): JSONObject = try {
        val f = patchFile(dir)
        if (f.exists()) JSONObject(f.readText()) else JSONObject()
    } catch (_: Exception) {
        JSONObject()
    }

    private fun ensureBackup(dir: File) {
        val data = File(dir, "data")
        val orig = File(dir, "data_orig")
        if (!orig.exists() && data.exists()) data.copyRecursively(orig)
    }

    private fun sub(o: JSONObject, key: String): JSONObject {
        val e = o.optJSONObject(key)
        if (e != null) return e
        val n = JSONObject()
        o.put(key, n)
        return n
    }

    private fun touchedFiles(patch: JSONObject): Set<String> {
        val files = LinkedHashSet<String>()
        val fields = patch.optJSONObject("fields")
        if (fields != null) {
            val it = fields.keys()
            while (it.hasNext()) files.add(it.next())
        }
        val events = patch.optJSONArray("events")
        if (events != null) {
            for (i in 0 until events.length()) {
                files.add("Map%03d.json".format(events.getJSONObject(i).getInt("map")))
            }
        }
        return files
    }

    /** json: {"kind":"fields","file":"Items.json","id":1,"changes":{...}} atau {"kind":"event","map":3,"id":5,"op":"remove|move","x":1,"y":2} */
    fun add(dir: File, json: String) {
        ensureBackup(dir)
        val patch = read(dir)
        val req = JSONObject(json)
        when (req.getString("kind")) {
            "fields" -> {
                val entry = sub(sub(sub(patch, "fields"), req.getString("file")), req.getInt("id").toString())
                val ch = req.getJSONObject("changes")
                val it = ch.keys()
                while (it.hasNext()) {
                    val k = it.next()
                    entry.put(k, ch.get(k))
                }
            }
            "event" -> {
                val old = patch.optJSONArray("events") ?: JSONArray()
                val out = JSONArray()
                for (i in 0 until old.length()) {
                    val e = old.getJSONObject(i)
                    val same = e.getInt("map") == req.getInt("map") && e.getInt("id") == req.getInt("id")
                    if (!same) out.put(e)
                }
                out.put(req)
                patch.put("events", out)
            }
            else -> throw IllegalArgumentException("Jenis perubahan tidak dikenal")
        }
        patchFile(dir).writeText(patch.toString())
        applyAll(dir)
    }

    private fun setPath(obj: JSONObject, path: String, value: Any) {
        val seg = path.split(".")
        var cur = obj
        for (i in 0 until seg.size - 1) cur = cur.optJSONObject(seg[i]) ?: return
        cur.put(seg.last(), value)
    }

    /** Tulis ulang semua perubahan ke file data. Aman dipanggil berulang. */
    fun applyAll(dir: File): Int {
        val patch = read(dir)
        val dataDir = File(dir, "data")
        val fields = patch.optJSONObject("fields")
        val events = patch.optJSONArray("events")
        var n = 0
        for (name in touchedFiles(patch)) {
            val f = File(dataDir, name)
            if (!f.exists()) continue
            try {
                val text = f.readText().removePrefix("\uFEFF").trimStart()
                val root: Any = if (text.startsWith("[")) JSONArray(text) else JSONObject(text)

                val ch = fields?.optJSONObject(name)
                if (ch != null && root is JSONArray) {
                    val ids = ch.keys()
                    while (ids.hasNext()) {
                        val id = ids.next()
                        val obj = root.optJSONObject(id.toInt()) ?: continue
                        val changes = ch.getJSONObject(id)
                        val ks = changes.keys()
                        while (ks.hasNext()) {
                            val path = ks.next()
                            setPath(obj, path, changes.get(path))
                        }
                    }
                }

                if (events != null && root is JSONObject && MAP_RE.matches(name)) {
                    val arr = root.optJSONArray("events")
                    if (arr != null) {
                        for (i in 0 until events.length()) {
                            val e = events.getJSONObject(i)
                            if ("Map%03d.json".format(e.getInt("map")) != name) continue
                            val id = e.getInt("id")
                            if (e.getString("op") == "remove") {
                                if (id < arr.length()) arr.put(id, JSONObject.NULL)
                            } else {
                                arr.optJSONObject(id)?.put("x", e.getInt("x"))?.put("y", e.getInt("y"))
                            }
                        }
                    }
                }
                f.writeText(root.toString())
                n++
            } catch (_: Exception) {
            }
        }
        return n
    }

    fun count(dir: File): Int {
        val patch = read(dir)
        var c = patch.optJSONArray("events")?.length() ?: 0
        val fields = patch.optJSONObject("fields")
        if (fields != null) {
            val it = fields.keys()
            while (it.hasNext()) c += fields.getJSONObject(it.next()).length()
        }
        return c
    }

    /** Kembalikan file yang pernah diubah ke versi asli dan hapus catatan perubahan. */
    fun reset(dir: File): Int {
        val patch = read(dir)
        var n = 0
        for (name in touchedFiles(patch)) {
            val orig = File(dir, "data_orig/$name")
            if (orig.exists()) {
                orig.copyTo(File(dir, "data/$name"), overwrite = true)
                n++
            }
        }
        patchFile(dir).delete()
        return n
    }

    /** Hapus catatan saja (dipakai saat Studio mengembalikan semua file ke asli). */
    fun clear(dir: File) {
        patchFile(dir).delete()
    }
}
