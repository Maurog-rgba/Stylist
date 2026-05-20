#include "StylistInferenceJNI.h"

#include <android/log.h>
#include <jni.h>
#include <string>
#include <vector>
#include <cstring>
#include <algorithm>
#include <chrono>

// llama.cpp / mtmd headers
#include "llama.h"
#include "ggml-backend.h"
#include "mtmd.h"
#include "mtmd-helper.h"

#define LOG_TAG "StylistInference"
#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, LOG_TAG, __VA_ARGS__)
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO,  LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

// ---- llama.cpp log bridge -----------------------------------------------

static void android_log_callback(ggml_log_level level, const char* text, void* /*user_data*/) {
    int android_level;
    switch (level) {
        case GGML_LOG_LEVEL_ERROR: android_level = ANDROID_LOG_ERROR; break;
        case GGML_LOG_LEVEL_WARN:  android_level = ANDROID_LOG_WARN;  break;
        case GGML_LOG_LEVEL_INFO:  android_level = ANDROID_LOG_INFO;  break;
        default:                   android_level = ANDROID_LOG_DEBUG; break;
    }
    __android_log_print(android_level, "llama.cpp", "%s", text);
}

// ---- Singleton engine ---------------------------------------------------

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
    mtmd_helper_log_set(android_log_callback, nullptr);

    const char* libDir = env->GetStringUTFChars(nativeLibDir, nullptr);
    LOGI("Loading backends from %s", libDir);
    ggml_backend_load_all_from_path(libDir);
    env->ReleaseStringUTFChars(nativeLibDir, libDir);

    llama_backend_init();
    LOGI("llama.cpp backend initialized");
    return 0;
}

int StylistInferenceEngine::loadModel(const std::string& modelPath,
                                       const std::string& mmprojPath) {
    std::lock_guard<std::mutex> lock(mutex_);

    releaseResources();

    LOGI("Loading LLM model from: %s", modelPath.c_str());

    llama_model_params model_params = llama_model_default_params();
    model_params.n_gpu_layers = 0;    // CPU-only on Android
    model_params.use_mmap     = true;

    model_ = llama_model_load_from_file(modelPath.c_str(), model_params);
    if (!model_) {
        LOGE("Failed to load model: %s", modelPath.c_str());
        return 1;
    }

    llama_context_params ctx_params = llama_context_default_params();
    ctx_params.n_ctx          = N_CTX;
    ctx_params.n_batch        = N_BATCH;
    ctx_params.n_threads      = N_THREADS;
    ctx_params.n_threads_batch = N_THREADS;

    ctx_ = llama_new_context_with_model(model_, ctx_params);
    if (!ctx_) {
        LOGE("Failed to create llama context");
        llama_model_free(model_);
        model_ = nullptr;
        return 2;
    }

    LOGI("Loading vision projector from: %s", mmprojPath.c_str());

    mtmd_context_params mtmd_params = mtmd_context_params_default();
    mtmd_params.use_gpu       = false;
    mtmd_params.n_threads     = N_THREADS;
    mtmd_params.print_timings = false;
    mtmd_params.warmup        = false;

    mtmd_ctx_ = mtmd_init_from_file(mmprojPath.c_str(), model_, mtmd_params);
    if (!mtmd_ctx_) {
        LOGE("Failed to initialize multimodal context — check mmproj compatibility");
        llama_free(ctx_);
        ctx_ = nullptr;
        llama_model_free(model_);
        model_ = nullptr;
        return 3;
    }

    LOGI("Model loaded successfully (LLM + vision projector)");
    return 0;
}

// ---------------------------------------------------------------------------
// infer — uses mtmd_helper_eval_chunks for correct batching
// ---------------------------------------------------------------------------
std::string StylistInferenceEngine::infer(
    const unsigned char* imageData, size_t imageDataSize,
    const std::string& prompt)
{
    std::lock_guard<std::mutex> lock(mutex_);

    if (!model_ || !ctx_ || !mtmd_ctx_) {
        LOGE("Model not loaded");
        return R"({"error": "Model not loaded"})";
    }

    // ---- 1. Build bitmap from raw JPEG/PNG bytes -------------------------
    mtmd_bitmap* bitmap = mtmd_helper_bitmap_init_from_buf(
        mtmd_ctx_,
        imageData,
        imageDataSize);

    if (!bitmap) {
        LOGE("Failed to decode image from buffer");
        return R"({"error": "Failed to decode image. Unsupported format or corrupt data."})";
    }

    LOGI("Image decoded successfully");

    // ---- 2. Tokenize prompt + image chunks --------------------------------
    // The marker in the prompt tells mtmd where to insert the image tokens.
    const char* marker = mtmd_default_marker();

    // Compose: <prompt>\n<marker>
    std::string full_prompt = prompt + "\n" + marker;

    mtmd_input_text input_text{};
    input_text.text          = full_prompt.c_str();
    input_text.add_special   = true;
    input_text.parse_special = true;

    const mtmd_bitmap* bitmaps[] = { bitmap };

    mtmd_input_chunks* chunks = mtmd_input_chunks_init();
    if (!chunks) {
        LOGE("Failed to allocate input chunks");
        mtmd_bitmap_free(bitmap);
        return R"({"error": "Out of memory allocating input chunks"})";
    }

    int32_t tokenize_rc = mtmd_tokenize(mtmd_ctx_, chunks, &input_text, bitmaps, 1);
    mtmd_bitmap_free(bitmap); // free after tokenize

    if (tokenize_rc != 0) {
        LOGE("Tokenization failed: %d", tokenize_rc);
        mtmd_input_chunks_free(chunks);
        return R"({"error": "Tokenization failed"})";
    }

    LOGI("Tokenized %zu chunks", mtmd_input_chunks_size(chunks));

    // ---- 3. Eval all chunks (text + image embeddings) via helper ----------
    // Reset context KV cache
    llama_memory_clear(llama_get_memory(ctx_), true);

    llama_pos n_past     = 0;
    llama_pos new_n_past = 0;

    int32_t eval_rc = mtmd_helper_eval_chunks(
        mtmd_ctx_,
        ctx_,
        chunks,
        n_past,
        /*seq_id=*/ 0,
        /*n_batch=*/ N_BATCH,
        /*logits_last=*/ true,
        &new_n_past);

    mtmd_input_chunks_free(chunks);

    if (eval_rc != 0) {
        LOGE("mtmd_helper_eval_chunks failed: %d", eval_rc);
        return R"({"error": "Evaluation of image+text chunks failed"})";
    }

    n_past = new_n_past;
    LOGI("Eval complete, n_past=%d — starting text generation", n_past);

    // ---- 4. Greedy generation -------------------------------------------
    const llama_vocab* vocab = llama_model_get_vocab(model_);

    auto sparams = llama_sampler_chain_default_params();
    llama_sampler* smpl = llama_sampler_chain_init(sparams);
    llama_sampler_chain_add(smpl, llama_sampler_init_greedy());

    std::string result;
    result.reserve(512);

    const int max_new_tokens = 256;

    llama_batch batch = llama_batch_init(1, 0, 1);

    for (int i = 0; i < max_new_tokens; i++) {
        llama_token token_id = llama_sampler_sample(smpl, ctx_, -1);

        // Stop on EOS / EOT
        if (llama_vocab_is_eog(vocab, token_id)) {
            LOGI("EOS reached at token %d", i);
            break;
        }

        char buf[128];
        int n_chars = llama_token_to_piece(vocab, token_id, buf, sizeof(buf), 0, true);
        if (n_chars > 0) {
            result.append(buf, n_chars);
        }

        // Feed token back
        batch.n_tokens    = 1;
        batch.token[0]    = token_id;
        batch.pos[0]      = n_past;
        batch.n_seq_id[0] = 1;
        batch.seq_id[0][0] = 0;
        batch.logits[0]   = true;

        if (llama_decode(ctx_, batch) != 0) {
            LOGE("Decode failed during generation at token %d", i);
            break;
        }
        n_past++;
    }

    llama_batch_free(batch);
    llama_sampler_free(smpl);

    LOGI("Generation complete. Output length: %zu chars", result.size());
    return result;
}

std::string StylistInferenceEngine::inferFromFile(
    const std::string& imagePath,
    const std::string& prompt)
{
    std::lock_guard<std::mutex> lock(mutex_);

    if (!model_ || !ctx_ || !mtmd_ctx_) {
        LOGE("Model not loaded");
        return R"({"error": "Model not loaded"})";
    }

    // ---- 1. Build bitmap from file directly ------------------------------
    mtmd_bitmap* bitmap = mtmd_helper_bitmap_init_from_file(
        mtmd_ctx_,
        imagePath.c_str());

    if (!bitmap) {
        LOGE("Failed to load image from file: %s", imagePath.c_str());
        return R"({"error": "Failed to load image file. Check path and permissions."})";
    }

    LOGI("Image loaded from file successfully");

    // ---- 2. Tokenize prompt + image chunks --------------------------------
    const char* marker = mtmd_default_marker();
    std::string full_prompt = prompt + "\n" + marker;

    mtmd_input_text input_text{};
    input_text.text          = full_prompt.c_str();
    input_text.add_special   = true;
    input_text.parse_special = true;

    const mtmd_bitmap* bitmaps[] = { bitmap };

    mtmd_input_chunks* chunks = mtmd_input_chunks_init();
    if (!chunks) {
        LOGE("Failed to allocate input chunks");
        mtmd_bitmap_free(bitmap);
        return R"({"error": "Out of memory allocating input chunks"})";
    }

    int32_t tokenize_rc = mtmd_tokenize(mtmd_ctx_, chunks, &input_text, bitmaps, 1);
    mtmd_bitmap_free(bitmap); // free after tokenize

    if (tokenize_rc != 0) {
        LOGE("Tokenization failed: %d", tokenize_rc);
        mtmd_input_chunks_free(chunks);
        return R"({"error": "Tokenization failed"})";
    }

    // ---- 3. Eval all chunks ---------------------------------------------
    llama_memory_clear(llama_get_memory(ctx_), true);

    llama_pos n_past     = 0;
    llama_pos new_n_past = 0;

    int32_t eval_rc = mtmd_helper_eval_chunks(
        mtmd_ctx_,
        ctx_,
        chunks,
        n_past,
        0,
        N_BATCH,
        true,
        &new_n_past);

    mtmd_input_chunks_free(chunks);

    if (eval_rc != 0) {
        LOGE("mtmd_helper_eval_chunks failed: %d", eval_rc);
        return R"({"error": "Evaluation of image+text chunks failed"})";
    }

    n_past = new_n_past;

    // ---- 4. Greedy generation (Shared logic could be refactored, but keeping simple for now) ----
    const llama_vocab* vocab = llama_model_get_vocab(model_);
    auto sparams = llama_sampler_chain_default_params();
    llama_sampler* smpl = llama_sampler_chain_init(sparams);
    llama_sampler_chain_add(smpl, llama_sampler_init_greedy());

    std::string result;
    const int max_new_tokens = 256;
    llama_batch batch = llama_batch_init(1, 0, 1);

    for (int i = 0; i < max_new_tokens; i++) {
        llama_token token_id = llama_sampler_sample(smpl, ctx_, -1);
        if (llama_vocab_is_eog(vocab, token_id)) break;

        char buf[128];
        int n_chars = llama_token_to_piece(vocab, token_id, buf, sizeof(buf), 0, true);
        if (n_chars > 0) result.append(buf, n_chars);

        batch.n_tokens = 1;
        batch.token[0] = token_id;
        batch.pos[0] = n_past;
        batch.n_seq_id[0] = 1;
        batch.seq_id[0][0] = 0;
        batch.logits[0] = true;

        if (llama_decode(ctx_, batch) != 0) break;
        n_past++;
    }

    llama_batch_free(batch);
    llama_sampler_free(smpl);

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

// ---- JNI exports --------------------------------------------------------

extern "C" {

JNIEXPORT jint JNICALL
Java_com_stylist_StylistInferenceModule_nativeInit(
    JNIEnv* env, jobject /*thiz*/, jstring nativeLibDir)
{
    return StylistInferenceEngine::instance().initialize(env, nativeLibDir);
}

JNIEXPORT jint JNICALL
Java_com_stylist_StylistInferenceModule_nativeLoadModel(
    JNIEnv* env, jobject /*thiz*/, jstring modelPath, jstring mmprojPath)
{
    const char* modelStr   = env->GetStringUTFChars(modelPath,   nullptr);
    const char* mmprojStr  = env->GetStringUTFChars(mmprojPath,  nullptr);

    std::string model(modelStr);
    std::string mmproj(mmprojStr);

    env->ReleaseStringUTFChars(modelPath,  modelStr);
    env->ReleaseStringUTFChars(mmprojPath, mmprojStr);

    return StylistInferenceEngine::instance().loadModel(model, mmproj);
}

JNIEXPORT jstring JNICALL
Java_com_stylist_StylistInferenceModule_nativeInfer(
    JNIEnv* env, jobject /*thiz*/,
    jobject imageData, jint imageDataSize, jstring prompt)
{
    const char* promptStr = env->GetStringUTFChars(prompt, nullptr);
    std::string promptCpp(promptStr);
    env->ReleaseStringUTFChars(prompt, promptStr);

    const auto* pixels = static_cast<const unsigned char*>(
        env->GetDirectBufferAddress(imageData));
    if (!pixels) {
        LOGE("Failed to get direct buffer address");
        return env->NewStringUTF(R"({"error": "Invalid image buffer"})");
    }

    std::string result = StylistInferenceEngine::instance().infer(
        pixels, static_cast<size_t>(imageDataSize), promptCpp);

    return env->NewStringUTF(result.c_str());
}

JNIEXPORT jstring JNICALL
Java_com_stylist_StylistInferenceModule_nativeInferFromFile(
    JNIEnv* env, jobject /*thiz*/, jstring imagePath, jstring prompt)
{
    const char* pathStr = env->GetStringUTFChars(imagePath, nullptr);
    const char* promptStr = env->GetStringUTFChars(prompt, nullptr);

    std::string imagePathCpp(pathStr);
    std::string promptCpp(promptStr);

    env->ReleaseStringUTFChars(imagePath, pathStr);
    env->ReleaseStringUTFChars(prompt, promptStr);

    std::string result = StylistInferenceEngine::instance().inferFromFile(
        imagePathCpp, promptCpp);

    return env->NewStringUTF(result.c_str());
}

JNIEXPORT jint JNICALL
Java_com_stylist_StylistInferenceModule_nativeUnloadModel(
    JNIEnv* /*env*/, jobject /*thiz*/)
{
    return StylistInferenceEngine::instance().unloadModel();
}

JNIEXPORT jboolean JNICALL
Java_com_stylist_StylistInferenceModule_nativeIsModelLoaded(
    JNIEnv* /*env*/, jobject /*thiz*/)
{
    return StylistInferenceEngine::instance().isModelLoaded()
        ? JNI_TRUE : JNI_FALSE;
}

} // extern "C"
