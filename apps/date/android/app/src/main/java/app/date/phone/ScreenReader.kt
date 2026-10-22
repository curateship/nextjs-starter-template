package app.date.phone

import android.graphics.Rect
import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONArray
import org.json.JSONObject

/**
 * Reads the screen as a flat list of labelled boxes, in the order they sit in
 * the app's own layout, for the server's Tinder walks to search.
 *
 * Each box gets an id, "n0", "n1" and so on, that means something only until
 * the next read. The last read's boxes are kept, so a tap or typing can name
 * a box by id instead of a position.
 */
class ScreenReader {

    class Box(val bounds: Rect, val node: AccessibilityNodeInfo)

    @Volatile
    private var lastBoxes: Map<String, Box> = emptyMap()

    /** A box from the last read, or null when there is no such box. */
    fun box(id: String): Box? = lastBoxes[id]

    /**
     * The screen under [root], the active window's top box. Boxes the person
     * cannot see are left out with everything inside them, and the list stops
     * at [MAX_NODES], saying so in `truncated`.
     */
    fun read(root: AccessibilityNodeInfo?, screenWidth: Int, screenHeight: Int): JSONObject {
        val nodes = JSONArray()
        val boxes = HashMap<String, Box>()
        var truncated = false
        if (root != null) {
            val stack = ArrayDeque<Pair<AccessibilityNodeInfo, Int>>()
            stack.addLast(root to 0)
            while (stack.isNotEmpty()) {
                val (node, depth) = stack.removeLast()
                if (!node.isVisibleToUser) continue
                if (boxes.size >= MAX_NODES) {
                    truncated = true
                    break
                }
                val id = "n${boxes.size}"
                val bounds = Rect()
                node.getBoundsInScreen(bounds)
                boxes[id] = Box(bounds, node)
                nodes.put(describe(id, depth, node, bounds))
                // Children go on in reverse, so they come off in the layout's own order.
                for (index in node.childCount - 1 downTo 0) {
                    node.getChild(index)?.let { stack.addLast(it to depth + 1) }
                }
            }
        }
        lastBoxes = boxes
        return JSONObject()
            .put("package", root?.packageName?.toString() ?: "")
            .put("screenWidth", screenWidth)
            .put("screenHeight", screenHeight)
            .put("nodes", nodes)
            .put("truncated", truncated)
    }

    private fun describe(id: String, depth: Int, node: AccessibilityNodeInfo, bounds: Rect): JSONObject =
        JSONObject()
            .put("id", id)
            .put("depth", depth)
            // An empty box reports its grey hint as its words; it has none of its own.
            .put("text", if (node.isShowingHintText) "" else node.text?.toString() ?: "")
            .put("desc", node.contentDescription?.toString() ?: "")
            // An empty box's grey words, such as "Type a message". Not every box has them.
            .put("hint", node.hintText?.toString() ?: "")
            .put("cls", node.className?.toString()?.substringAfterLast('.') ?: "")
            .put("res", node.viewIdResourceName ?: "")
            .put("bounds", JSONArray().put(bounds.left).put(bounds.top).put(bounds.right).put(bounds.bottom))
            .put("click", node.isClickable)
            .put("scroll", node.isScrollable)
            .put("edit", node.isEditable)
            .put("selected", node.isSelected)
            .put("checked", node.isChecked)

    companion object {
        /** The server keeps at most this many boxes of one screen. */
        const val MAX_NODES = 1500
    }
}
