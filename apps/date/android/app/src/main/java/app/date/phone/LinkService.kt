package app.date.phone

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.SystemClock
import android.util.Log
import java.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONException
import org.json.JSONObject

/**
 * Keeps the phone linked to the Date server with the phone in a pocket. A
 * foreground service, with a quiet notification saying so, so Android does
 * not stop it.
 *
 * Three loops, each on its own:
 * - check in every fifteen seconds with how the phone is;
 * - ask for the next action, holding the ask open up to twenty seconds, run
 *   it through the accessibility service and send the answer back. Only while
 *   the switch on this phone is on and Date is on in Accessibility settings;
 * - while a window on the dashboard watches the screen, send about three
 *   pictures a second.
 *
 * The phone always calls the server; nothing on the phone listens.
 */
class LinkService : Service() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    /** Whether a window on the dashboard is watching this phone's screen, as the server last said. */
    private val watched = MutableStateFlow(false)
    private var started = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        goForeground()
        val store = SecureStore(this)
        val pairing = store.pairing()
        if (pairing == null) {
            stopSelf()
            return START_NOT_STICKY
        }
        if (!started) {
            started = true
            val api = PhoneApi(pairing.server, pairing.phoneId, pairing.key)
            scope.launch { checkInLoop(api, store) }
            scope.launch { actionLoop(api, store) }
            scope.launch { screenLoop(api) }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    private suspend fun checkInLoop(api: PhoneApi, store: SecureStore) {
        val backoff = Backoff()
        while (currentCoroutineContext().isActive) {
            val waitMs = try {
                val reply = api.post("/api/phone/check-in", DeviceInfo.checkIn(this, store.switchOn))
                LinkStatus.answered()
                watched.value = reply.optBoolean("watched", false)
                backoff.reset()
                reply.optInt("checkInSeconds", 15).coerceIn(5, 300) * 1000L
            } catch (refusal: PhoneApi.Unpaired) {
                forgetAndStop(store, refusal.message)
                return
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                LinkStatus.failed(words(error))
                backoff.next()
            }
            delay(waitMs)
        }
    }

    private suspend fun actionLoop(api: PhoneApi, store: SecureStore) {
        val backoff = Backoff()
        while (currentCoroutineContext().isActive) {
            val service = DateAccessibilityService.instance
            if (!store.switchOn || service == null) {
                delay(IDLE_MS)
                continue
            }
            try {
                val reply = api.post(
                    "/api/phone/next",
                    JSONObject().put("waitSeconds", NEXT_WAIT_SECONDS).put("watching", watched.value),
                    readTimeoutMs = (NEXT_WAIT_SECONDS + 20) * 1000,
                )
                LinkStatus.answered()
                backoff.reset()
                watched.value = reply.optBoolean("watched", watched.value)
                val action = reply.optJSONObject("action") ?: continue
                val outcome = service.runner.run(action)
                sendResult(api, action.optString("id"), outcome)
            } catch (refusal: PhoneApi.Unpaired) {
                forgetAndStop(store, refusal.message)
                return
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                LinkStatus.failed(words(error))
                delay(backoff.next())
            }
        }
    }

    /**
     * Sends an action's answer, trying again if the network drops: the server
     * waits the action's own time and a minute more. A refusal is not tried
     * again, because the same answer would be refused the same way.
     */
    private suspend fun sendResult(api: PhoneApi, id: String, outcome: ActionRunner.Outcome) {
        val body = JSONObject()
            .put("id", id)
            .put("ok", outcome.ok)
            .put("answer", outcome.answer ?: JSONObject.NULL)
            .put("error", outcome.error.take(MAX_ERROR_CHARS))
            .put("screenshot", outcome.screenshot ?: JSONObject.NULL)
        for (attempt in RESULT_RETRY_MS.indices) {
            try {
                api.post("/api/phone/result", body, readTimeoutMs = 60_000)
                LinkStatus.answered()
                return
            } catch (refusal: PhoneApi.Unpaired) {
                throw refusal
            } catch (refused: PhoneApi.Refused) {
                LinkStatus.failed(words(refused))
                if (refused.status < 500) return
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                LinkStatus.failed(words(error))
            }
            delay(RESULT_RETRY_MS[attempt])
        }
        Log.w(TAG, "Gave up sending the answer to action $id")
    }

    private suspend fun screenLoop(api: PhoneApi) {
        val backoff = Backoff()
        while (currentCoroutineContext().isActive) {
            watched.first { it }
            val startedAt = SystemClock.uptimeMillis()
            try {
                val frame = DateAccessibilityService.instance?.let { frame(it) }
                val reply = api.post("/api/phone/screen", JSONObject().put("frame", frame ?: JSONObject.NULL))
                watched.value = reply.optBoolean("watched", false)
                backoff.reset()
                val spent = SystemClock.uptimeMillis() - startedAt
                // With no picture to send there is no hurry; it only keeps saying it is here.
                delay(if (frame == null) IDLE_MS else (FRAME_GAP_MS - spent).coerceAtLeast(0L))
            } catch (refusal: PhoneApi.Unpaired) {
                // The check-in loop forgets the key and stops the service.
                watched.value = false
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                Log.w(TAG, "A screen picture was not sent", error)
                delay(backoff.next())
            }
        }
    }

    private suspend fun frame(service: DateAccessibilityService): JSONObject {
        val bitmap = service.screenshots.capture()
        try {
            val encoded = Screenshots.encode(bitmap, FRAME_WIDTH, FRAME_QUALITY)
            return JSONObject()
                .put("jpeg", encoded.base64)
                .put("width", encoded.width)
                .put("height", encoded.height)
                .put("screenWidth", bitmap.width)
                .put("screenHeight", bitmap.height)
        } finally {
            bitmap.recycle()
        }
    }

    /** The server no longer knows this phone: forget the key, stop, and let the screen say Pair again. */
    private fun forgetAndStop(store: SecureStore, words: String?) {
        store.forgetPairing()
        LinkStatus.unpairedWords = words ?: "The server no longer knows this phone."
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun words(error: Exception): String = when (error) {
        is PhoneApi.Refused -> error.message ?: "The server said no."
        is PhoneApi.BadReply -> error.message ?: "The server's answer could not be trusted."
        is JSONException -> "The server's answer could not be read."
        is IOException -> "Could not reach the server: ${error.message ?: "no connection"}."
        else -> error.message ?: error.javaClass.simpleName
    }

    private fun goForeground() {
        val manager = getSystemService(NotificationManager::class.java)
        val channel = NotificationChannel(CHANNEL, getString(R.string.notification_channel), NotificationManager.IMPORTANCE_LOW)
        channel.setShowBadge(false)
        manager.createNotificationChannel(channel)
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val notification = Notification.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle(getString(R.string.notification_title))
            .setContentText(getString(R.string.notification_text))
            .setContentIntent(open)
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    /** Waits longer after each failure in a row: five seconds, then fifteen, then thirty. */
    private class Backoff {
        private var failures = 0
        fun next(): Long {
            failures += 1
            return when (failures) {
                1 -> 5_000L
                2 -> 15_000L
                else -> 30_000L
            }
        }

        fun reset() {
            failures = 0
        }
    }

    private companion object {
        const val TAG = "DateLink"
        const val CHANNEL = "date-link"
        const val NOTIFICATION_ID = 1
        const val NEXT_WAIT_SECONDS = 20
        const val IDLE_MS = 2_000L
        /** About three pictures a second while the window watches. */
        const val FRAME_GAP_MS = 330L
        const val FRAME_WIDTH = 540
        const val FRAME_QUALITY = 60
        const val MAX_ERROR_CHARS = 3_900
        val RESULT_RETRY_MS = longArrayOf(2_000L, 5_000L, 10_000L, 10_000L)
    }
}
