require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'ShareKitaHotspot'
  s.version        = package['version']
  s.summary        = 'ShareKita nearby-transfer helpers (AES-GCM and local addresses)'
  s.description    = 'Local Expo module used by ShareKita for chunk encryption and local network addresses.'
  s.license        = 'MIT'
  s.author         = 'ShareKita'
  s.homepage       = 'https://sharekita.app'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,m,mm,swift}'
end
