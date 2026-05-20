cmake_minimum_required(VERSION 3.22.1)
project(appmodules)

# Include React Native's CMake utilities to build the core JNI modules
include(${REACT_ANDROID_DIR}/cmake-utils/ReactNative-application.cmake)

# Include our custom stylist_inference CMake configuration
add_subdirectory(${CMAKE_CURRENT_LIST_DIR}/../cpp build-stylist-inference)
