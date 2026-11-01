package com.sharekita.hotspot

import android.content.Context
import android.content.Intent
import android.provider.Settings
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.wifi.WifiNetworkSpecifier
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PatternMatcher
import java.net.Inet4Address
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import android.util.Base64

class ShareKitaHotspotModule : Module() {
  private var networkCallback: ConnectivityManager.NetworkCallback? = null

  private fun findGateway(manager: ConnectivityManager, network: Network): String? = try {
    val props = manager.getLinkProperties(network)
    val fromRoutes = props?.routes
      ?.firstOrNull { it.hasGateway() && it.gateway is Inet4Address }?.gateway?.hostAddress
    val fromDhcp = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) props?.dhcpServerAddress?.hostAddress else null
    val fromAddress = props?.linkAddresses
      ?.map { it.address }
      ?.firstOrNull { it is Inet4Address }
      ?.hostAddress
      ?.substringBeforeLast('.', "")
      ?.takeIf { it.isNotEmpty() }
      ?.let { "$it.1" }
    fromRoutes ?: fromDhcp ?: fromAddress
  } catch (_: Exception) { null }

  override fun definition() = ModuleDefinition {
    Name("ShareKitaHotspot")

    AsyncFunction("generateSessionKey") {
      val bytes = ByteArray(16)
      SecureRandom().nextBytes(bytes)
      Base64.encodeToString(bytes, Base64.NO_WRAP)
    }

    AsyncFunction("generatePairingToken") {
      val bytes = ByteArray(16)
      SecureRandom().nextBytes(bytes)
      bytes.joinToString("") { (it.toInt() and 0xff).toString(16).padStart(2, '0') }
    }

    AsyncFunction("encryptChunk") { keyB64: String, transferId: String, index: Int, dataB64: String ->
      val nonce = ByteArray(12)
      SecureRandom().nextBytes(nonce)
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(Base64.decode(keyB64, Base64.NO_WRAP), "AES"), GCMParameterSpec(128, nonce))
      cipher.updateAAD("$transferId:$index".toByteArray(Charsets.UTF_8))
      val encrypted = cipher.doFinal(Base64.decode(dataB64, Base64.NO_WRAP))
      Base64.encodeToString(nonce + encrypted, Base64.NO_WRAP)
    }

    AsyncFunction("decryptChunk") { keyB64: String, transferId: String, index: Int, encryptedB64: String ->
      val data = Base64.decode(encryptedB64, Base64.NO_WRAP)
      if (data.size < 28) throw IllegalArgumentException("Encrypted chunk is incomplete.")
      val nonce = data.copyOfRange(0, 12)
      val ciphertext = data.copyOfRange(12, data.size)
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(Base64.decode(keyB64, Base64.NO_WRAP), "AES"), GCMParameterSpec(128, nonce))
      cipher.updateAAD("$transferId:$index".toByteArray(Charsets.UTF_8))
      Base64.encodeToString(cipher.doFinal(ciphertext), Base64.NO_WRAP)
    }

    AsyncFunction("openHotspotSettings") {
      val context = appContext.reactContext ?: throw IllegalStateException("Android context is unavailable.")
      val tetherIntent = Intent("android.settings.TETHER_SETTINGS").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      try {
        context.startActivity(tetherIntent)
      } catch (_: Exception) {
        context.startActivity(Intent(Settings.ACTION_WIRELESS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }
    }

    AsyncFunction("openWifiSettings") {
      val context = appContext.reactContext ?: throw IllegalStateException("Android context is unavailable.")
      context.startActivity(Intent(Settings.ACTION_WIFI_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    AsyncFunction("connect") { ssid: String, password: String, wpa3: Boolean, hidden: Boolean, promise: Promise ->
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
        promise.reject("WIFI_JOIN_UNSUPPORTED", "Joining a private Wi-Fi network from ShareKita requires Android 10 or newer.", null)
        return@AsyncFunction
      }
      val context = appContext.reactContext ?: run {
        promise.reject("NO_CONTEXT", "Android context is unavailable.", null)
        return@AsyncFunction
      }
      val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
      networkCallback?.let { try { manager.unregisterNetworkCallback(it) } catch (_: Exception) {} }
      manager.bindProcessToNetwork(null)

      val builder = WifiNetworkSpecifier.Builder()
      if (ssid.isBlank()) {
        // Let Android list nearby networks so the user can select the receiver's
        // visible hotspot without entering its credentials in ShareKita.
        // Android rejects a pure match-all ".*" pattern, so require at least one character.
        builder.setSsidPattern(PatternMatcher("..*", PatternMatcher.PATTERN_SIMPLE_GLOB))
      } else {
        builder.setSsid(ssid).setIsHiddenSsid(hidden)
        if (password.isNotBlank()) {
          if (wpa3) builder.setWpa3Passphrase(password) else builder.setWpa2Passphrase(password)
        }
      }
      val request = NetworkRequest.Builder()
        .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
        // Hotspot networks are local-only and often do not advertise internet.
        // Keep Android's normal request constraints and drop only INTERNET.
        .removeCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
        .setNetworkSpecifier(builder.build())
        .build()

      var completed = false
      val main = Handler(Looper.getMainLooper())
      val callback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
          if (completed) return
          completed = true
          manager.bindProcessToNetwork(network)
          // Link properties (DHCP) can lag well behind onAvailable on some phones, so poll
          // for up to ~8s instead of reading once. An empty result made the app try no host at all.
          fun gateway(): String? = findGateway(manager, network)
          var attempts = 0
          lateinit var poll: Runnable
          poll = Runnable {
            val found = gateway()
            if (found != null || attempts >= 16) {
              promise.resolve(found ?: "")
            } else {
              attempts++
              main.postDelayed(poll, 500)
            }
          }
          main.postDelayed(poll, 500)
        }

        override fun onLost(network: Network) {
          // Keep the process bound only while the hotspot link is alive.
          try { manager.bindProcessToNetwork(null) } catch (_: Exception) {}
        }

        override fun onUnavailable() {
          if (completed) return
          completed = true
          networkCallback = null
          try { manager.unregisterNetworkCallback(this) } catch (_: Exception) {}
          promise.reject("WIFI_JOIN_DENIED", "Android did not find or connect to the receiver hotspot. Make sure Mobile Hotspot is on and visible, then choose it from the Wi-Fi list.", null)
        }
      }
      networkCallback = callback
      try {
        manager.requestNetwork(request, callback, 120000)
      } catch (error: Exception) {
        networkCallback = null
        promise.reject("WIFI_JOIN_FAILED", error.message ?: "Could not request the receiver hotspot.", error)
      }
    }

    // Fallback when the in-app Wi-Fi picker is unavailable: the user joined the receiver's hotspot
    // in Android Wi-Fi settings. Bind sockets to that Wi-Fi network (even without internet) and return its gateway.
    AsyncFunction("bindCurrentWifi") {
      val context = appContext.reactContext ?: throw IllegalStateException("Android context is unavailable.")
      val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
      @Suppress("DEPRECATION")
      val wifi = manager.allNetworks.firstOrNull { manager.getNetworkCapabilities(it)?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true }
        ?: throw IllegalStateException("Not connected to Wi-Fi. Join the receiver's hotspot in Wi-Fi settings first.")
      manager.bindProcessToNetwork(wifi)
      findGateway(manager, wifi) ?: ""
    }

    // Private IPv4 addresses of this phone. For the hotspot owner these are the addresses the sender should dial.
    AsyncFunction("localAddresses") {
      val hotspotFirst = mutableListOf<String>()
      val others = mutableListOf<String>()
      val mobilePrefixes = listOf("rmnet", "ccmni", "v4-", "dummy", "tun", "lo", "p2p")
      for (ni in java.net.NetworkInterface.getNetworkInterfaces()?.toList() ?: emptyList()) {
        if (!ni.isUp || ni.isLoopback || mobilePrefixes.any { ni.name.startsWith(it) }) continue
        val isAp = ni.name.startsWith("ap") || ni.name.startsWith("swlan") || ni.name.startsWith("softap") || ni.name == "wlan1"
        for (address in ni.inetAddresses.toList()) {
          val host = (address as? Inet4Address)?.takeIf { it.isSiteLocalAddress }?.hostAddress ?: continue
          if (isAp) hotspotFirst.add(host) else others.add(host)
        }
      }
      (hotspotFirst + others).distinct()
    }

    AsyncFunction("disconnect") {
      val context = appContext.reactContext
      val manager = context?.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
      manager?.bindProcessToNetwork(null)
      networkCallback?.let { callback -> try { manager?.unregisterNetworkCallback(callback) } catch (_: Exception) {} }
      networkCallback = null
    }
  }
}
