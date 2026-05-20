package com.stylist

import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import java.io.File

@ReactModule(name = StylistInferenceModule.NAME)
class StylistInferenceModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "StylistInference"
        private var nativeLibraryLoaded = false

        init {
            try {
                System.loadLibrary("stylist_inference")
                nativeLibraryLoaded = true
            } catch (e: UnsatisfiedLinkError) {
                nativeLibraryLoaded = false
            }
        }
    }

    override fun getName(): String = NAME

    override fun getConstants(): MutableMap<String, Any> {
        return mutableMapOf("isNativeAvailable" to nativeLibraryLoaded)
    }

    @ReactMethod
    fun loadModel(modelPath: String, mmprojPath: String, promise: Promise) {
        try {
            val resolvedModelPath = resolveAssetPath(modelPath, "llava-v1.5-7b-Q2_K.gguf")
            val resolvedMmprojPath = resolveAssetPath(mmprojPath, "llava-v1.5-7b-mmproj-model-f16.gguf")

            val nativeLibDir = reactContext.applicationInfo.nativeLibraryDir
            nativeInit(nativeLibDir)

            val result = nativeLoadModel(resolvedModelPath, resolvedMmprojPath)
            if (result == 0) {
                promise.resolve(null)
            } else {
                promise.reject("LOAD_ERROR", "Failed to load model. Error code: $result")
            }
        } catch (e: Exception) {
            promise.reject("LOAD_ERROR", e.message)
        }
    }

    @ReactMethod
    fun copyModelAssets(promise: Promise) {
        try {
            val copiedPaths = AssetCopier.copyModelAssets(reactContext)
            val result = Arguments.createMap()
            for ((filename, path) in copiedPaths) {
                result.putString(filename, path)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("COPY_ERROR", e.message)
        }
    }

    @ReactMethod
    fun getModelsDirectory(promise: Promise) {
        try {
            val dir = File(reactContext.filesDir, "models")
            if (!dir.exists()) {
                dir.mkdirs()
            }
            promise.resolve(dir.absolutePath)
        } catch (e: Exception) {
            promise.reject("PATH_ERROR", e.message)
        }
    }

    @ReactMethod
    fun infer(imageData: ReadableMap, prompt: String, promise: Promise) {
        try {
            if (!imageData.hasKey("buffer")) {
                promise.reject("INFER_ERROR", "imageData must contain buffer")
                return
            }

            val buffer = imageData.getArray("buffer") ?: run {
                promise.reject("INFER_ERROR", "buffer cannot be null")
                return
            }

            val byteArray = ByteArray(buffer.size())
            for (i in 0 until buffer.size()) {
                byteArray[i] = (buffer.getInt(i) and 0xFF).toByte()
            }

            val bufferObj = java.nio.ByteBuffer.allocateDirect(byteArray.size)
            bufferObj.put(byteArray)
            bufferObj.rewind()

            val result = nativeInfer(bufferObj, byteArray.size, prompt)
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("INFER_ERROR", e.message)
        }
    }

    @ReactMethod
    fun inferFromFile(imagePath: String, prompt: String, promise: Promise) {
        try {
            val result = nativeInferFromFile(imagePath, prompt)
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("INFER_ERROR", e.message)
        }
    }

    @ReactMethod
    fun unloadModel(promise: Promise) {
        try {
            nativeUnloadModel()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("UNLOAD_ERROR", e.message)
        }
    }

    @ReactMethod
    fun isModelLoaded(promise: Promise) {
        try {
            promise.resolve(nativeIsModelLoaded())
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    private fun resolveAssetPath(requestedPath: String, assetFilename: String): String {
        if (requestedPath.isNotEmpty()) {
            return requestedPath
        }
        val destPath = AssetCopier.getModelPath(reactContext, assetFilename)
        if (destPath != null) {
            return destPath
        }
        return File(reactContext.filesDir, "models/$assetFilename").absolutePath
    }

    private external fun nativeInit(nativeLibDir: String): Int
    private external fun nativeLoadModel(modelPath: String, mmprojPath: String): Int
    private external fun nativeInfer(imageData: java.nio.ByteBuffer, imageDataSize: Int, prompt: String): String
    private external fun nativeInferFromFile(imagePath: String, prompt: String): String
    private external fun nativeUnloadModel(): Int
    private external fun nativeIsModelLoaded(): Boolean
}
