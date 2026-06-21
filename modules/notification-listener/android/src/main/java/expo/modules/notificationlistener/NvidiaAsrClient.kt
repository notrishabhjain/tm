package expo.modules.notificationlistener

import android.util.Log
import io.grpc.CallOptions
import io.grpc.ClientInterceptors
import io.grpc.ManagedChannelBuilder
import io.grpc.Metadata
import io.grpc.MethodDescriptor
import io.grpc.stub.ClientCalls
import io.grpc.stub.MetadataUtils
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.util.concurrent.TimeUnit

/**
 * Sends call-recording audio to NVIDIA's hosted Whisper Large V3 via gRPC and
 * returns the transcript.
 *
 * NVIDIA's cloud ASR (build.nvidia.com free tier) is gRPC only — there is no
 * REST endpoint. The service is reached through NVIDIA Cloud Functions (NVCF)
 * at grpc.nvcf.nvidia.com:443 with two metadata headers: the function-id that
 * selects the model, and a Bearer nvapi- key. The Riva ASR service/method is
 * nvidia.riva.asr.RivaSpeechRecognition/Recognize.
 *
 * Protobuf messages are encoded/decoded by hand to avoid a protoc compile step.
 */
object NvidiaAsrClient {
    private const val TAG = "NvidiaAsrClient"
    const val HOST = "grpc.nvcf.nvidia.com"
    const val PORT = 443
    // function-id for openai/whisper-large-v3 on build.nvidia.com
    private const val FUNCTION_ID = "b702f636-f60c-4a3d-a6f4-f3568c13bd7d"
    // Full Riva ASR offline-recognize method.
    private const val METHOD = "nvidia.riva.asr.RivaSpeechRecognition/Recognize"
    private const val SAMPLE_RATE = 16000
    // 60 s is generous for a cloud ASR call; the old 180 s caused the UI to hang for 3 minutes.
    private const val TIMEOUT_SECONDS = 60L
    // Cap audio at 15 minutes — longer calls are truncated so the gRPC payload stays manageable
    // and we don't risk OOM on low-RAM devices.
    private const val MAX_AUDIO_SAMPLES = 15 * 60 * SAMPLE_RATE

    private val KEY_AUTH = Metadata.Key.of("authorization", Metadata.ASCII_STRING_MARSHALLER)
    private val KEY_FUNC = Metadata.Key.of("function-id", Metadata.ASCII_STRING_MARSHALLER)

    sealed class Result {
        data class Success(val text: String) : Result()
        data class Error(val message: String) : Result()
        object NoApiKey : Result()
    }

    /**
     * Transcribes the given PCM audio (16 kHz mono, range −1..1; see AudioDecoder).
     * [language] is a Whisper language code, or "multi" for auto-detect (best for
     * Hindi/Hinglish code-switching). Blocks until the response arrives or the
     * deadline expires — must be called off the main thread.
     */
    fun transcribe(apiKey: String, pcm: FloatArray, language: String = "multi"): Result {
        if (apiKey.isBlank()) return Result.NoApiKey
        return try {
            val clipped = if (pcm.size > MAX_AUDIO_SAMPLES) {
                Log.i(TAG, "Audio truncated from ${pcm.size / SAMPLE_RATE}s to ${MAX_AUDIO_SAMPLES / SAMPLE_RATE / 60}min")
                pcm.copyOf(MAX_AUDIO_SAMPLES)
            } else pcm
            val wavBytes = pcm16ToWav(floatToPcm16Le(clipped), SAMPLE_RATE)
            val requestBytes = encodeRecognizeRequest(wavBytes, language)

            val headers = Metadata().also {
                it.put(KEY_AUTH, "Bearer $apiKey")
                it.put(KEY_FUNC, FUNCTION_ID)
            }

            val channel = ManagedChannelBuilder.forAddress(HOST, PORT)
                .useTransportSecurity()
                .build()

            try {
                val methodDesc = MethodDescriptor.newBuilder<ByteArray, ByteArray>()
                    .setType(MethodDescriptor.MethodType.UNARY)
                    .setFullMethodName(METHOD)
                    .setRequestMarshaller(ByteArrayMarshaller)
                    .setResponseMarshaller(ByteArrayMarshaller)
                    .build()

                val ch = ClientInterceptors.intercept(
                    channel,
                    MetadataUtils.newAttachHeadersInterceptor(headers)
                )

                val callOpts = CallOptions.DEFAULT
                    .withDeadlineAfter(TIMEOUT_SECONDS, TimeUnit.SECONDS)

                val responseBytes = ClientCalls.blockingUnaryCall(ch, methodDesc, callOpts, requestBytes)
                val transcript = decodeRecognizeResponse(responseBytes)
                if (transcript.isNullOrBlank()) Result.Error("Empty transcript (silent or unintelligible audio)")
                else Result.Success(transcript.trim())
            } finally {
                channel.shutdown().awaitTermination(5, TimeUnit.SECONDS)
            }
        } catch (e: Exception) {
            Log.w(TAG, "NVIDIA ASR error: ${e.javaClass.simpleName}: ${e.message}")
            Result.Error("${e.javaClass.simpleName}: ${e.message}")
        }
    }

    /** Converts FloatArray (−1..1) to little-endian signed 16-bit PCM. */
    private fun floatToPcm16Le(samples: FloatArray): ByteArray {
        val out = ByteArray(samples.size * 2)
        for (i in samples.indices) {
            val s = (samples[i].coerceIn(-1f, 1f) * 32767f).toInt().toShort()
            out[i * 2] = (s.toInt() and 0xFF).toByte()
            out[i * 2 + 1] = ((s.toInt() ushr 8) and 0xFF).toByte()
        }
        return out
    }

    /** Wraps mono 16-bit PCM in a minimal 44-byte WAV (RIFF) container. */
    private fun pcm16ToWav(pcm: ByteArray, sampleRate: Int): ByteArray {
        val channels = 1
        val bitsPerSample = 16
        val byteRate = sampleRate * channels * bitsPerSample / 8
        val blockAlign = channels * bitsPerSample / 8
        val dataLen = pcm.size
        val out = ByteArrayOutputStream(44 + dataLen)

        fun writeStr(s: String) = out.write(s.toByteArray(Charsets.US_ASCII))
        fun writeIntLe(v: Int) {
            out.write(v and 0xFF); out.write((v ushr 8) and 0xFF)
            out.write((v ushr 16) and 0xFF); out.write((v ushr 24) and 0xFF)
        }
        fun writeShortLe(v: Int) { out.write(v and 0xFF); out.write((v ushr 8) and 0xFF) }

        writeStr("RIFF"); writeIntLe(36 + dataLen); writeStr("WAVE")
        writeStr("fmt "); writeIntLe(16); writeShortLe(1) // PCM
        writeShortLe(channels); writeIntLe(sampleRate); writeIntLe(byteRate)
        writeShortLe(blockAlign); writeShortLe(bitsPerSample)
        writeStr("data"); writeIntLe(dataLen); out.write(pcm)
        return out.toByteArray()
    }

    /**
     * Encodes RecognizeRequest:
     *   RecognitionConfig { AudioEncoding encoding=1; int32 sample_rate_hertz=2;
     *                       string language_code=3; int32 max_alternatives=4; }
     *   RecognizeRequest  { RecognitionConfig config=1; bytes audio=2; }
     */
    private fun encodeRecognizeRequest(audio: ByteArray, language: String): ByteArray {
        val configBytes = ByteArrayOutputStream().also { buf ->
            // field 1 (encoding = LINEAR_PCM = 1): varint
            buf.writeTag(1, 0); buf.writeVarint(1)
            // field 2 (sample_rate_hertz): varint
            buf.writeTag(2, 0); buf.writeVarint(SAMPLE_RATE)
            // field 3 (language_code): length-delimited
            val lang = language.toByteArray(Charsets.UTF_8)
            buf.writeTag(3, 2); buf.writeVarint(lang.size); buf.write(lang)
            // field 4 (max_alternatives = 1): varint
            buf.writeTag(4, 0); buf.writeVarint(1)
        }.toByteArray()

        return ByteArrayOutputStream().also { buf ->
            // field 1 (config): embedded message
            buf.writeTag(1, 2); buf.writeVarint(configBytes.size); buf.write(configBytes)
            // field 2 (audio): bytes
            buf.writeTag(2, 2); buf.writeVarint(audio.size); buf.write(audio)
        }.toByteArray()
    }

    /**
     * Decodes RecognizeResponse and concatenates the best-alternative transcripts.
     *   RecognizeResponse           { repeated SpeechRecognitionResult results=1; }
     *   SpeechRecognitionResult     { repeated SpeechRecognitionAlternative alternatives=1; }
     *   SpeechRecognitionAlternative{ string transcript=1; float confidence=2; }
     */
    private fun decodeRecognizeResponse(bytes: ByteArray): String? {
        val sb = StringBuilder()
        val r = ProtoReader(bytes)
        while (!r.atEnd()) {
            val (field, wire) = r.readTag()
            if (field == 1 && wire == 2) {
                val result = ProtoReader(r.readLengthDelimited())
                while (!result.atEnd()) {
                    val (rf, rw) = result.readTag()
                    if (rf == 1 && rw == 2) {
                        val alt = ProtoReader(result.readLengthDelimited())
                        while (!alt.atEnd()) {
                            val (af, aw) = alt.readTag()
                            if (af == 1 && aw == 2) {
                                sb.append(alt.readString())
                                break
                            } else {
                                alt.skip(aw)
                            }
                        }
                        break // only first alternative per result
                    } else {
                        result.skip(rw)
                    }
                }
            } else {
                r.skip(wire)
            }
        }
        return sb.toString().trim().takeIf { it.isNotEmpty() }
    }

    // ── Minimal protobuf helpers ──────────────────────────────────────────────

    private class ProtoReader(private val data: ByteArray, private var pos: Int = 0) {
        fun atEnd() = pos >= data.size

        fun readVarint(): Long {
            var result = 0L
            var shift = 0
            while (pos < data.size) {
                val b = data[pos++].toLong() and 0xFF
                result = result or ((b and 0x7F) shl shift)
                if (b and 0x80 == 0L) break
                shift += 7
            }
            return result
        }

        fun readLengthDelimited(): ByteArray {
            val len = readVarint().toInt()
            val out = data.copyOfRange(pos, pos + len)
            pos += len
            return out
        }

        fun readString(): String = readLengthDelimited().toString(Charsets.UTF_8)

        fun readTag(): Pair<Int, Int> {
            val tag = readVarint()
            return ((tag ushr 3).toInt()) to (tag and 7L).toInt()
        }

        fun skip(wireType: Int) {
            when (wireType) {
                0 -> readVarint()
                1 -> pos += 8
                2 -> readLengthDelimited()
                5 -> pos += 4
            }
        }
    }

    private fun ByteArrayOutputStream.writeTag(fieldNumber: Int, wireType: Int) =
        writeVarint((fieldNumber shl 3) or wireType)

    private fun ByteArrayOutputStream.writeVarint(value: Int) {
        var v = value
        while (v and 0x7F.inv() != 0) {
            write((v and 0x7F) or 0x80)
            v = v ushr 7
        }
        write(v)
    }

    private object ByteArrayMarshaller : MethodDescriptor.Marshaller<ByteArray> {
        override fun stream(value: ByteArray): InputStream = value.inputStream()
        override fun parse(stream: InputStream): ByteArray = stream.readBytes()
    }
}
