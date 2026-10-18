package app.date.phone

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The same inputs signed by the server's `signing.ts` gave these answers,
 * worked out with Node's own crypto on 18 Oct 2026. If this test fails, the
 * phone and the server no longer agree and every message would be refused.
 */
class SigningTest {
    private val key = "test-key"
    private val nonce = "ab".repeat(16)
    private val stamp = 4_070_908_800L

    @Test
    fun hashesTheBodyLikeTheServer() {
        assertEquals(
            "015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862",
            Signing.sha256Hex("{\"a\":1}".toByteArray(Charsets.UTF_8)),
        )
        assertEquals(
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            Signing.sha256Hex(ByteArray(0)),
        )
    }

    @Test
    fun signsARequestLikeTheServer() {
        assertEquals(
            "1d4dfac486a669a6fa9e85778910acf95c4111b6525cdef053c281084c0086df",
            Signing.requestSignature(key, "POST", "/api/phone/check-in", stamp, nonce, "{\"a\":1}".toByteArray(Charsets.UTF_8)),
        )
    }

    @Test
    fun checksAReplyLikeTheServer() {
        assertEquals(
            "048cb4cdaa01ce0218d326dca1115c49b9a120a4563933e34da9a5ec916f238e",
            Signing.replySignature(key, 200, nonce, stamp, "{\"ok\":true}".toByteArray(Charsets.UTF_8)),
        )
    }

    @Test
    fun comparesSignatures() {
        assertTrue(Signing.sameSignature("abc123", "abc123"))
        assertFalse(Signing.sameSignature("abc123", "abc124"))
        assertFalse(Signing.sameSignature("abc", "abc123"))
    }
}
