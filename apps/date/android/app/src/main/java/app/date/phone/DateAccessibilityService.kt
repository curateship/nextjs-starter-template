package app.date.phone

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.util.Log
import android.view.accessibility.AccessibilityEvent

/**
 * The part of Date that Android lets read the screen, tap, swipe, type and
 * take pictures, switched on by the person in Accessibility settings. It does
 * nothing by itself: `LinkService` hands it the server's actions, and only
 * while the "Date is in control" switch is on.
 */
class DateAccessibilityService : AccessibilityService() {

    val reader = ScreenReader()
    val screenshots by lazy { Screenshots(this) }
    val runner by lazy { ActionRunner(this) }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        // A phone already paired starts its link as soon as Date is switched on here.
        if (SecureStore(this).pairing() != null) {
            try {
                startForegroundService(Intent(this, LinkService::class.java))
            } catch (error: Exception) {
                Log.w(TAG, "The link could not start from the accessibility service; opening the app starts it", error)
            }
        }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event?.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            event.packageName?.toString()?.let { lastWindowPackage = it }
        }
    }

    override fun onInterrupt() = Unit

    override fun onUnbind(intent: Intent?): Boolean {
        if (instance === this) instance = null
        return super.onUnbind(intent)
    }

    override fun onDestroy() {
        if (instance === this) instance = null
        super.onDestroy()
    }

    /** The app in front: the active window's own, or the last one that opened a window. */
    fun foregroundPackage(): String = rootInActiveWindow?.packageName?.toString() ?: lastWindowPackage

    companion object {
        private const val TAG = "DateAccessibility"

        /** The running service, or null while Date is off in Accessibility settings. */
        @Volatile
        var instance: DateAccessibilityService? = null
            private set

        @Volatile
        private var lastWindowPackage: String = ""
    }
}
