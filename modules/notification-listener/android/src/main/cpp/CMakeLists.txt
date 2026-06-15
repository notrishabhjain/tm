# Builds the whisper_jni native library used for in-app, on-device call
# transcription.
#
# This module does NOT vendor whisper.cpp's source (it's a large separate
# project with its own build and license). To enable real on-device
# transcription:
#
#   cd modules/notification-listener/android/src/main/cpp
#   git clone --depth 1 https://github.com/ggerganov/whisper.cpp
#
# Then rebuild the Android app. Without that checkout, this CMake project
# still builds a stub whisper_jni.so so the app compiles and runs normally —
# WhisperJNI.isReal() returns false and in-app call transcription reports
# "engine not built" until the checkout is added and the app is rebuilt.

cmake_minimum_required(VERSION 3.22)
project(whisper_jni)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

set(WHISPER_CPP_DIR ${CMAKE_CURRENT_SOURCE_DIR}/whisper.cpp)

if(EXISTS ${WHISPER_CPP_DIR}/CMakeLists.txt)
  message(STATUS "whisper.cpp found at ${WHISPER_CPP_DIR} — building real whisper_jni")

  set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
  set(WHISPER_BUILD_TESTS OFF CACHE BOOL "" FORCE)
  set(WHISPER_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
  set(GGML_OPENMP OFF CACHE BOOL "" FORCE)

  add_subdirectory(${WHISPER_CPP_DIR} whisper_build)

  add_library(whisper_jni SHARED whisper_jni.cpp)
  target_compile_definitions(whisper_jni PRIVATE WHISPER_JNI_REAL=1)
  target_include_directories(whisper_jni PRIVATE
    ${WHISPER_CPP_DIR}/include
    ${WHISPER_CPP_DIR}/ggml/include
  )
  target_link_libraries(whisper_jni whisper log android)
else()
  message(WARNING
    "whisper.cpp not found at ${WHISPER_CPP_DIR} — building whisper_jni stub. "
    "See modules/notification-listener/android/src/main/cpp/CMakeLists.txt "
    "for setup instructions.")

  add_library(whisper_jni SHARED whisper_jni.cpp)
  target_link_libraries(whisper_jni log android)
endif()
