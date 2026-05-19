#pragma once

#include <jni.h>
#include <string>
#include <vector>
#include <mutex>
#include <atomic>

#include "llama.h"
#include "mtmd.h"

class StylistInferenceEngine {
public:
    static StylistInferenceEngine& instance();

    int initialize(JNIEnv* env, jstring nativeLibDir);
    int loadModel(const std::string& modelPath, const std::string& mmprojPath);
    std::string infer(const unsigned char* imageData, size_t imageDataSize,
                      const std::string& prompt);
    int unloadModel();
    bool isModelLoaded() const { return model_ != nullptr; }

private:
    StylistInferenceEngine() = default;
    ~StylistInferenceEngine();
    StylistInferenceEngine(const StylistInferenceEngine&) = delete;
    StylistInferenceEngine& operator=(const StylistInferenceEngine&) = delete;

    void releaseResources();

    std::mutex mutex_;

    llama_model* model_ = nullptr;
    llama_context* ctx_ = nullptr;
    mtmd_context* mtmd_ctx_ = nullptr;

    std::string mmproj_path_;

    static constexpr int N_CTX = 2048;
    static constexpr int N_THREADS = 4;
    static constexpr int N_BATCH = 512;
};
