cmake_minimum_required(VERSION 3.22.1)
project("StylistInference" VERSION 1.0.0 LANGUAGES C CXX)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED true)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED true)

# ------------------------------------------------------------------------
# React Native include paths
# ------------------------------------------------------------------------
set(REACT_NATIVE_DIR "${CMAKE_CURRENT_LIST_DIR}/../../../../node_modules/react-native")

set(REACT_COMMON_INCLUDES
    ${REACT_NATIVE_DIR}/ReactCommon
    ${REACT_NATIVE_DIR}/ReactCommon/callinvoker
    ${REACT_NATIVE_DIR}/ReactCommon/jsi
    ${REACT_NATIVE_DIR}/ReactCommon/react/nativemodule/core
    ${REACT_NATIVE_DIR}/ReactCommon/react/bridging
)

# --------------------------------------------------------------------------
# llama.cpp integration
# --------------------------------------------------------------------------
set(LLAMA_SRC "${CMAKE_CURRENT_LIST_DIR}/../../../../../../llama.cpp")

if(DEFINED ANDROID_ABI)
    message(STATUS "StylistInference: Detected Android ABI: ${ANDROID_ABI}")
    if(ANDROID_ABI STREQUAL "arm64-v8a")
        set(GGML_SYSTEM_ARCH "ARM")
        set(GGML_CPU_KLEIDIAI ON)
        set(GGML_OPENMP ON)
    elseif(ANDROID_ABI STREQUAL "armeabi-v7a")
        set(GGML_SYSTEM_ARCH "ARM")
        set(GGML_CPU_KLEIDIAI ON)
        set(GGML_OPENMP ON)
    elseif(ANDROID_ABI STREQUAL "x86_64")
        set(GGML_SYSTEM_ARCH "x86")
        set(GGML_CPU_KLEIDIAI OFF)
        set(GGML_OPENMP OFF)
    elseif(ANDROID_ABI STREQUAL "x86")
        set(GGML_SYSTEM_ARCH "x86")
        set(GGML_CPU_KLEIDIAI OFF)
        set(GGML_OPENMP OFF)
    else()
        message(FATAL_ERROR "StylistInference: Unsupported ABI: ${ANDROID_ABI}")
    endif()
endif()

add_subdirectory(${LLAMA_SRC} build-llama)

# --------------------------------------------------------------------------
# Stylist Inference JNI library (includes mtmd sources directly)
# --------------------------------------------------------------------------

file(GLOB MTMD_SOURCES
    ${LLAMA_SRC}/tools/mtmd/mtmd.cpp
    ${LLAMA_SRC}/tools/mtmd/mtmd-audio.cpp
    ${LLAMA_SRC}/tools/mtmd/mtmd-image.cpp
    ${LLAMA_SRC}/tools/mtmd/mtmd-helper.cpp
    ${LLAMA_SRC}/tools/mtmd/clip.cpp
    ${LLAMA_SRC}/tools/mtmd/models/*.cpp
)

file(GLOB MTMD_HEADERS
    ${LLAMA_SRC}/tools/mtmd/mtmd.h
    ${LLAMA_SRC}/tools/mtmd/mtmd-audio.h
    ${LLAMA_SRC}/tools/mtmd/mtmd-image.h
    ${LLAMA_SRC}/tools/mtmd/mtmd-helper.h
    ${LLAMA_SRC}/tools/mtmd/clip.h
    ${LLAMA_SRC}/tools/mtmd/clip-impl.h
    ${LLAMA_SRC}/tools/mtmd/clip-model.h
    ${LLAMA_SRC}/tools/mtmd/clip-graph.h
    ${LLAMA_SRC}/tools/mtmd/models/models.h
    ${LLAMA_SRC}/tools/mtmd/deprecation-warning.cpp
)

add_library(stylist_inference SHARED
    StylistInferenceJNI.cpp
    StylistInferenceJNI.h
    ${MTMD_SOURCES}
    ${MTMD_HEADERS}
)

target_compile_definitions(stylist_inference PRIVATE
    GGML_SYSTEM_ARCH=${GGML_SYSTEM_ARCH}
    GGML_CPU_KLEIDIAI=$<BOOL:${GGML_CPU_KLEIDIAI}>
    GGML_OPENMP=$<BOOL:${GGML_OPENMP}>
)

target_include_directories(stylist_inference PRIVATE
    ${REACT_COMMON_INCLUDES}
    ${LLAMA_SRC}
    ${LLAMA_SRC}/common
    ${LLAMA_SRC}/include
    ${LLAMA_SRC}/ggml/include
    ${LLAMA_SRC}/ggml/src
    ${LLAMA_SRC}/tools/mtmd
    ${LLAMA_SRC}/tools/mtmd/models
    ${LLAMA_SRC}/vendor
)

target_link_libraries(stylist_inference
    llama
    android
    log
)

if(NOT MSVC)
    target_compile_options(stylist_inference PRIVATE -Wno-cast-qual)
endif()
if(ANDROID)
    target_compile_options(stylist_inference PRIVATE -Wno-missing-prototypes)
endif()
