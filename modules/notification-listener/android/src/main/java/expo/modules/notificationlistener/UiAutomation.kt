package expo.modules.notificationlistener

import android.view.accessibility.AccessibilityNodeInfo

/**
 * Primitives for driving another app's UI through an AccessibilityService —
 * the same mechanism MacroDroid and Tasker/AutoInput use.
 *
 * This exists because the HyperOS Recorder exposes no share, no export and no
 * readable transcript file: the only way to get the text out is to press the
 * buttons a human would press. Automating that is legitimate on the user's own
 * device, but it is inherently brittle — it depends on another app's layout,
 * which can change with any update — so everything here is written to fail
 * loudly and recoverably rather than to press whatever happens to be nearby.
 *
 * Two rules the rest of the automation depends on:
 *  - A matcher never guesses. If nothing matches, the step fails and the run
 *    stops, rather than falling back to "tap the first clickable thing".
 *  - Every node obtained here is recycled by the caller via [use], because a
 *    leaked AccessibilityNodeInfo degrades the whole system's accessibility.
 */
object UiAutomation {

    /** How a step identifies the node it wants. */
    data class Matcher(
        /** Visible label. Matched case-insensitively. */
        val text: List<String> = emptyList(),
        /** Content description — used for icon-only buttons like the ⋮ menu. */
        val contentDesc: List<String> = emptyList(),
        /** Fully-qualified view id, when known: "com.pkg:id/some_button". */
        val viewId: String? = null,
        /** Class name fragment, e.g. "Button", used to disambiguate. */
        val className: String? = null,
        /** When true, a candidate must be (or contain) something clickable. */
        val mustBeClickable: Boolean = true,
        /** Substring match instead of equality — needed for localised labels. */
        val contains: Boolean = true,
    ) {
        fun describe(): String = buildString {
            if (text.isNotEmpty()) append("text=${text.joinToString("|")} ")
            if (contentDesc.isNotEmpty()) append("desc=${contentDesc.joinToString("|")} ")
            viewId?.let { append("id=$it ") }
            className?.let { append("class=$it ") }
        }.trim().ifEmpty { "<empty matcher>" }
    }

    /** Depth-first search for the first node satisfying [matcher]. */
    fun find(root: AccessibilityNodeInfo?, matcher: Matcher): AccessibilityNodeInfo? {
        if (root == null) return null
        val queue = ArrayDeque<AccessibilityNodeInfo>()
        queue.add(root)
        var examined = 0
        while (queue.isNotEmpty() && examined < MAX_NODES) {
            val node = queue.removeFirst()
            examined++
            if (matches(node, matcher)) {
                val target = if (matcher.mustBeClickable) clickableSelfOrAncestor(node) else node
                if (target != null) return target
            }
            for (i in 0 until node.childCount) {
                node.getChild(i)?.let { queue.add(it) }
            }
        }
        return null
    }

    private const val MAX_NODES = 4000

    private fun matches(node: AccessibilityNodeInfo, m: Matcher): Boolean {
        m.viewId?.let { wanted ->
            if (node.viewIdResourceName != wanted) return false
        }
        m.className?.let { wanted ->
            val cls = node.className?.toString() ?: return false
            if (!cls.contains(wanted, ignoreCase = true)) return false
        }

        // With no text/desc constraint, an id or class match alone is enough.
        if (m.text.isEmpty() && m.contentDesc.isEmpty()) {
            return m.viewId != null || m.className != null
        }

        val nodeText = node.text?.toString()?.trim().orEmpty()
        val nodeDesc = node.contentDescription?.toString()?.trim().orEmpty()

        val textHit = m.text.any { candidate -> softMatch(nodeText, candidate, m.contains) }
        val descHit = m.contentDesc.any { candidate -> softMatch(nodeDesc, candidate, m.contains) }
        return textHit || descHit
    }

    private fun softMatch(actual: String, candidate: String, contains: Boolean): Boolean {
        if (actual.isEmpty() || candidate.isEmpty()) return false
        return if (contains) {
            actual.contains(candidate, ignoreCase = true)
        } else {
            actual.equals(candidate, ignoreCase = true)
        }
    }

    /**
     * The visible label and the clickable element are frequently different
     * nodes: a TextView inside a clickable row. Walk up a bounded number of
     * levels to find the thing that can actually be pressed.
     */
    fun clickableSelfOrAncestor(node: AccessibilityNodeInfo?): AccessibilityNodeInfo? {
        var current = node
        var depth = 0
        while (current != null && depth < 6) {
            if (current.isClickable && current.isEnabled) return current
            current = current.parent
            depth++
        }
        return null
    }

    /** Clicks [node]; returns false when the node refuses the action. */
    fun click(node: AccessibilityNodeInfo?): Boolean {
        if (node == null || !node.isEnabled) return false
        return node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
    }

    /** Scrolls the first scrollable container found under [root] forward. */
    fun scrollForward(root: AccessibilityNodeInfo?): Boolean {
        val scrollable = findScrollable(root) ?: return false
        return scrollable.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD)
    }

    private fun findScrollable(root: AccessibilityNodeInfo?): AccessibilityNodeInfo? {
        if (root == null) return null
        val queue = ArrayDeque<AccessibilityNodeInfo>()
        queue.add(root)
        var examined = 0
        while (queue.isNotEmpty() && examined < MAX_NODES) {
            val node = queue.removeFirst()
            examined++
            if (node.isScrollable) return node
            for (i in 0 until node.childCount) node.getChild(i)?.let { queue.add(it) }
        }
        return null
    }

    /**
     * Flattens the node tree into inspectable rows.
     *
     * This is the tool that makes the rest of the automation writable: another
     * app's labels, view ids and structure cannot be guessed from outside, so a
     * script written without this is fiction. Run it on the real screen, read
     * what is actually there, then write matchers against it.
     */
    fun dump(root: AccessibilityNodeInfo?, limit: Int = 250): List<Map<String, Any>> {
        val out = mutableListOf<Map<String, Any>>()
        if (root == null) return out

        fun walk(node: AccessibilityNodeInfo, depth: Int) {
            if (out.size >= limit) return
            val text = node.text?.toString()?.trim().orEmpty()
            val desc = node.contentDescription?.toString()?.trim().orEmpty()
            val id = node.viewIdResourceName.orEmpty()
            // Structural nodes with no identity are noise in a dump the user has
            // to read; keep only what a matcher could actually target.
            if (text.isNotEmpty() || desc.isNotEmpty() || id.isNotEmpty() || node.isClickable) {
                out += mapOf(
                    "depth" to depth,
                    "text" to text,
                    "desc" to desc,
                    "viewId" to id,
                    "class" to (node.className?.toString() ?: ""),
                    "clickable" to node.isClickable,
                    "scrollable" to node.isScrollable,
                    "enabled" to node.isEnabled
                )
            }
            for (i in 0 until node.childCount) {
                node.getChild(i)?.let { walk(it, depth + 1) }
            }
        }
        walk(root, 0)
        return out
    }

    /**
     * Collects visible text under [root], in document order.
     * Used to read a transcript straight off the screen when the app offers no
     * other way out, and to detect completion strings.
     */
    fun collectText(root: AccessibilityNodeInfo?, limit: Int = 4000): List<String> {
        val out = mutableListOf<String>()
        if (root == null) return out

        fun walk(node: AccessibilityNodeInfo) {
            if (out.size >= limit) return
            node.text?.toString()?.trim()?.let { if (it.isNotEmpty()) out += it }
            for (i in 0 until node.childCount) node.getChild(i)?.let { walk(it) }
        }
        walk(root)
        return out
    }
}
