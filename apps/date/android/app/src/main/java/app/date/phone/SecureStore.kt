package app.date.phone

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.util.Log
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * What the phone remembers: the server's address, the phone's id and the key
 * both sides sign with, and the "Date is in control" switch.
 *
 * The id and the key are sealed with AES-GCM under a key the Android Keystore
 * holds and never hands out, so a copy of the app's files is no use without
 * this phone. Written by hand rather than with EncryptedSharedPreferences,
 * which Google has deprecated.
 */
class SecureStore(context: Context) {

    data class Pairing(val server: String, val phoneId: String, val key: String)

    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** The address last typed, kept after unpairing so pairing again is one code away. */
    var server: String
        get() = prefs.getString(SERVER, "") ?: ""
        set(value) {
            prefs.edit().putString(SERVER, value).apply()
        }

    /** The switch on this phone. On by default, the same as the one on the Phone screen. */
    var switchOn: Boolean
        get() = prefs.getBoolean(SWITCH_ON, true)
        set(value) {
            prefs.edit().putBoolean(SWITCH_ON, value).apply()
        }

    fun pairing(): Pairing? {
        val address = server
        val phoneId = open(prefs.getString(PHONE_ID, null))
        val key = open(prefs.getString(KEY, null))
        return if (address.isNotBlank() && !phoneId.isNullOrBlank() && !key.isNullOrBlank()) Pairing(address, phoneId, key) else null
    }

    fun savePairing(server: String, phoneId: String, key: String) {
        prefs.edit()
            .putString(SERVER, server)
            .putString(PHONE_ID, seal(phoneId))
            .putString(KEY, seal(key))
            .commit()
    }

    /** Forgets the id and the key. The server address stays. */
    fun forgetPairing() {
        prefs.edit().remove(PHONE_ID).remove(KEY).commit()
    }

    private fun secretKey(): SecretKey {
        val keyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (keyStore.getEntry(ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        return generator.generateKey()
    }

    private fun seal(plain: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, secretKey())
        val sealed = cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
        return Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(sealed, Base64.NO_WRAP)
    }

    /** Null when nothing is stored, or when it can no longer be opened, which reads as unpaired. */
    private fun open(stored: String?): String? {
        if (stored.isNullOrBlank()) return null
        return try {
            val (iv, data) = stored.split(":", limit = 2)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)))
            String(cipher.doFinal(Base64.decode(data, Base64.NO_WRAP)), Charsets.UTF_8)
        } catch (error: Exception) {
            Log.w(TAG, "A stored value could not be opened, so the phone reads as unpaired", error)
            null
        }
    }

    private companion object {
        const val TAG = "DateStore"
        const val PREFS = "date_link"
        const val SERVER = "server"
        const val PHONE_ID = "phone_id"
        const val KEY = "key"
        const val SWITCH_ON = "switch_on"
        const val KEYSTORE = "AndroidKeyStore"
        const val ALIAS = "date-phone-store"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
    }
}
