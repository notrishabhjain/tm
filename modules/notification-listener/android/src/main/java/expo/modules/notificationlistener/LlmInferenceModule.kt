package expo.modules.notificationlistener

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import ai.onnxruntime.genai.Generator
import ai.onnxruntime.genai.GeneratorParams
import ai.onnxruntime.genai.Model
import ai.onnxruntime.genai.Tokenizer
import ai.onnxruntime.genai.TokenizerStream

/**
 * Expo native module for on-device LLM inference via ONNX Runtime GenAI.
 * Targets Qwen3-1.7B INT4 ONNX (onnx-community/Qwen3-1.7B-ONNX) for
 * task extraction from screenshots and meeting transcripts.
 * Model is loaded lazily and persists in memory until unloadModel() is called.
 */
class LlmInferenceModule : Module() {

    @Volatile private var model: Model? = null
    @Volatile private var tokenizer: Tokenizer? = null

    override fun definition() = ModuleDefinition {
        Name("LlmInference")

        OnDestroy {
            closeLlm()
        }

        // Synchronous check — safe to call from any thread
        Function("isModelLoaded") {
            model != null
        }

        // Loads the model from a local directory containing genai_config.json + model files.
        // Blocks the calling coroutine (Expo SDK dispatches AsyncFunction on a background thread).
        AsyncFunction("loadModel") { modelDir: String ->
            if (model != null) return@AsyncFunction
            val m = Model(modelDir)
            val t = Tokenizer(m)
            model = m
            tokenizer = t
        }

        // Runs inference with a system + user prompt using the Qwen3 ChatML template.
        // Returns only the assistant's reply text (input prompt is stripped).
        AsyncFunction("generate") { systemPrompt: String, userPrompt: String, maxNewTokens: Int ->
            val m = model ?: error("LLM model not loaded — call loadModel() first")
            val tok = tokenizer ?: error("LLM tokenizer not ready")

            val prompt = buildChatPrompt(systemPrompt, userPrompt)
            val sequences = tok.encode(prompt)
            val inputLen = sequences.getSequence(0).size

            val params = GeneratorParams(m)
            params.setInput(sequences)
            params.setSearchOption("max_length", (inputLen + maxNewTokens).toLong())
            params.setSearchOption("temperature", 0.1)

            val generator = Generator(m, params)
            val stream: TokenizerStream = tok.createStream()
            val sb = StringBuilder()
            var processedLen = inputLen

            while (!generator.isDone()) {
                generator.computeLogits()
                generator.generateNextToken()
                val tokens = generator.getSequence(0)
                if (tokens.size > processedLen) {
                    sb.append(stream.decode(tokens[processedLen]))
                    processedLen = tokens.size
                }
            }

            tryClose(generator)
            tryClose(params)
            tryClose(sequences)
            tryClose(stream)

            sb.toString().trim()
        }

        Function("unloadModel") {
            closeLlm()
        }
    }

    private fun closeLlm() {
        tryClose(tokenizer)
        tryClose(model)
        tokenizer = null
        model = null
    }

    /** Swallow close() errors — not all genai versions implement AutoCloseable cleanly. */
    private fun tryClose(obj: Any?) {
        try {
            (obj as? AutoCloseable)?.close()
        } catch (_: Exception) {}
    }

    // Qwen3 ChatML template; thinking mode disabled (no /think tag).
    private fun buildChatPrompt(systemPrompt: String, userPrompt: String): String =
        "<|im_start|>system\n$systemPrompt<|im_end|>\n" +
        "<|im_start|>user\n$userPrompt<|im_end|>\n" +
        "<|im_start|>assistant\n"
}
