import ExpoModulesCore
import CryptoKit
import Foundation

/// iOS side of the ShareKita native module.
/// Wire format matches the Android module exactly: base64( nonce(12) || ciphertext || tag(16) ),
/// AES-128-GCM, AAD = "<transferId>:<index>".
public class ShareKitaHotspotModule: Module {
  private func randomBytes(_ count: Int) -> Data {
    var bytes = [UInt8](repeating: 0, count: count)
    _ = SecRandomCopyBytes(kSecRandomDefault, count, &bytes)
    return Data(bytes)
  }

  private func aad(_ transferId: String, _ index: Int) -> Data {
    return "\(transferId):\(index)".data(using: .utf8) ?? Data()
  }

  public func definition() -> ModuleDefinition {
    Name("ShareKitaHotspot")

    AsyncFunction("generateSessionKey") { () -> String in
      return self.randomBytes(16).base64EncodedString()
    }

    AsyncFunction("generatePairingToken") { () -> String in
      return self.randomBytes(16).map { String(format: "%02x", $0) }.joined()
    }

    AsyncFunction("encryptChunk") { (keyB64: String, transferId: String, index: Int, dataB64: String) throws -> String in
      guard let keyData = Data(base64Encoded: keyB64), let plain = Data(base64Encoded: dataB64) else {
        throw NSError(domain: "ShareKita", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid key or data."])
      }
      let sealed = try AES.GCM.seal(plain, using: SymmetricKey(data: keyData), nonce: AES.GCM.Nonce(), authenticating: self.aad(transferId, index))
      guard let combined = sealed.combined else {
        throw NSError(domain: "ShareKita", code: 2, userInfo: [NSLocalizedDescriptionKey: "Could not encrypt the chunk."])
      }
      return combined.base64EncodedString()
    }

    AsyncFunction("decryptChunk") { (keyB64: String, transferId: String, index: Int, encryptedB64: String) throws -> String in
      guard let keyData = Data(base64Encoded: keyB64), let data = Data(base64Encoded: encryptedB64), data.count >= 28 else {
        throw NSError(domain: "ShareKita", code: 3, userInfo: [NSLocalizedDescriptionKey: "Encrypted chunk is incomplete."])
      }
      let box = try AES.GCM.SealedBox(combined: data)
      let plain = try AES.GCM.open(box, using: SymmetricKey(data: keyData), authenticating: self.aad(transferId, index))
      return plain.base64EncodedString()
    }

    // Private IPv4 addresses of this phone (hotspot host: 172.20.10.1 on iPhone Personal Hotspot).
    AsyncFunction("localAddresses") { () -> [String] in
      var results: [(String, String)] = []
      var ifaddr: UnsafeMutablePointer<ifaddrs>?
      guard getifaddrs(&ifaddr) == 0, let first = ifaddr else { return [] }
      defer { freeifaddrs(ifaddr) }
      var ptr: UnsafeMutablePointer<ifaddrs>? = first
      while let current = ptr {
        let iface = current.pointee
        if let addr = iface.ifa_addr, addr.pointee.sa_family == UInt8(AF_INET) {
          let name = String(cString: iface.ifa_name)
          // en* = Wi-Fi, bridge* = Personal Hotspot. Skip cellular (pdp_ip*) and loopback.
          if name.hasPrefix("en") || name.hasPrefix("bridge") {
            var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
            if getnameinfo(addr, socklen_t(addr.pointee.sa_len), &host, socklen_t(host.count), nil, 0, NI_NUMERICHOST) == 0 {
              results.append((name, String(cString: host)))
            }
          }
        }
        ptr = iface.ifa_next
      }
      // Hotspot bridge first.
      return results.sorted { $0.0.hasPrefix("bridge") && !$1.0.hasPrefix("bridge") }.map { $0.1 }
    }

    // iOS cannot join Wi-Fi from an app without a special entitlement; the JS side guides the user to Settings.
    AsyncFunction("connect") { (_ssid: String, _password: String, _wpa3: Bool, _hidden: Bool) throws -> String in
      throw NSError(domain: "ShareKita", code: 10, userInfo: [NSLocalizedDescriptionKey: "Join the receiver's hotspot in Settings > Wi-Fi, then scan again."])
    }
    AsyncFunction("bindCurrentWifi") { () -> String in return "" }
    AsyncFunction("disconnect") { () -> Void in }
    AsyncFunction("openHotspotSettings") { () -> Void in }
    AsyncFunction("openWifiSettings") { () -> Void in }
  }
}
