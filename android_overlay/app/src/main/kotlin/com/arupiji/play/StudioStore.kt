package com.arupiji.play

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

class StudioStore private constructor(ctx: Context) : SQLiteOpenHelper(ctx, "studio.db", null, 1) {

    data class Row(
        val id: Long,
        val file: String,
        val locator: String,
        val kind: String,
        val original: String,
        val translated: String,
        val edited: Boolean,
        val extra: String
    )

    data class Region(
        val id: Long,
        val file: String,
        val x: Int, val y: Int, val w: Int, val h: Int,
        val original: String,
        val translated: String,
        val edited: Boolean,
        val bg: Int,
        val fg: Int
    )

    companion object {
        @Volatile private var inst: StudioStore? = null
        fun get(ctx: Context): StudioStore =
            inst ?: synchronized(this) { inst ?: StudioStore(ctx.applicationContext).also { inst = it } }
    }

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            "CREATE TABLE strings(id INTEGER PRIMARY KEY AUTOINCREMENT, game_id TEXT NOT NULL, file TEXT NOT NULL, " +
                "locator TEXT NOT NULL, kind TEXT NOT NULL, original TEXT NOT NULL, translated TEXT NOT NULL DEFAULT '', " +
                "edited INTEGER NOT NULL DEFAULT 0, extra TEXT NOT NULL DEFAULT '')"
        )
        db.execSQL("CREATE INDEX idx_strings ON strings(game_id, kind)")
        db.execSQL(
            "CREATE TABLE images(id INTEGER PRIMARY KEY AUTOINCREMENT, game_id TEXT NOT NULL, file TEXT NOT NULL, " +
                "x INTEGER, y INTEGER, w INTEGER, h INTEGER, original TEXT NOT NULL, " +
                "translated TEXT NOT NULL DEFAULT '', edited INTEGER NOT NULL DEFAULT 0, " +
                "bg INTEGER NOT NULL DEFAULT 0, fg INTEGER NOT NULL DEFAULT 0)"
        )
        db.execSQL("CREATE INDEX idx_images ON images(game_id, file)")
    }

    override fun onUpgrade(db: SQLiteDatabase, o: Int, n: Int) {}

    private inline fun tx(block: (SQLiteDatabase) -> Unit) {
        val db = writableDatabase
        db.beginTransaction()
        try {
            block(db)
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    private fun rowOf(c: android.database.Cursor) = Row(
        c.getLong(0), c.getString(1), c.getString(2), c.getString(3),
        c.getString(4), c.getString(5), c.getInt(6) == 1, c.getString(7)
    )

    private val ROW_COLS = "id, file, locator, kind, original, translated, edited, extra"

    /** Terjemahan lama, dipakai supaya ekstrak ulang tidak menghapus hasil kerja. */
    fun existing(gameId: String): Map<String, Pair<String, Boolean>> {
        val m = HashMap<String, Pair<String, Boolean>>()
        readableDatabase.rawQuery(
            "SELECT $ROW_COLS FROM strings WHERE game_id = ? AND translated <> ''", arrayOf(gameId)
        ).use { c ->
            while (c.moveToNext()) {
                val r = rowOf(c)
                m[r.file + "|" + r.locator + "|" + r.original] = Pair(r.translated, r.edited)
            }
        }
        return m
    }

    fun replaceStrings(gameId: String, rows: List<Row>) = tx { db ->
        db.delete("strings", "game_id = ?", arrayOf(gameId))
        val v = ContentValues()
        for (r in rows) {
            v.clear()
            v.put("game_id", gameId); v.put("file", r.file); v.put("locator", r.locator)
            v.put("kind", r.kind); v.put("original", r.original); v.put("translated", r.translated)
            v.put("edited", if (r.edited) 1 else 0); v.put("extra", r.extra)
            db.insert("strings", null, v)
        }
    }

    private fun inClause(kinds: List<String>) = kinds.joinToString(",") { "'" + it.replace("'", "") + "'" }

    fun list(gameId: String, kinds: List<String>, query: String, offset: Int, limit: Int): List<Map<String, Any?>> {
        val args = ArrayList<String>()
        args.add(gameId)
        var sql = "SELECT $ROW_COLS FROM strings WHERE game_id = ? AND kind IN (${inClause(kinds)})"
        if (query.isNotBlank()) {
            sql += " AND (original LIKE ? OR translated LIKE ?)"
            args.add("%$query%"); args.add("%$query%")
        }
        sql += " ORDER BY id LIMIT $limit OFFSET $offset"
        val out = ArrayList<Map<String, Any?>>()
        readableDatabase.rawQuery(sql, args.toTypedArray()).use { c ->
            while (c.moveToNext()) {
                val r = rowOf(c)
                out.add(
                    mapOf(
                        "id" to r.id, "file" to r.file, "kind" to r.kind, "original" to r.original,
                        "translated" to r.translated, "edited" to r.edited
                    )
                )
            }
        }
        return out
    }

    /** kind -> [total, sudah diterjemahkan] */
    fun counts(gameId: String): Map<String, List<Int>> {
        val m = HashMap<String, List<Int>>()
        readableDatabase.rawQuery(
            "SELECT kind, COUNT(*), SUM(CASE WHEN translated <> '' THEN 1 ELSE 0 END) FROM strings " +
                "WHERE game_id = ? GROUP BY kind", arrayOf(gameId)
        ).use { c ->
            while (c.moveToNext()) m[c.getString(0)] = listOf(c.getInt(1), c.getInt(2))
        }
        return m
    }

    fun pending(gameId: String, kinds: List<String>, force: Boolean): List<Row> {
        val cond = if (force) "edited = 0" else "edited = 0 AND translated = ''"
        val out = ArrayList<Row>()
        readableDatabase.rawQuery(
            "SELECT $ROW_COLS FROM strings WHERE game_id = ? AND kind IN (${inClause(kinds)}) AND $cond ORDER BY id",
            arrayOf(gameId)
        ).use { c -> while (c.moveToNext()) out.add(rowOf(c)) }
        return out
    }

    fun setTranslated(id: Long, text: String, edited: Boolean) {
        val v = ContentValues()
        v.put("translated", text)
        v.put("edited", if (edited) 1 else 0)
        writableDatabase.update("strings", v, "id = ?", arrayOf(id.toString()))
    }

    fun translatedRows(gameId: String): List<Row> {
        val out = ArrayList<Row>()
        readableDatabase.rawQuery(
            "SELECT $ROW_COLS FROM strings WHERE game_id = ? AND translated <> ''", arrayOf(gameId)
        ).use { c -> while (c.moveToNext()) out.add(rowOf(c)) }
        return out
    }

    fun namesMap(gameId: String): Map<String, String> {
        val m = HashMap<String, String>()
        readableDatabase.rawQuery(
            "SELECT original, translated FROM strings WHERE game_id = ? AND kind = 'name' AND translated <> ''",
            arrayOf(gameId)
        ).use { c -> while (c.moveToNext()) m[c.getString(0)] = c.getString(1) }
        return m
    }

    // ---- gambar ----

    private fun regionOf(c: android.database.Cursor) = Region(
        c.getLong(0), c.getString(1), c.getInt(2), c.getInt(3), c.getInt(4), c.getInt(5),
        c.getString(6), c.getString(7), c.getInt(8) == 1, c.getInt(9), c.getInt(10)
    )

    private val REG_COLS = "id, file, x, y, w, h, original, translated, edited, bg, fg"

    fun replaceRegions(gameId: String, file: String, list: List<Region>) = tx { db ->
        db.delete("images", "game_id = ? AND file = ?", arrayOf(gameId, file))
        val v = ContentValues()
        for (r in list) {
            v.clear()
            v.put("game_id", gameId); v.put("file", file)
            v.put("x", r.x); v.put("y", r.y); v.put("w", r.w); v.put("h", r.h)
            v.put("original", r.original); v.put("translated", r.translated)
            v.put("edited", if (r.edited) 1 else 0); v.put("bg", r.bg); v.put("fg", r.fg)
            db.insert("images", null, v)
        }
    }

    fun regions(gameId: String, file: String): List<Region> {
        val out = ArrayList<Region>()
        readableDatabase.rawQuery(
            "SELECT $REG_COLS FROM images WHERE game_id = ? AND file = ? ORDER BY y, x", arrayOf(gameId, file)
        ).use { c -> while (c.moveToNext()) out.add(regionOf(c)) }
        return out
    }

    fun regionsOfFile(gameId: String, file: String) = regions(gameId, file)

    fun updateRegion(id: Long, text: String) {
        val v = ContentValues()
        v.put("translated", text)
        v.put("edited", 1)
        writableDatabase.update("images", v, "id = ?", arrayOf(id.toString()))
    }

    fun setRegionTranslated(id: Long, text: String) {
        val v = ContentValues()
        v.put("translated", text)
        writableDatabase.update("images", v, "id = ? AND edited = 0", arrayOf(id.toString()))
    }

    fun pendingRegions(gameId: String, force: Boolean): List<Region> {
        val cond = if (force) "edited = 0" else "edited = 0 AND translated = ''"
        val out = ArrayList<Region>()
        readableDatabase.rawQuery(
            "SELECT $REG_COLS FROM images WHERE game_id = ? AND $cond ORDER BY id", arrayOf(gameId)
        ).use { c -> while (c.moveToNext()) out.add(regionOf(c)) }
        return out
    }

    fun imageFiles(gameId: String): List<Map<String, Any?>> {
        val out = ArrayList<Map<String, Any?>>()
        readableDatabase.rawQuery(
            "SELECT file, COUNT(*), SUM(CASE WHEN translated <> '' THEN 1 ELSE 0 END) FROM images " +
                "WHERE game_id = ? GROUP BY file ORDER BY file", arrayOf(gameId)
        ).use { c ->
            while (c.moveToNext()) out.add(mapOf("file" to c.getString(0), "count" to c.getInt(1), "done" to c.getInt(2)))
        }
        return out
    }
}
