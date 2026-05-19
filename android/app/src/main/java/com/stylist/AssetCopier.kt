package com.stylist

import android.content.Context
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.security.MessageDigest

object AssetCopier {

    private const val MODELS_ASSET_DIR = "models"
    private const val MODELS_OUTPUT_DIR = "models"

    fun copyModelAssets(context: Context): Map<String, String> {
        val outputDir = File(context.filesDir, MODELS_OUTPUT_DIR)
        if (!outputDir.exists()) {
            outputDir.mkdirs()
        }

        val assetFiles = context.assets.list(MODELS_ASSET_DIR) ?: emptyArray()
        val result = mutableMapOf<String, String>()

        for (filename in assetFiles) {
            if (!filename.endsWith(".gguf")) continue

            val destFile = File(outputDir, filename)

            try {
                val assetHash = computeAssetHash(context, "$MODELS_ASSET_DIR/$filename")

                if (destFile.exists()) {
                    val destHash = computeFileHash(destFile)
                    if (destHash == assetHash) {
                        result[filename] = destFile.absolutePath
                        continue
                    }
                }

                context.assets.open("$MODELS_ASSET_DIR/$filename").use { input ->
                    FileOutputStream(destFile).use { output ->
                        val buffer = ByteArray(8192)
                        var bytesRead: Int
                        while (input.read(buffer).also { bytesRead = it } != -1) {
                            output.write(buffer, 0, bytesRead)
                        }
                        output.flush()
                    }
                }

                result[filename] = destFile.absolutePath
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }

        return result
    }

    fun getModelPath(context: Context, filename: String): String? {
        val file = File(context.filesDir, "$MODELS_OUTPUT_DIR/$filename")
        return if (file.exists()) file.absolutePath else null
    }

    private fun computeAssetHash(context: Context, assetPath: String): String {
        context.assets.open(assetPath).use { input ->
            return computeHash(input)
        }
    }

    private fun computeFileHash(file: File): String {
        FileInputStream(file).use { input ->
            return computeHash(input)
        }
    }

    private fun computeHash(input: java.io.InputStream): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val buffer = ByteArray(8192)
        var bytesRead: Int
        while (input.read(buffer).also { bytesRead = it } != -1) {
            digest.update(buffer, 0, bytesRead)
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }
}
