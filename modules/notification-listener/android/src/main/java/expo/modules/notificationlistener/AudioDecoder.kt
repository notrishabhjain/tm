package expo.modules.notificationlistener

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.util.Log
import java.nio.ByteOrder

/**
 * Decodes a call-recording file (m4a/aac, amr, mp3, 3gp, ...) to mono 16 kHz
 * float32 PCM in -1..1. Uses MediaExtractor + MediaCodec only — no ffmpeg.
 *
 * Decoding is STREAMING with a hard output cap: each codec output buffer is
 * downmixed and resampled immediately into a pre-allocated 15-minute buffer,
 * so peak memory stays ~60 MB regardless of recording length. The previous
 * implementation buffered the entire file (a 1-hour stereo recording needed
 * ~600 MB) and died with an uncatchable-by-`Exception` OutOfMemoryError —
 * taking the whole app process, including the notification listener, with it.
 */
object AudioDecoder {
    private const val TAG = "AudioDecoder"
    private const val TARGET_SAMPLE_RATE = 16000

    /** Hard cap on decoded output — matches the ASR/LLM 15-minute analysis cap. */
    private const val MAX_OUTPUT_SECONDS = 15 * 60

    /** Audio duration in seconds from container metadata — no decode. */
    fun durationSeconds(path: String): Int? {
        val extractor = MediaExtractor()
        return try {
            extractor.setDataSource(path)
            var durationUs = -1L
            for (i in 0 until extractor.trackCount) {
                val f = extractor.getTrackFormat(i)
                if (f.getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true &&
                    f.containsKey(MediaFormat.KEY_DURATION)
                ) {
                    durationUs = f.getLong(MediaFormat.KEY_DURATION)
                    break
                }
            }
            if (durationUs > 0) (durationUs / 1_000_000L).toInt() else null
        } catch (t: Throwable) {
            null
        } finally {
            extractor.release()
        }
    }

    fun decodeToWhisperPcm(path: String): FloatArray? {
        return try {
            decodeInternal(path)
        } catch (t: Throwable) {
            // Includes OutOfMemoryError — a bad/huge file must never crash the app.
            Log.w(TAG, "Decode failed hard for $path: ${t.javaClass.simpleName}: ${t.message}")
            null
        }
    }

    private fun decodeInternal(path: String): FloatArray? {
        val extractor = MediaExtractor()
        try {
            extractor.setDataSource(path)
        } catch (e: Exception) {
            Log.w(TAG, "setDataSource failed for $path: ${e.message}")
            extractor.release()
            return null
        }

        var trackIndex = -1
        var format: MediaFormat? = null
        for (i in 0 until extractor.trackCount) {
            val f = extractor.getTrackFormat(i)
            val mime = f.getString(MediaFormat.KEY_MIME) ?: continue
            if (mime.startsWith("audio/")) {
                trackIndex = i
                format = f
                break
            }
        }
        if (trackIndex < 0 || format == null) {
            Log.w(TAG, "No audio track found in $path")
            extractor.release()
            return null
        }
        extractor.selectTrack(trackIndex)

        val mime = format.getString(MediaFormat.KEY_MIME)!!
        val sourceSampleRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
        val sourceChannels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)

        val codec = try {
            MediaCodec.createDecoderByType(mime)
        } catch (e: Exception) {
            Log.w(TAG, "No decoder for $mime: ${e.message}")
            extractor.release()
            return null
        }

        codec.configure(format, null, null, 0)
        codec.start()

        val sink = ResamplingMonoSink(sourceChannels, sourceSampleRate, MAX_OUTPUT_SECONDS)
        val bufferInfo = MediaCodec.BufferInfo()
        var sawInputEOS = false
        var sawOutputEOS = false

        try {
            while (!sawOutputEOS && !sink.isFull) {
                if (!sawInputEOS) {
                    val inIndex = codec.dequeueInputBuffer(10_000)
                    if (inIndex >= 0) {
                        val inBuffer = codec.getInputBuffer(inIndex) ?: continue
                        val sampleSize = extractor.readSampleData(inBuffer, 0)
                        if (sampleSize < 0) {
                            codec.queueInputBuffer(
                                inIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM
                            )
                            sawInputEOS = true
                        } else {
                            codec.queueInputBuffer(
                                inIndex, 0, sampleSize, extractor.sampleTime, 0
                            )
                            extractor.advance()
                        }
                    }
                }

                val outIndex = codec.dequeueOutputBuffer(bufferInfo, 10_000)
                if (outIndex >= 0) {
                    if (bufferInfo.size > 0) {
                        val outBuffer = codec.getOutputBuffer(outIndex)
                        if (outBuffer != null) {
                            outBuffer.order(ByteOrder.LITTLE_ENDIAN)
                            outBuffer.position(bufferInfo.offset)
                            outBuffer.limit(bufferInfo.offset + bufferInfo.size)
                            val shorts = ShortArray(bufferInfo.size / 2)
                            outBuffer.asShortBuffer().get(shorts)
                            sink.write(shorts)
                        }
                    }
                    codec.releaseOutputBuffer(outIndex, false)
                    if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) {
                        sawOutputEOS = true
                    }
                } else if (outIndex == MediaCodec.INFO_TRY_AGAIN_LATER && sawInputEOS) {
                    // Give the decoder a few more spins to flush before bailing.
                    if (sink.isEmpty) sawOutputEOS = true
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Decode error for $path: ${e.message}")
            return null
        } finally {
            try { codec.stop() } catch (_: Exception) {}
            try { codec.release() } catch (_: Exception) {}
            extractor.release()
        }

        if (sink.isFull) {
            Log.i(TAG, "Recording longer than ${MAX_OUTPUT_SECONDS / 60} min — analysing the first ${MAX_OUTPUT_SECONDS / 60} min")
        }
        return sink.result()
    }

    /**
     * Consumes interleaved 16-bit PCM chunks, downmixes to mono, and linearly
     * resamples to 16 kHz into a single pre-allocated output buffer. Carries
     * partial frames and the resampler position across chunk boundaries so the
     * output is identical to whole-file processing.
     */
    private class ResamplingMonoSink(
        private val channels: Int,
        sourceRate: Int,
        maxSeconds: Int
    ) {
        private val step = sourceRate.toDouble() / TARGET_SAMPLE_RATE
        private val out = FloatArray(maxSeconds * TARGET_SAMPLE_RATE)
        private var outCount = 0

        // Absolute mono-sample index of the first sample in the current chunk.
        private var absBase = 0L
        // Absolute source position (fractional) of the next output sample.
        private var pos = 0.0
        // Last mono sample of the previous chunk, for interpolation across chunks.
        private var carrySample = 0f
        // Leftover interleaved shorts that didn't complete a frame.
        private var frameRemainder = ShortArray(0)

        val isFull: Boolean get() = outCount >= out.size
        val isEmpty: Boolean get() = outCount == 0 && absBase == 0L

        fun write(shorts: ShortArray) {
            if (isFull) return
            val data = if (frameRemainder.isEmpty()) shorts else frameRemainder + shorts
            val frames = data.size / channels
            if (frames == 0) { frameRemainder = data; return }
            frameRemainder = data.copyOfRange(frames * channels, data.size)

            val mono = FloatArray(frames)
            if (channels == 1) {
                for (i in 0 until frames) mono[i] = data[i] / 32768.0f
            } else {
                for (i in 0 until frames) {
                    var sum = 0
                    for (c in 0 until channels) sum += data[i * channels + c]
                    mono[i] = (sum / channels) / 32768.0f
                }
            }

            val absEnd = absBase + frames
            // Emit every output sample whose interpolation window [i, i+1] is available.
            while (outCount < out.size && pos + 1 < absEnd) {
                val i = pos.toLong()
                val frac = (pos - i).toFloat()
                val a = if (i < absBase) carrySample else mono[(i - absBase).toInt()]
                val b = mono[(i + 1 - absBase).toInt()]
                out[outCount++] = a + (b - a) * frac
                pos += step
            }
            carrySample = mono[frames - 1]
            absBase = absEnd
        }

        fun result(): FloatArray? {
            if (outCount == 0) return null
            return if (outCount == out.size) out else out.copyOf(outCount)
        }
    }
}
