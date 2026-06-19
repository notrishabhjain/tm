# Builds the whisper_jni native library used for in-app, on-device call
# transcription.
#
# whisper.cpp's source is NOT vendored in this repo (it's a large separate
# project with its own license). Instead, this CMake project clones it
# automatically at configure time, so EVERY build of the app — including the
# CI/release APK you install on your phone — already contains the real
# on-device transcription engine. No manual setup or computer is required.
#
# If the automatic clone fails (e.g. no network during the build), the project
# falls back to building a stub whisper_jni.so so the app still compiles and
# runs — WhisperJNI.isReal() returns false and the in-app screen reports the
# engine as unavailable until a build with network access succeeds.

cmake_minimum_required(VERSION 3.22)
project(whisper_jni)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

set(WHISPER_CPP_DIR ${CMAKE_CURRENT_SOURCE_DIR}/whisper.cpp)

# Auto-clone whisper.cpp at configure time if it isn't already present.
if(NOT EXISTS ${WHISPER_CPP_DIR}/CMakeLists.txt)
  find_program(GIT_EXECUTABLE git)
  if(GIT_EXECUTABLE)
    message(STATUS "whisper.cpp not found — cloning into ${WHISPER_CPP_DIR}")
    execute_process(
      COMMAND ${GIT_EXECUTABLE} clone --depth 1 --branch v1.7.4
              https://github.com/ggerganov/whisper.cpp ${WHISPER_CPP_DIR}
      RESULT_VARIABLE WHISPER_CLONE_RESULT
    )
    if(NOT WHISPER_CLONE_RESULT EQUAL 0)
      message(WARNING "whisper.cpp clone failed (exit ${WHISPER_CLONE_RESULT}) — building stub")
    endif()
  else()
    message(WARNING "git not found — cannot fetch whisper.cpp, building stub")
  endif()
endif()

if(EXISTS ${WHISPER_CPP_DIR}/CMakeLists.txt)
  message(STATUS "Building real whisper_jni from ${WHISPER_CPP_DIR}")

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
    "whisper.cpp unavailable — building whisper_jni stub. In-app call "
    "transcription will report the engine as not built.")

  add_library(whisper_jni SHARED whisper_jni.cpp)
  target_link_libraries(whisper_jni log android)
endif()
