// JNI bridge between expo.modules.notificationlistener.WhisperJNI (Kotlin)
// and whisper.cpp. See CMakeLists.txt for how WHISPER_JNI_REAL is set.

#include <jni.h>
#include <string>

#ifdef WHISPER_JNI_REAL
#include "whisper.h"
#endif

#define JNI_FN(name) \
  Java_expo_modules_notificationlistener_WhisperJNI_##name

extern "C" {

JNIEXPORT jboolean JNICALL JNI_FN(isReal)(JNIEnv *env, jobject /*thiz*/) {
#ifdef WHISPER_JNI_REAL
  return JNI_TRUE;
#else
  return JNI_FALSE;
#endif
}

JNIEXPORT jlong JNICALL JNI_FN(initContext)(JNIEnv *env, jobject /*thiz*/, jstring modelPath) {
#ifdef WHISPER_JNI_REAL
  const char *path = env->GetStringUTFChars(modelPath, nullptr);
  struct whisper_context_params cparams = whisper_context_default_params();
  struct whisper_context *ctx = whisper_init_from_file_with_params(path, cparams);
  env->ReleaseStringUTFChars(modelPath, path);
  return reinterpret_cast<jlong>(ctx);
#else
  (void)modelPath;
  return 0;
#endif
}

JNIEXPORT void JNICALL JNI_FN(freeContext)(JNIEnv *env, jobject /*thiz*/, jlong contextPtr) {
#ifdef WHISPER_JNI_REAL
  if (contextPtr == 0) return;
  whisper_free(reinterpret_cast<struct whisper_context *>(contextPtr));
#else
  (void)contextPtr;
#endif
}

JNIEXPORT jint JNICALL JNI_FN(fullTranscribe)(
    JNIEnv *env, jobject /*thiz*/, jlong contextPtr, jint numThreads,
    jfloatArray audioData, jstring language) {
#ifdef WHISPER_JNI_REAL
  if (contextPtr == 0) return -1;
  auto *ctx = reinterpret_cast<struct whisper_context *>(contextPtr);

  jfloat *audio = env->GetFloatArrayElements(audioData, nullptr);
  jsize audioLen = env->GetArrayLength(audioData);
  const char *lang = env->GetStringUTFChars(language, nullptr);

  whisper_full_params params = whisper_full_default_params(WHISPER_SAMPLING_BEAM_SEARCH);
  params.beam_search.beam_size = 5;
  params.print_progress = false;
  params.print_special = false;
  params.print_realtime = false;
  params.print_timestamps = false;
  params.translate = false;
  params.language = lang;
  params.n_threads = numThreads;
  params.single_segment = false;

  int rc = whisper_full(ctx, params, audio, audioLen);

  env->ReleaseStringUTFChars(language, lang);
  env->ReleaseFloatArrayElements(audioData, audio, JNI_ABORT);
  return rc;
#else
  (void)contextPtr;
  (void)numThreads;
  (void)audioData;
  (void)language;
  return -1;
#endif
}

JNIEXPORT jint JNICALL JNI_FN(getTextSegmentCount)(JNIEnv *env, jobject /*thiz*/, jlong contextPtr) {
#ifdef WHISPER_JNI_REAL
  if (contextPtr == 0) return 0;
  auto *ctx = reinterpret_cast<struct whisper_context *>(contextPtr);
  return whisper_full_n_segments(ctx);
#else
  (void)contextPtr;
  return 0;
#endif
}

JNIEXPORT jstring JNICALL JNI_FN(getTextSegment)(JNIEnv *env, jobject /*thiz*/, jlong contextPtr, jint index) {
#ifdef WHISPER_JNI_REAL
  if (contextPtr == 0) return env->NewStringUTF("");
  auto *ctx = reinterpret_cast<struct whisper_context *>(contextPtr);
  const char *text = whisper_full_get_segment_text(ctx, index);
  return env->NewStringUTF(text ? text : "");
#else
  (void)contextPtr;
  (void)index;
  return env->NewStringUTF("");
#endif
}

}  // extern "C"
