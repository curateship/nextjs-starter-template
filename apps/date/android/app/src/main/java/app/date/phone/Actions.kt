package app.date.phone

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Intent
import android.graphics.Path
import android.os.Bundle
import android.view.accessibility.AccessibilityNodeInfo
import kotlin.coroutines.resume
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import org.json.JSONObject

/**
 * Runs one plain action the server handed the phone: open an app, read the
 * screen, tap, swipe, type, back, home or take a picture. Everything that
 * knows what Tinder looks like is on the server; this only does what it is
 * told and says what happened, in words when it could not.
 *
 * The kinds and their payloads are listed in `apps/date/src/lib/dating/options.ts`
 * and described in `apps/date/workspace/docs/phone/phone-link.md`.
 */
class ActionRunner(private val service: DateAccessibilityService) {

    class Outcome(val ok: Boolean, val answer: JSONObject?, val error: String, val screenshot: String?)

    /** A step that could not be done, with the reason in words for the dashboard. */
    private class StepFailed(message: String) : Exception(message)

    suspend fun run(action: JSONObject): Outcome {
        val kind = action.optString("kind")
        val payload = action.optJSONObject("payload") ?: JSONObject()
        val limit = action.optInt("timeLimitSeconds", 30).coerceIn(1, 600)
        return try {
            withTimeout(limit * 1000L) { perform(kind, payload) }
        } catch (timeout: TimeoutCancellationException) {
            Outcome(false, null, "Took longer than $limit seconds on the phone.", null)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failed: StepFailed) {
            Outcome(false, null, failed.message ?: "The phone could not do that.", null)
        } catch (error: Exception) {
            Outcome(false, null, "The phone could not do that: ${error.message ?: error.javaClass.simpleName}.", null)
        }
    }

    private suspend fun perform(kind: String, payload: JSONObject): Outcome = when (kind) {
        "open-app" -> openApp(payload)
        "read-screen" -> {
            val (screen, picture) = readWithPicture()
            Outcome(true, JSONObject().put("screen", screen), "", picture)
        }
        "tap" -> {
            val (x, y) = point(payload)
            tap(x, y)
            finish(payload, JSONObject())
        }
        "swipe" -> {
            swipe(payload)
            finish(payload, JSONObject())
        }
        "type" -> {
            type(payload)
            finish(payload, JSONObject())
        }
        "back" -> {
            global(AccessibilityService.GLOBAL_ACTION_BACK, "press back")
            finish(payload, JSONObject())
        }
        "home" -> {
            global(AccessibilityService.GLOBAL_ACTION_HOME, "go to the home screen")
            finish(payload, JSONObject())
        }
        "screenshot" -> screenshot()
        else -> throw StepFailed("This phone does not know how to \"$kind\". Update the Date app on the phone.")
    }

    /**
     * After acting, a step may ask to see the result: wait for the screen to
     * settle, then read it and take its picture in the same answer, which
     * saves the server a second round trip.
     */
    private suspend fun finish(payload: JSONObject, answer: JSONObject): Outcome {
        if (!payload.optBoolean("thenRead", false)) return Outcome(true, answer, "", null)
        delay(payload.optLong("settleMs", DEFAULT_SETTLE_MS).coerceIn(0L, MAX_SETTLE_MS))
        val (screen, picture) = readWithPicture()
        answer.put("screen", screen)
        return Outcome(true, answer, "", picture)
    }

    private suspend fun openApp(payload: JSONObject): Outcome {
        val packageName = payload.optString("package").trim()
        if (packageName.isEmpty()) throw StepFailed("No app was named to open.")
        val answer = JSONObject()
        if (!DeviceInfo.isInstalled(service, packageName)) {
            // Not installed is an answer, not a failure: the server decides what it means.
            answer.put("installed", false).put("opened", false)
            return finish(payload, answer)
        }
        val intent = service.packageManager.getLaunchIntentForPackage(packageName)
        if (intent == null) {
            answer.put("installed", true).put("opened", false)
            return finish(payload, answer)
        }
        // The same as tapping its icon: an app already open comes back where it was.
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        withContext(Dispatchers.Main) { service.startActivity(intent) }
        answer.put("installed", true).put("opened", true)
        return finish(payload, answer)
    }

    private suspend fun readScreen(): JSONObject {
        val (width, height) = Screenshots.displaySize(service)
        // Between two screens there can be a moment with no window to read.
        var root = service.rootInActiveWindow
        var tries = 0
        while (root == null && tries < ROOT_TRIES) {
            delay(ROOT_WAIT_MS)
            root = service.rootInActiveWindow
            tries += 1
        }
        return service.reader.read(root, width, height)
    }

    private suspend fun readWithPicture(): Pair<JSONObject, String> {
        val screen = readScreen()
        val bitmap = service.screenshots.capture()
        try {
            return screen to Screenshots.encode(bitmap, ACTION_PICTURE_WIDTH, ACTION_PICTURE_QUALITY).base64
        } finally {
            bitmap.recycle()
        }
    }

    private suspend fun screenshot(): Outcome {
        val bitmap = service.screenshots.capture()
        try {
            val encoded = Screenshots.encode(bitmap, ACTION_PICTURE_WIDTH, ACTION_PICTURE_QUALITY)
            val answer = JSONObject().put("screenWidth", bitmap.width).put("screenHeight", bitmap.height)
            return Outcome(true, answer, "", encoded.base64)
        } finally {
            bitmap.recycle()
        }
    }

    /** Where a tap goes: a box from the last reading of the screen, or a place given in screen pixels. */
    private fun point(payload: JSONObject): Pair<Float, Float> {
        val nodeId = payload.optString("node").trim()
        if (nodeId.isNotEmpty()) {
            val box = service.reader.box(nodeId)
                ?: throw StepFailed("Box $nodeId is not on the last reading of the screen. Read the screen again first.")
            return box.bounds.exactCenterX() to box.bounds.exactCenterY()
        }
        return number(payload, "x", "The tap had no place on the screen.") to number(payload, "y", "The tap had no place on the screen.")
    }

    private fun number(payload: JSONObject, name: String, missing: String): Float {
        val value = payload.optDouble(name)
        if (value.isNaN()) throw StepFailed(missing)
        return value.toFloat()
    }

    private suspend fun tap(x: Float, y: Float) {
        val (width, height) = Screenshots.displaySize(service)
        val path = Path().apply { moveTo(clamp(x, width), clamp(y, height)) }
        if (!stroke(path, TAP_MS)) throw StepFailed("The phone did not take the tap.")
    }

    /**
     * A finger moved from one point to another. With `holdMs`, the finger
     * first rests on the start that long, a long press, and then moves
     * without lifting: how a photo is picked up and dragged to a new place.
     */
    private suspend fun swipe(payload: JSONObject) {
        val missing = "The swipe had no start or end on the screen."
        val (width, height) = Screenshots.displaySize(service)
        val x1 = clamp(number(payload, "x1", missing), width)
        val y1 = clamp(number(payload, "y1", missing), height)
        val path = Path().apply {
            moveTo(x1, y1)
            lineTo(clamp(number(payload, "x2", missing), width), clamp(number(payload, "y2", missing), height))
        }
        val duration = payload.optLong("durationMs", DEFAULT_SWIPE_MS).coerceIn(MIN_SWIPE_MS, MAX_SWIPE_MS)
        val hold = payload.optLong("holdMs", 0L).coerceIn(0L, MAX_HOLD_MS)
        val taken = if (hold > 0L) holdThenStroke(x1, y1, path, hold, duration) else stroke(path, duration)
        if (!taken) throw StepFailed("The phone did not take the swipe.")
    }

    /**
     * Types into the box that has the keyboard. Naming a box clicks it first so
     * it takes the keyboard. The words replace whatever was in the box.
     */
    private suspend fun type(payload: JSONObject) {
        if (!payload.has("text")) throw StepFailed("No words were given to type.")
        val text = payload.optString("text")
        val nodeId = payload.optString("node").trim()
        val box = if (nodeId.isNotEmpty()) {
            service.reader.box(nodeId)
                ?: throw StepFailed("Box $nodeId is not on the last reading of the screen. Read the screen again first.")
        } else {
            null
        }
        if (box != null) {
            val clicked = withContext(Dispatchers.Main) {
                box.node.refresh() && box.node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
            }
            if (!clicked) tap(box.bounds.exactCenterX(), box.bounds.exactCenterY())
            delay(FOCUS_SETTLE_MS)
        }
        val target = service.rootInActiveWindow?.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)?.takeIf { it.isEditable }
            ?: box?.node?.takeIf { it.refresh() && it.isEditable }
            ?: throw StepFailed("There was no box to type into on the screen.")
        val arguments = Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
        }
        val typed = withContext(Dispatchers.Main) { target.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, arguments) }
        if (!typed) throw StepFailed("The box did not take the words.")
    }

    private suspend fun global(action: Int, words: String) {
        val done = withContext(Dispatchers.Main) { service.performGlobalAction(action) }
        if (!done) throw StepFailed("The phone did not $words.")
    }

    private suspend fun stroke(path: Path, durationMs: Long): Boolean =
        dispatch(GestureDescription.StrokeDescription(path, 0L, durationMs))

    private suspend fun dispatch(stroke: GestureDescription.StrokeDescription): Boolean = withContext(Dispatchers.Main) {
        suspendCancellableCoroutine<Boolean> { continuation ->
            val gesture = GestureDescription.Builder()
                .addStroke(stroke)
                .build()
            val sent = service.dispatchGesture(
                gesture,
                object : AccessibilityService.GestureResultCallback() {
                    override fun onCompleted(gestureDescription: GestureDescription?) {
                        if (continuation.isActive) continuation.resume(true)
                    }

                    override fun onCancelled(gestureDescription: GestureDescription?) {
                        if (continuation.isActive) continuation.resume(false)
                    }
                },
                null,
            )
            if (!sent && continuation.isActive) continuation.resume(false)
        }
    }

    /**
     * A long press that turns into a drag: one stroke that rests on the start
     * and says it will go on, then its continuation along the path. Android
     * keeps the finger down between the two.
     */
    private suspend fun holdThenStroke(x: Float, y: Float, path: Path, holdMs: Long, durationMs: Long): Boolean {
        val held = GestureDescription.StrokeDescription(Path().apply { moveTo(x, y) }, 0L, holdMs, true)
        if (!dispatch(held)) return false
        return dispatch(held.continueStroke(path, 0L, durationMs, false))
    }

    /** A gesture may not start off the screen, so a place is pulled back inside it. */
    private fun clamp(value: Float, size: Int): Float = value.coerceIn(0f, (size - 1).coerceAtLeast(0).toFloat())

    private companion object {
        const val DEFAULT_SETTLE_MS = 700L
        const val MAX_SETTLE_MS = 5_000L
        const val TAP_MS = 50L
        const val DEFAULT_SWIPE_MS = 300L
        const val MIN_SWIPE_MS = 50L
        const val MAX_SWIPE_MS = 10_000L
        const val MAX_HOLD_MS = 3_000L
        const val FOCUS_SETTLE_MS = 300L
        const val ROOT_TRIES = 5
        const val ROOT_WAIT_MS = 150L

        /** Pictures for the server: big enough to cut a card's photos from. */
        const val ACTION_PICTURE_WIDTH = 1080
        const val ACTION_PICTURE_QUALITY = 80
    }
}
