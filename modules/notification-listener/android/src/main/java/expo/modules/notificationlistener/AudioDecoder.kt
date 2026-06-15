package expo.modules.notificationlistener

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.util.Log
import java.nio.ByteOrder

/**
 * Decodes a call-recording file (m4a/aac, amr, 3gp, ...) to mono 16 kHz
 * float32 PCM in -1..1, the format whisper.cpp expects. Uses MediaExtractor
 * + MediaCodec only — no ffmpeg dependency.
 */
object AudioDecoder {
    private const val TAG = "AudioDecoder"
    private const val TARGET_SAMPLE_RATE = 16000

    fun decodeToWhisperPcm(path: String): FloatArray? {
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

        val pcmChunks = mutableListOf<ShortArray>()
        val bufferInfo = MediaCodec.BufferInfo()
        var sawInputEOS = false
        var sawOutputEOS = false

        try {
            while (!sawOutputEOS) {
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
                            pcmChunks.add(shorts)
                        }
                    }
                    codec.releaseOutputBuffer(outIndex, false)
                    if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) {
                        sawOutputEOS = true
                    }
                } else if (outIndex == MediaCodec.INFO_TRY_AGAIN_LATER && sawInputEOS) {
                    // Give the decoder a few more spins to flush before bailing.
                    if (pcmChunks.isEmpty()) sawOutputEOS = true
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Decode error for $path: ${e.message}")
            return null
        } finally {
            codec.stop()
            codec.release()
            extractor.release()
        }

        if (pcmChunks.isEmpty()) return null

        val totalSamples = pcmChunks.sumOf { it.size }
        val interleaved = ShortArray(totalSamples)
        var offset = 0
        for (chunk in pcmChunks) {
            System.arraycopy(chunk, 0, interleaved, offset, chunk.size)
            offset += chunk.size
        }

        val mono = downmixToMono(interleaved, sourceChannels)
        return resampleTo16k(mono, sourceSampleRate)
    }

    private fun downmixToMono(interleaved: ShortArray, channels: Int): FloatArray {
        if (channels <= 1) {
            return FloatArray(interleaved.size) { interleaved[it] / 32768.0f }
        }
        val frames = interleaved.size / channels
        val mono = FloatArray(frames)
        for (i in 0 until frames) {
            var sum = 0
            for (c in 0 until channels) {
                sum += interleaved[i * channels + c]
            }
            mono[i] = (sum / channels) / 32768.0f
        }
        return mono
    }

    private fun resampleTo16k(samples: FloatArray, sourceRate: Int): FloatArray {
        if (sourceRate == TARGET_SAMPLE_RATE || samples.isEmpty()) return samples

        val ratio = TARGET_SAMPLE_RATE.toDouble() / sourceRate.toDouble()
        val outLength = (samples.size * ratio).toInt()
        val out = FloatArray(outLength)
        for (i in 0 until outLength) {
            val srcPos = i / ratio
            val srcIndex = srcPos.toInt()
            val frac = (srcPos - srcIndex).toFloat()
            val a = samples[srcIndex.coerceIn(0, samples.size - 1)]
            val b = samples[(srcIndex + 1).coerceIn(0, samples.size - 1)]
            out[i] = a + (b - a) * frac
        }
        return out
    }
}
