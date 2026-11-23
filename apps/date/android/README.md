# The Date phone app

This is the small Android app that lets Date run Tinder on a phone. It has not been compiled yet. The Mac it was written on has no Java and no Android tools, so the first build in Android Studio is also its first check.

## What it does

- **It reads the screen and acts on it.** Android's accessibility switch lets it read what is on the screen, tap, swipe, type and take a picture of the screen. Screen readers for blind people use the same switch.
- **It only does what the server asks.** All the knowledge of what Tinder looks like lives on the Date server. The phone runs one plain step at a time and says what happened.
- **It calls the server, never the other way round.** Nothing on the phone listens for outside connections. It checks in every 15 seconds and asks for its next step.
- **Every message is signed.** Pairing gives the phone a secret key. Each message carries a signature made with that key, and the phone ignores any answer that is not signed with it.
- **One switch stops it.** "Date is in control" on the phone, or the same switch on the Phone screen of the dashboard, stops all steps at once.

## The phone to buy

Tyler's choice on 17 Oct 2026 was a new phone with a new Tinder account on it.

- Any Google Pixel or Samsung Galaxy on Android 12 or newer.
- Turn the screen lock off while Date runs. Date cannot type a PIN.
- Make a new Tinder account on it and sign in by hand once.

## Build it

1. Install Android Studio from developer.android.com/studio.
2. Open this `android` folder in Android Studio. It downloads what it needs the first time.
3. Choose Build, then Build App Bundles or APKs, then Build APKs.
4. The app lands in `app/build/outputs/apk/debug/app-debug.apk`.

Without Android Studio, a Mac with Gradle installed can build it from this folder:

```
gradle wrapper
./gradlew assembleDebug
```

## Put it on the phone, once

1. On the phone, open Settings, then About phone, and tap Build number seven times. This turns on Developer options.
2. In Developer options, turn on USB debugging.
3. Plug the phone into the Mac and allow the Mac when the phone asks.
4. Run this from the `android` folder:

```
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

`adb` comes with Android Studio. Updates go on the same way.

## Pair it with the dashboard

1. On the dashboard, open Dating, then Phone, and press Pair a phone. It shows a six-digit code that works for 10 minutes.
2. On the phone, open Date.
3. Type the server's address.
   - For the live site, type its normal address.
   - For the local dev server, type `http://` and the Mac's Wi-Fi address with `:3023` on the end, such as `http://192.168.1.20:3023`. The phone has to be on the same Wi-Fi. The Mac's address is in System Settings, Wi-Fi, Details.
4. Type the code and press Pair. The phone shows up on the Phone screen within 15 seconds.
5. Press Open accessibility settings, find Date in the list and switch it on.
6. Allow notifications when the phone asks. A quiet "Date is linked" notification stays while the link runs, so Android does not stop it.

## Good to know

- **Unpair on this phone** forgets the key on the phone only. Press Unpair on the Phone screen as well, so the server stops trusting the old key.
- **The phone's clock must be right.** A message more than five minutes off the server's time is refused.
- **A plain http address is not encrypted.** The app warns about it. Use one only on your own Wi-Fi for the dev server.
- **If Tinder changes how it looks,** the fix is on the server, in the list of words the walks look for. The phone app does not need a new version.

## Where things are

- `app/src/main/java/app/date/phone/LinkService.kt` keeps the link running and talks to the server.
- `app/src/main/java/app/date/phone/Actions.kt` runs each step.
- `app/src/main/java/app/date/phone/Signing.kt` signs messages. It must match `src/server/phone/signing.ts` on the server, and `SigningTest.kt` checks that it does.
- `app/src/main/java/app/date/phone/MainActivity.kt` is the one screen.
