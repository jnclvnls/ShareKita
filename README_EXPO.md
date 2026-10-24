# ShareKita — React Native & Expo with Node.js Backend

Privacy-first mobile peer-to-peer file transfer app built with **React Native**, **Expo SDK**, **Node.js Express + WebSocket Server**, and configured for **EAS Build**.

---

## ⚡ Quick Fix for: `Failed to resolve plugin for module "expo-camera"`

If you encounter this error in your terminal or PowerShell:
```
Failed to resolve plugin for module "expo-camera" relative to "...". Do you have node modules installed?
Error: build command failed.
```

### Why it happened:
EAS CLI needs dependencies installed in your local project before it reads plugins, or you can build directly without the external plugin since native camera permissions are already configured.

### Two Quick Solutions:

#### Solution A (Recommended - Install packages first):
In your project directory (`remix-sharekita-—-nearby-file-transfer`), run:
```powershell
npm install
eas build -p android --profile preview
```

#### Solution B (Direct build):
We have updated `app.json` with `"plugins": []` while keeping full native Android and iOS camera permissions declared in `android.permissions` and `ios.infoPlist`. Re-download the project zip from the app or simply delete the `"plugins"` section in your local `app.json`, then run:
```powershell
eas build -p android --profile preview
```

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
* **`package.json`**: Contains `expo`, `expo-camera`, `ws`, `express`.
