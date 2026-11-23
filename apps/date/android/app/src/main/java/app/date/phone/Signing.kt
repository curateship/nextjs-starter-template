package app.date.phone

import java.security.MessageDigest
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * How the phone and the Date server sign what they send each other. The
 * server's half of the same rule is `apps/date/src/server/phone/signing.ts`;
 * a change here is a change there, or every message is refused.
 *
 * Both sides hold one key, handed to the phone when it paired. A request is
 * signed over its method, its path, the time, a random word used once and a
 * hash of its body. A reply is signed over its status, the request's random
 * word, the time and a hash of its body, so an old reply cannot stand in for
 * a new one.
 *
 * Plain Java crypto only, so `SigningTest` runs without a phone.
 */
object Signing {
    fun sha256Hex(data: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(data).toHex()

    fun hmacHex(key: String, canonical: String): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(key.toByteArray(Charsets.UTF_8), "HmacSHA256"))
        return mac.doFinal(canonical.toByteArray(Charsets.UTF_8)).toHex()
    }

    fun requestSignature(key: String, method: String, path: String, stamp: Long, nonce: String, body: ByteArray): String =
        hmacHex(key, listOf(method, path, stamp.toString(), nonce, sha256Hex(body)).joinToString("\n"))

    fun replySignature(key: String, status: Int, nonce: String, stamp: Long, body: ByteArray): String =
        hmacHex(key, listOf("reply", status.toString(), nonce, stamp.toString(), sha256Hex(body)).joinToString("\n"))

    /** Compares two hex signatures without leaking how much of them matched. */
    fun sameSignature(given: String, expected: String): Boolean =
        MessageDigest.isEqual(given.toByteArray(Charsets.UTF_8), expected.toByteArray(Charsets.UTF_8))
}

private val HEX_DIGITS = "0123456789abcdef".toCharArray()

/** Lowercase hex, the way the server writes its hashes. */
internal fun ByteArray.toHex(): String {
    val out = CharArray(size * 2)
    forEachIndexed { index, byte ->
        val value = byte.toInt() and 0xff
        out[index * 2] = HEX_DIGITS[value ushr 4]
        out[index * 2 + 1] = HEX_DIGITS[value and 0x0f]
    }
    return String(out)
}
