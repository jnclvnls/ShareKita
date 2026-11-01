# ShareKita — React Native & Expo with Node.js Backend

Privacy-first mobile peer-to-peer file transfer app built with **React Native**, **Expo SDK**, **Node.js Express + WebSocket Server**, and configured for **EAS Build**.

---

## 🛠️ Step-by-Step EAS Build Guide (Terminal & PowerShell)

### 1. Install CLI Tools Globally
```powershell
npm install -g eas-cli expo-cli
```

### 2. Install Project Dependencies
```powershell
npm install
```

### 3. Log in to Expo Account
```powershell
eas login
```
*(If you don't have an Expo account yet, register free at [expo.dev](https://expo.dev) or type `eas register`)*

### 4. Build Standalone Android APK (Installs directly on any Android phone)
```powershell
eas build -p android --profile preview
```
* EAS Cloud will build your `.apk` in 2-4 minutes and print a QR code + download link in your terminal to install directly!

### 5. Build for Google Play Store (AAB)
```powershell
eas build -p android --profile production
```

### 6. Build for iOS (Ad-Hoc / TestFlight)
```powershell
eas build -p ios --profile preview
```

### 7. Run on Local Phone with Expo Go (No build needed)
```powershell
npx expo start --tunnel
```

---

## 📁 Key Project Files

* **`app.json`**: Expo manifest with package `com.sharekita.app`, Android permissions (`CAMERA`, `NEARBY_WIFI_DEVICES`, `ACCESS_WIFI_STATE`, `READ_MEDIA_IMAGES`), and iOS `NSCameraUsageDescription`.
* **`eas.json`**: EAS Build profiles configured for standalone APKs (`preview`) and Google Play (`production`).
* **`server.ts`**: Node.js Express server + WebSocket signaling engine (`/ws`) on port `3000`.
* **`src/native/NativeApp.tsx`**: Complete React Native mobile code with animations, radar scanning, file picker, and speed gauge.
* **`package.json`**: Contains the Expo runtime and `sharekita-hotspot` local native module. Keep the module dependency and lockfile entry so EAS installs and autolinks the hotspot code in cloud builds.
# Android direct pairing

Android APK builds pair locally without `server.ts` or an internet relay. The receiver turns on the phone's regular Mobile Hotspot in Android Settings and shows a pairing QR in ShareKita. The sender scans it, selects the receiver's hotspot in Android's Wi-Fi chooser, and enters the hotspot password there if Android requests it. ShareKita then connects to the receiver and transfers files directly.

This feature requires Android 10 (API 29) or later. It needs camera, nearby Wi-Fi access, and Android's normal network permission. Android does not let a regular EAS app silently enable the phone's tethering hotspot or read its saved hotspot password, so the receiver enables it in Settings and Android handles the sender's Wi-Fi join prompt. Leave the hotspot on while pairing and transferring; ShareKita does not turn it off.

Build the APK with `npm run eas:build:preview`. The `sharekita-hotspot` Android module is a local package dependency and is autolinked into the EAS native build. Native hotspot changes require a fresh APK; Expo Go cannot load the custom Android module.
