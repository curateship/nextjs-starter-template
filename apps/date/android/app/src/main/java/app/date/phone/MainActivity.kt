package app.date.phone

import android.Manifest
import android.app.Activity
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.Switch
import android.widget.TextView
import java.text.DateFormat
import java.util.Date
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Date's one screen on the phone: the server's address and the code that pairs
 * the phone, then the "Date is in control" switch and when the server last
 * answered. While Date is off in Accessibility settings it says what that
 * switch lets Date do and opens the settings.
 */
class MainActivity : Activity() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val ticker = Handler(Looper.getMainLooper())
    private val tick = object : Runnable {
        override fun run() {
            refresh()
            ticker.postDelayed(this, 1_000L)
        }
    }

    private lateinit var store: SecureStore
    private lateinit var pairSection: LinearLayout
    private lateinit var pairedSection: LinearLayout
    private lateinit var accessSection: LinearLayout
    private lateinit var serverField: EditText
    private lateinit var codeField: EditText
    private lateinit var pairButton: Button
    private lateinit var pairedLine: TextView
    private lateinit var controlSwitch: Switch
    private lateinit var answerLine: TextView
    private lateinit var messageLine: TextView
    private lateinit var httpWarning: TextView

    /** Set while the screen moves the switch itself, so that is not taken for a press. */
    private var settingSwitch = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        store = SecureStore(this)
        pairSection = findViewById(R.id.pairSection)
        pairedSection = findViewById(R.id.pairedSection)
        accessSection = findViewById(R.id.accessSection)
        serverField = findViewById(R.id.serverField)
        codeField = findViewById(R.id.codeField)
        pairButton = findViewById(R.id.pairButton)
        pairedLine = findViewById(R.id.pairedLine)
        controlSwitch = findViewById(R.id.controlSwitch)
        answerLine = findViewById(R.id.answerLine)
        messageLine = findViewById(R.id.messageLine)
        httpWarning = findViewById(R.id.httpWarning)

        serverField.setText(store.server)
        pairButton.setOnClickListener { pair() }
        findViewById<Button>(R.id.unpairButton).setOnClickListener { unpairHere() }
        findViewById<Button>(R.id.accessButton).setOnClickListener {
            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
        }
        controlSwitch.setOnCheckedChangeListener { _, checked ->
            if (!settingSwitch) store.switchOn = checked
        }
        askToShowNotifications()
    }

    override fun onResume() {
        super.onResume()
        if (store.pairing() != null) startLink()
        ticker.post(tick)
    }

    override fun onPause() {
        ticker.removeCallbacks(tick)
        super.onPause()
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    private fun pair() {
        val server = PhoneApi.normaliseServer(serverField.text.toString())
        if (server == null) {
            say("Type the server's address, such as https://your-date-site.com.")
            return
        }
        val code = codeField.text.toString().filter { it.isDigit() }
        if (code.length != 6) {
            say("Type the six digits shown on the Phone screen of the dashboard.")
            return
        }
        store.server = server
        // The old refusal would otherwise cover this attempt's own words each second.
        LinkStatus.unpairedWords = ""
        pairButton.isEnabled = false
        say("Pairing with $server…")
        scope.launch {
            try {
                val pairing = withContext(Dispatchers.IO) {
                    PhoneApi.pair(server, code, DeviceInfo.modelName(), Build.VERSION.RELEASE.orEmpty(), BuildConfig.VERSION_NAME)
                }
                store.savePairing(server, pairing.phoneId, pairing.key)
                LinkStatus.reset()
                codeField.setText("")
                restartLink()
                say("Paired. This phone now shows on the Phone screen of the dashboard.")
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                say(
                    when (error) {
                        is PhoneApi.Refused -> error.message ?: "The server said no."
                        is PhoneApi.BadReply -> error.message ?: "The server's answer could not be read. Check the address."
                        is java.io.IOException -> "Could not reach $server: ${error.message ?: "no connection"}. Check the address and the Wi-Fi."
                        else -> error.message ?: "Pairing did not work."
                    }
                )
            } finally {
                pairButton.isEnabled = true
                refresh()
            }
        }
    }

    /** Forgets the key on this phone only. The Phone screen's Unpair cancels it on the server too. */
    private fun unpairHere() {
        store.forgetPairing()
        stopService(Intent(this, LinkService::class.java))
        LinkStatus.reset()
        say("This phone forgot its key. Press Unpair on the Phone screen of the dashboard as well, or pair again with a new code.")
        refresh()
    }

    private fun startLink() {
        try {
            startForegroundService(Intent(this, LinkService::class.java))
        } catch (error: Exception) {
            say("The link could not start: ${error.message ?: error.javaClass.simpleName}.")
        }
    }

    private fun restartLink() {
        stopService(Intent(this, LinkService::class.java))
        startLink()
    }

    private fun refresh() {
        val pairing = store.pairing()
        pairSection.visibility = if (pairing == null) View.VISIBLE else View.GONE
        pairedSection.visibility = if (pairing == null) View.GONE else View.VISIBLE
        accessSection.visibility = if (accessibilityOn()) View.GONE else View.VISIBLE

        val server = pairing?.server ?: store.server
        httpWarning.text = if (server.startsWith("http://")) {
            "This address is not encrypted. Use it only for the dev server on your own Wi-Fi."
        } else {
            ""
        }
        httpWarning.visibility = if (httpWarning.text.isEmpty()) View.GONE else View.VISIBLE

        if (pairing == null) {
            if (LinkStatus.unpairedWords.isNotEmpty()) say("${LinkStatus.unpairedWords} Pair again with a new code.")
            return
        }
        pairedLine.text = "Paired with ${pairing.server}."
        settingSwitch = true
        controlSwitch.isChecked = store.switchOn
        settingSwitch = false
        answerLine.text = when {
            LinkStatus.lastProblem.isNotEmpty() -> "Last problem: ${LinkStatus.lastProblem}"
            LinkStatus.lastAnswerAt > 0L ->
                "The server last answered at ${DateFormat.getTimeInstance(DateFormat.MEDIUM).format(Date(LinkStatus.lastAnswerAt))}."
            else -> "Waiting for the server's first answer."
        }
    }

    private fun say(words: String) {
        messageLine.text = words
    }

    /** Whether Date is switched on in Accessibility settings. */
    private fun accessibilityOn(): Boolean {
        if (DateAccessibilityService.instance != null) return true
        val mine = ComponentName(this, DateAccessibilityService::class.java)
        val enabled = Settings.Secure.getString(contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES).orEmpty()
        return enabled.split(':').any { ComponentName.unflattenFromString(it) == mine }
    }

    /** The quiet "Date is linked" notification needs this on Android 13 and later. */
    private fun askToShowNotifications() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return
        requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), NOTIFICATIONS_REQUEST)
    }

    private companion object {
        const val NOTIFICATIONS_REQUEST = 1
    }
}
