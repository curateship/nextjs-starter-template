package app.date.phone

import android.content.Context
import android.content.pm.PackageManager
import android.os.BatteryManager
import android.os.Build
import java.util.TimeZone
import org.json.JSONObject

/** What the phone says about itself on every check-in. */
object DeviceInfo {
    const val TINDER = "com.tinder"

    /** "Pixel 8a", or the maker and model when the model alone is a code such as "SM-S921B". */
    fun modelName(): String {
        val model = Build.MODEL.orEmpty().trim()
        val maker = Build.MANUFACTURER.orEmpty().trim().replaceFirstChar { it.uppercase() }
        return when {
            model.isEmpty() -> maker
            maker.isEmpty() || model.startsWith(maker, ignoreCase = true) || maker.equals("Google", ignoreCase = true) -> model
            else -> "$maker $model"
        }
    }

    fun checkIn(context: Context, switchOn: Boolean): JSONObject =
        JSONObject()
            .put("appVersion", BuildConfig.VERSION_NAME)
            .put("model", modelName())
            .put("android", Build.VERSION.RELEASE.orEmpty())
            .put("timezone", TimeZone.getDefault().id)
            .put("batteryPercent", batteryPercent(context) ?: JSONObject.NULL)
            .put("tinderVersion", appVersion(context, TINDER))
            .put("tinderInFront", DateAccessibilityService.instance?.foregroundPackage() == TINDER)
            .put("phoneSwitchOn", switchOn)

    private fun batteryPercent(context: Context): Int? {
        val level = context.getSystemService(BatteryManager::class.java)
            ?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
            ?: return null
        return level.takeIf { it in 0..100 }
    }

    /** An app's version, or empty when it is not installed. */
    fun appVersion(context: Context, packageName: String): String = try {
        val info = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.packageManager.getPackageInfo(packageName, PackageManager.PackageInfoFlags.of(0))
        } else {
            @Suppress("DEPRECATION")
            context.packageManager.getPackageInfo(packageName, 0)
        }
        info.versionName ?: "installed"
    } catch (error: PackageManager.NameNotFoundException) {
        ""
    }

    fun isInstalled(context: Context, packageName: String): Boolean = appVersion(context, packageName).isNotEmpty()
}
