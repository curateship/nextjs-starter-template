package app.date.phone

import java.io.IOException
import java.net.HttpURLConnection
import java.net.MalformedURLException
import java.net.URL
import java.security.SecureRandom
import org.json.JSONException
import org.json.JSONObject

/**
 * The phone's calls to the Date server. Every call but pairing is signed with
 * the phone's key, and every answer is checked against it before the phone
 * acts on it. The server's side is `apps/date/src/server/phone/http.ts`.
 *
 * Blocking calls: run them off the main thread.
 */
class PhoneApi(private val server: String, private val phoneId: String, private val key: String) {

    /** The server turned the message down, with its reason in words. */
    open class Refused(val status: Int, message: String) : Exception(message)

    /** The server no longer knows this phone's key: it was unpaired, or the key is wrong. */
    class Unpaired(message: String) : Refused(401, message)

    /** An answer the phone cannot trust or read. */
    class BadReply(message: String) : IOException(message)

    /**
     * One signed call. Returns the answer when the server signed it with this
     * phone's key and said yes. A signed refusal throws [Refused] with the
     * server's words; an unsigned answer is only ever trusted as a refusal.
     */
    fun post(path: String, body: JSONObject, readTimeoutMs: Int = 30_000): JSONObject {
        val bytes = body.toString().toByteArray(Charsets.UTF_8)
        val stamp = System.currentTimeMillis() / 1000
        val nonce = randomNonce()
        val connection = open(server + path, readTimeoutMs)
        connection.setRequestProperty("x-phone-id", phoneId)
        connection.setRequestProperty("x-phone-time", stamp.toString())
        connection.setRequestProperty("x-phone-nonce", nonce)
        connection.setRequestProperty("x-phone-signature", Signing.requestSignature(key, "POST", path, stamp, nonce, bytes))
        try {
            val (status, reply) = exchange(connection, bytes)
            val replyStamp = connection.getHeaderField("x-date-time")?.toLongOrNull()
            val replySignature = connection.getHeaderField("x-date-signature")
            if (replyStamp == null || replySignature == null) {
                if (status in 200..299) throw BadReply("The server's answer was not signed, so the phone ignored it.")
                val words = errorWords(reply) ?: "The server answered $status without signing it."
                if (status == 401 && meansUnpaired(words)) throw Unpaired(words)
                throw Refused(status, words)
            }
            val expected = Signing.replySignature(key, status, nonce, replyStamp, reply)
            if (!Signing.sameSignature(replySignature, expected)) {
                throw BadReply("The server's answer was not signed with this phone's key, so the phone ignored it.")
            }
            val json = try {
                JSONObject(String(reply, Charsets.UTF_8))
            } catch (error: JSONException) {
                throw BadReply("The server's answer could not be read.")
            }
            if (status !in 200..299) throw Refused(status, json.optString("error").ifBlank { "The server answered $status." })
            return json
        } finally {
            connection.disconnect()
        }
    }

    data class Pairing(val phoneId: String, val key: String)

    companion object {
        private val random = SecureRandom()

        /** 32 lowercase hex characters, never used twice. */
        fun randomNonce(): String = ByteArray(16).also { random.nextBytes(it) }.toHex()

        /**
         * The address typed on the screen, as the server's own origin: scheme,
         * host and port, nothing after. Signatures cover the path from the
         * root, so a path typed after the host would break every one of them.
         * No scheme means https.
         */
        fun normaliseServer(typed: String): String? {
            val trimmed = typed.trim().trimEnd('/')
            if (trimmed.isEmpty()) return null
            val withScheme = if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) trimmed else "https://$trimmed"
            return try {
                val url = URL(withScheme)
                if (url.host.isNullOrBlank()) {
                    null
                } else {
                    buildString {
                        append(url.protocol).append("://").append(url.host)
                        if (url.port != -1) append(':').append(url.port)
                    }
                }
            } catch (error: MalformedURLException) {
                null
            }
        }

        /**
         * Swaps the six-digit code from the Phone screen for this phone's id and
         * key. Not signed, because the phone has no key yet.
         */
        fun pair(server: String, code: String, model: String, android: String, appVersion: String): Pairing {
            val bytes = JSONObject()
                .put("code", code)
                .put("model", model)
                .put("android", android)
                .put("appVersion", appVersion)
                .toString()
                .toByteArray(Charsets.UTF_8)
            val connection = open("$server/api/phone/pair", 30_000)
            try {
                val (status, reply) = exchange(connection, bytes)
                if (status !in 200..299) throw Refused(status, errorWords(reply) ?: "The server answered $status.")
                val json = try {
                    JSONObject(String(reply, Charsets.UTF_8))
                } catch (error: JSONException) {
                    throw BadReply("The server's answer could not be read. Check the address.")
                }
                val phoneId = json.optString("phoneId")
                val key = json.optString("key")
                if (phoneId.isBlank() || key.isBlank()) throw BadReply("The server's answer had no key in it. Check the address.")
                return Pairing(phoneId, key)
            } finally {
                connection.disconnect()
            }
        }

        private fun open(url: String, readTimeoutMs: Int): HttpURLConnection =
            (URL(url).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                doOutput = true
                useCaches = false
                connectTimeout = 15_000
                readTimeout = readTimeoutMs
                setRequestProperty("content-type", "application/json")
                setRequestProperty("accept", "application/json")
            }

        private fun exchange(connection: HttpURLConnection, bytes: ByteArray): Pair<Int, ByteArray> {
            connection.setFixedLengthStreamingMode(bytes.size)
            connection.outputStream.use { it.write(bytes) }
            val status = connection.responseCode
            val stream = if (status >= 400) connection.errorStream else connection.inputStream
            val reply = stream?.use { it.readBytes() } ?: ByteArray(0)
            return status to reply
        }

        private fun errorWords(reply: ByteArray): String? = try {
            JSONObject(String(reply, Charsets.UTF_8)).optString("error").takeIf { it.isNotBlank() }
        } catch (error: JSONException) {
            null
        }

        /** The refusals that mean the server no longer knows this phone, so only pairing again helps. */
        private fun meansUnpaired(words: String): Boolean {
            val lower = words.lowercase()
            return "unpaired" in lower || "not paired" in lower || "signature does not match" in lower
        }
    }
}
