Pod::Spec.new do |s|
  s.name = 'OrzellPhoto'
  s.version = '1.0.0'
  s.summary = 'Local consultation photo preparation'
  s.description = s.summary
  s.author = 'ORZELL'
  s.homepage = 'https://orzell.app'
  s.license = { :type => 'Proprietary' }
  s.source = { :git => 'https://github.com/umutbarut7-svg/Beauty-platform.git' }
  s.platform = :ios, '16.4'
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '*.swift'
  s.frameworks = 'ImageIO', 'UniformTypeIdentifiers'
end
