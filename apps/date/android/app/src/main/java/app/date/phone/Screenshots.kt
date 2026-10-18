package app.date.phone

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.graphics.Bitmap
import android.hardware.display.DisplayManager
import android.os.SystemClock
import android.util.Base64
import android.util.DisplayMetrics
import android.view.Display
import java.io.ByteArrayOutputStream
import java.io.IOException
import kotlin.coroutines.resume
import kotlin.math.roundToInt
import kotlinx.coroutines.delay
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Pictures of the screen, taken through the accessibility service.
 *
 * Android allows one about every third of a second, and both the actions and
 * the live screen window want them, so they queue here behind one lock and are
 * spaced out. One taken too soon anyway is tried again.
 */
class Screenshots(private val service: AccessibilityService) {

    private val lock = Mutex()
    private var lastShotAt = 0L

    /** The whole screen at its real size. The caller recycles it. */
    suspend fun capture(): Bitmap = lock.withLock { captureInTurn() }

    private suspend fun captureInTurn(): Bitmap {
        repeat(ATTEMPTS) {
            val wait = lastShotAt + MIN_GAP_MS - SystemClock.uptimeMillis()
            if (wait > 0) delay(wait)
            lastShotAt = SystemClock.uptimeMillis()
            when (val shot = takeOnce()) {
                is Shot.Taken -> return shot.bitmap
                is Shot.Failed ->
                    if (shot.code != AccessibilityService.ERROR_TAKE_SCREENSHOT_INTERVAL_TIME_SHORT) throw IOException(words(shot.code))
            }
        }
        throw IOException("The phone kept refusing to take a picture of the screen.")
    }

    private sealed class Shot {
        class Taken(val bitmap: Bitmap) : Shot()
        class Failed(val code: Int) : Shot()
    }

    private suspend fun takeOnce(): Shot = suspendCancellableCoroutine<Shot> { continuation ->
        service.takeScreenshot(
            Display.DEFAULT_DISPLAY,
            service.mainExecutor,
            object : AccessibilityService.TakeScreenshotCallback {
                override fun onSuccess(screenshot: AccessibilityService.ScreenshotResult) {
                    val bitmap = try {
                        toBitmap(screenshot)
                    } catch (error: Exception) {
                        null
                    }
                    if (continuation.isActive) {
                        continuation.resume(if (bitmap != null) Shot.Taken(bitmap) else Shot.Failed(UNREADABLE))
                    } else {
                        // The action gave up while the picture was on its way.
                        bitmap?.recycle()
                    }
                }

                override fun onFailure(errorCode: Int) {
                    if (continuation.isActive) continuation.resume(Shot.Failed(errorCode))
                }
            },
        )
    }

    private fun toBitmap(screenshot: AccessibilityService.ScreenshotResult): Bitmap {
        val buffer = screenshot.hardwareBuffer
        try {
            val wrapped = Bitmap.wrapHardwareBuffer(buffer, screenshot.colorSpace)
                ?: throw IOException("The picture of the screen could not be read.")
            // A hardware picture cannot be shrunk or saved, so it is copied into ordinary memory first.
            val copy = wrapped.copy(Bitmap.Config.ARGB_8888, false)
            wrapped.recycle()
            return copy
        } finally {
            buffer.close()
        }
    }

    private fun words(code: Int): String = when (code) {
        AccessibilityService.ERROR_TAKE_SCREENSHOT_NO_ACCESSIBILITY_ACCESS ->
            "Date is not allowed to take pictures of the screen. Switch Date off and on again in Accessibility settings."
        AccessibilityService.ERROR_TAKE_SCREENSHOT_INVALID_DISPLAY -> "The phone's screen could not be found for a picture."
        UNREADABLE -> "The picture of the screen could not be read."
        else -> "The phone would not take a picture of the screen (Android said $code)."
    }

    /** A picture squeezed into JPEG and written as base64, the way the server takes it. */
    class Encoded(val base64: String, val width: Int, val height: Int)

    companion object {
        /** Android's own limit is a third of a second; a little more avoids being turned down. */
        private const val MIN_GAP_MS = 350L
        private const val ATTEMPTS = 6
        private const val UNREADABLE = -1

        /** Shrinks [bitmap] to at most [maxWidth] wide and encodes it. [bitmap] is left as it was. */
        fun encode(bitmap: Bitmap, maxWidth: Int, quality: Int): Encoded {
            val scaled = if (bitmap.width > maxWidth) {
                val height = (bitmap.height * maxWidth.toFloat() / bitmap.width).roundToInt().coerceAtLeast(1)
                Bitmap.createScaledBitmap(bitmap, maxWidth, height, true)
            } else {
                bitmap
            }
            val out = ByteArrayOutputStream()
            scaled.compress(Bitmap.CompressFormat.JPEG, quality, out)
            val encoded = Encoded(Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP), scaled.width, scaled.height)
            if (scaled !== bitmap) scaled.recycle()
            return encoded
        }

        /** The screen's real size in pixels, bars included, turned the way the phone is held. */
        @Suppress("DEPRECATION")
        fun displaySize(context: Context): Pair<Int, Int> {
            val display = context.getSystemService(DisplayManager::class.java).getDisplay(Display.DEFAULT_DISPLAY)
            val metrics = DisplayMetrics()
            display.getRealMetrics(metrics)
            return metrics.widthPixels to metrics.heightPixels
        }
    }
}
