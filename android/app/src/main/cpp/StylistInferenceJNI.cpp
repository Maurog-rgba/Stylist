#include "StylistInferenceJNI.h"

#include <android/log.h>
#include <jni.h>
#include <string>
#include <vector>
#include <cstring>
#include <algorithm>
#include <chrono>

#include "stb/stb_image.h"

#define LOG_TAG "StylistInference"
#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, LOG_TAG, __VA_ARGS__)
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO,  LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

static void android_log_callback(ggml_log_level level, const char* text, void* user_data) {
    (void)user_data;
    int android_level;
    switch (level) {
        case GGML_LOG_LEVEL_ERROR: android_level = ANDROID_LOG_ERROR; break;
        case GGML_LOG_LEVEL_WARN:  android_level = ANDROID_LOG_WARN;  break;
        case GGML_LOG_LEVEL_INFO:  android_level = ANDROID_LOG_INFO;  break;
        default:                   android_level = ANDROID_LOG_DEBUG; break;
    }
    __android_log_print(android_level, "llama.cpp", "%s", text);
}

StylistInferenceEngine& StylistInferenceEngine::instance() {
    static StylistInferenceEngine engine;
    return engine;
}

StylistInferenceEngine::~StylistInferenceEngine() {
    releaseResources();
}

int StylistInferenceEngine::initialize(JNIEnv* env, jstring nativeLibDir) {
    std::lock_guard<std::mutex> lock(mutex_);

    llama_log_set(android_log_callback, nullptr);

    const auto* libDir = env->GetStringUTFChars(nativeLibDir, nullptr);
    LOGI("Loading backends from %s", libDir);
    ggml_backend_load_all_from_path(libDir);
    env->ReleaseStringUTFChars(nativeLibDir, libDir);

    llama_backend_init();
    LOGI("llama.cpp backend initialized");
    return 0;
}

int StylistInferenceEngine::loadModel(const std::string& modelPath, const std::string& mmprojPath) {
    std::lock_guard<std::mutex> lock(mutex_);

    releaseResources();

    LOGI("Loading model from: %s", modelPath.c_str());

    llama_model_params model_params = llama_model_default_params();
    model_params.n_gpu_layers = 0;
    model_params.use_mmap = true;

    model_ = llama_model_load_from_file(modelPath.c_str(), model_params);
    if (!model_) {
        LOGE("Failed to load model: %s", modelPath.c_str());
        return 1;
    }

    llama_context_params ctx_params = llama_context_default_params();
    ctx_params.n_ctx = N_CTX;
    ctx_params.n_batch = N_BATCH;
    ctx_params.n_threads = N_THREADS;
    ctx_params.n_threads_batch = N_THREADS;

    ctx_ = llama_new_context_with_model(model_, ctx_params);
    if (!ctx_) {
        LOGE("Failed to create context");
        llama_model_free(model_);
        model_ = nullptr;
        return 2;
    }

    mtmd_context_params mtmd_params = mtmd_context_params_default();
    mtmd_params.use_gpu = false;
    mtmd_params.n_threads = N_THREADS;
    mtmd_params.print_timings = false;

    mmproj_path_ = mmprojPath;
    mtmd_ctx_ = mtmd_init_from_file(mmprojPath.c_str(), model_, mtmd_params);

    if (!mtmd_ctx_) {
        LOGE("Failed to initialize multimodal context. "
             "Is the mmproj file compatible with the model?");
        llama_free(ctx_);
        ctx_ = nullptr;
        llama_model_free(model_);
        model_ = nullptr;
        return 3;
    }

    LOGI("Model loaded successfully");
    return 0;
}

std::string StylistInferenceEngine::infer(
    const unsigned char* imageData, size_t imageDataSize,
    const std::string& prompt)
{
    std::lock_guard<std::mutex> lock(mutex_);

    if (!model_ || !ctx_ || !mtmd_ctx_) {
        LOGE("Model not loaded");
        return R"({"error": "Model not loaded"})";
    }

    int decodeWidth = 0, decodeHeight = 0, decodeChannels = 0;
    unsigned char* decodedPixels = stbi_load_from_memory(
        imageData, static_cast<int>(imageDataSize),
        &decodeWidth, &decodeHeight, &decodeChannels, 3);

    if (!decodedPixels) {
        LOGE("Failed to decode image (JPEG/PNG). stb_image error: %s",
             stbi_failure_reason());
        return R"({"error": "Failed to decode image. Unsupported format or corrupt file."})";
    }

    LOGI("Image decoded: %dx%d, channels=%d", decodeWidth, decodeHeight, decodeChannels);

    const char* marker = mtmd_default_marker();

    std::string full_prompt = prompt + "\n" + marker;

    mtmd_input_text input_text{};
    input_text.text = full_prompt.c_str();
    input_text.add_special = true;
    input_text.parse_special = true;

    mtmd_bitmap* bitmap = mtmd_bitmap_init(
        static_cast<uint32_t>(decodeWidth),
        static_cast<uint32_t>(decodeHeight),
        decodedPixels);

    stbi_image_free(decodedPixels);

    if (!bitmap) {
        LOGE("Failed to create bitmap");
        return R"({"error": "Failed to create image bitmap"})";
    }

    const mtmd_bitmap* bitmaps[] = { bitmap };

    mtmd_input_chunks* chunks = mtmd_input_chunks_init();
    if (!chunks) {
        LOGE("Failed to create input chunks");
        mtmd_bitmap_free(bitmap);
        return R"({"error": "Failed to create input chunks"})";
    }

    int32_t tokenize_result = mtmd_tokenize(mtmd_ctx_, chunks, &input_text, bitmaps, 1);
    mtmd_bitmap_free(bitmap);

    if (tokenize_result != 0) {
        LOGE("Tokenization failed: %d", tokenize_result);
        mtmd_input_chunks_free(chunks);
        return R"({"error": "Tokenization failed"})";
    }

    size_t n_chunks = mtmd_input_chunks_size(chunks);
    std::vector<llama_token> all_tokens;
    int total_pos = 0;
    size_t n_embd_inp = llama_model_n_embd_inp(model_);

    for (size_t ci = 0; ci < n_chunks; ci++) {
        const mtmd_input_chunk* chunk = mtmd_input_chunks_get(chunks, ci);

        mtmd_encode_chunk(mtmd_ctx_, chunk);

        size_t n_tokens = mtmd_input_chunk_get_n_tokens(chunk);
        float* embd = mtmd_get_output_embd(mtmd_ctx_);

        for (size_t i = 0; i < n_tokens; i++) {
            llama_batch batch = llama_batch_init(1, n_embd_inp, 1);
            if (!batch.embd) break;

            float* token_embd = embd + i * n_embd_inp;
            std::copy(token_embd, token_embd + n_embd_inp, batch.embd);

            batch.n_tokens = 1;
            batch.pos[0] = total_pos;
            batch.n_seq_id[0] = 1;
            batch.seq_id[0][0] = 0;
            batch.logits[0] = false;

            if (llama_decode(ctx_, batch)) {
                LOGE("Decode failed at chunk %zu, token %zu", ci, i);
                llama_batch_free(batch);
                mtmd_input_chunks_free(chunks);
                return R"({"error": "Decode failed"})";
            }
            llama_batch_free(batch);
            total_pos++;
        }

        auto chunk_type = mtmd_input_chunk_get_type(chunk);
        if (chunk_type == MTMD_INPUT_CHUNK_TYPE_TEXT) {
            size_t n_text_tokens;
            const llama_token* text_tokens = mtmd_input_chunk_get_tokens_text(chunk, &n_text_tokens);
            for (size_t i = 0; i < n_text_tokens; i++) {
                all_tokens.push_back(text_tokens[i]);
            }
        }
    }

    mtmd_input_chunks_free(chunks);

    const auto* vocab = llama_model_get_vocab(model_);
    int n_eos = llama_vocab_eos(vocab);
    if (n_eos < 0) n_eos = llama_vocab_eot(vocab);

    auto sparams = llama_sampler_chain_default_params();
    llama_sampler* smpl = llama_sampler_chain_init(sparams);
    llama_sampler_chain_add(smpl, llama_sampler_init_greedy());

    std::string result;
    const int max_new_tokens = 256;

    for (int i = 0; i < max_new_tokens; i++) {
        llama_token token_id = llama_sampler_sample(smpl, ctx_, -1);

        if (token_id == n_eos) break;

        char buf[128];
        int n_chars = llama_token_to_piece(vocab, token_id, buf, sizeof(buf), 0, true);
        if (n_chars > 0) {
            result.append(buf, n_chars);
        }

        all_tokens.push_back(token_id);

        llama_batch batch = llama_batch_init(1, 0, 1);
        batch.n_tokens = 1;
        batch.token[0] = token_id;
        batch.pos[0] = total_pos;
        batch.n_seq_id[0] = 1;
        batch.seq_id[0][0] = 0;
        batch.logits[0] = true;

        if (llama_decode(ctx_, batch) != 0) {
            LOGE("Decode failed during generation");
            llama_batch_free(batch);
            break;
        }
        llama_batch_free(batch);
        total_pos++;
    }

    llama_sampler_free(smpl);

    LOGI("Inference complete. Result length: %zu", result.size());
    return result;
}

int StylistInferenceEngine::unloadModel() {
    std::lock_guard<std::mutex> lock(mutex_);
    releaseResources();
    return 0;
}

void StylistInferenceEngine::releaseResources() {
    if (mtmd_ctx_) {
        mtmd_free(mtmd_ctx_);
        mtmd_ctx_ = nullptr;
    }
    if (ctx_) {
        llama_free(ctx_);
        ctx_ = nullptr;
    }
    if (model_) {
        llama_model_free(model_);
        model_ = nullptr;
    }
    LOGI("Resources released");
}

extern "C" {

JNIEXPORT jint JNICALL
Java_com_stylist_StylistInferenceModule_nativeInit(JNIEnv* env, jobject /* thiz */, jstring nativeLibDir) {
    return StylistInferenceEngine::instance().initialize(env, nativeLibDir);
}

JNIEXPORT jint JNICALL
Java_com_stylist_StylistInferenceModule_nativeLoadModel(
    JNIEnv* env, jobject /* thiz */, jstring modelPath, jstring mmprojPath)
{
    const auto* modelStr = env->GetStringUTFChars(modelPath, nullptr);
    const auto* mmprojStr = env->GetStringUTFChars(mmprojPath, nullptr);

    std::string model(modelStr);
    std::string mmproj(mmprojStr);

    env->ReleaseStringUTFChars(modelPath, modelStr);
    env->ReleaseStringUTFChars(mmprojPath, mmprojStr);

    return StylistInferenceEngine::instance().loadModel(model, mmproj);
}

JNIEXPORT jstring JNICALL
Java_com_stylist_StylistInferenceModule_nativeInfer(
    JNIEnv* env, jobject /* thiz */,
    jobject imageData, jint imageDataSize, jstring prompt)
{
    const auto* promptStr = env->GetStringUTFChars(prompt, nullptr);
    std::string promptStrCpp(promptStr);
    env->ReleaseStringUTFChars(prompt, promptStr);

    auto* pixels = static_cast<const unsigned char*>(env->GetDirectBufferAddress(imageData));
    if (!pixels) {
        LOGE("Failed to get direct buffer address");
        return env->NewStringUTF(R"({"error": "Invalid image buffer"})");
    }

    std::string result = StylistInferenceEngine::instance().infer(
        pixels, static_cast<size_t>(imageDataSize), promptStrCpp);

    return env->NewStringUTF(result.c_str());
}

JNIEXPORT jint JNICALL
Java_com_stylist_StylistInferenceModule_nativeUnloadModel(JNIEnv* /* env */, jobject /* thiz */) {
    return StylistInferenceEngine::instance().unloadModel();
}

JNIEXPORT jboolean JNICALL
Java_com_stylist_StylistInferenceModule_nativeIsModelLoaded(JNIEnv* /* env */, jobject /* thiz */) {
    return StylistInferenceEngine::instance().isModelLoaded() ? JNI_TRUE : JNI_FALSE;
}

} // extern "C"
