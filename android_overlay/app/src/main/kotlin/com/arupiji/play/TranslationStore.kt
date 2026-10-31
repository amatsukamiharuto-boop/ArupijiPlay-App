package com.arupiji.play

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import java.security.MessageDigest

class TranslationStore(ctx: Context) : SQLiteOpenHelper(ctx, "translations.db", null, 1) {

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            "CREATE TABLE cache(key TEXT PRIMARY KEY, game_id TEXT, original TEXT, " +
                "translated TEXT, lang TEXT, created INTEGER)"
        )
        db.execSQL(
            "CREATE TABLE overrides(key TEXT PRIMARY KEY, game_id TEXT, original TEXT, " +
                "custom TEXT, updated INTEGER)"
        )
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {}

    private fun one(sql: String, arg: String): String? =
        readableDatabase.rawQuery(sql, arrayOf(arg)).use { if (it.moveToFirst()) it.getString(0) else null }

    fun getCache(key: String): String? = one("SELECT translated FROM cache WHERE key = ?", key)

    fun putCache(key: String, gameId: String, original: String, translated: String, lang: String) {
        val v = ContentValues().apply {
            put("key", key); put("game_id", gameId); put("original", original)
            put("translated", translated); put("lang", lang); put("created", System.currentTimeMillis())
        }
        writableDatabase.insertWithOnConflict("cache", null, v, SQLiteDatabase.CONFLICT_REPLACE)
    }

    fun getOverride(gameId: String, original: String): String? =
        one("SELECT custom FROM overrides WHERE key = ?", hash(gameId + "|" + original))

    fun putOverride(gameId: String, original: String, custom: String) {
        val v = ContentValues().apply {
            put("key", hash(gameId + "|" + original)); put("game_id", gameId)
            put("original", original); put("custom", custom); put("updated", System.currentTimeMillis())
        }
        writableDatabase.insertWithOnConflict("overrides", null, v, SQLiteDatabase.CONFLICT_REPLACE)
    }

    companion object {
        fun hash(s: String): String =
            MessageDigest.getInstance("SHA-256").digest(s.toByteArray()).joinToString("") { "%02x".format(it) }
    }
}
