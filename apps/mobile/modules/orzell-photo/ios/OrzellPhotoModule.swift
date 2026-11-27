import ExpoModulesCore
import Foundation
import ImageIO
import UniformTypeIdentifiers

private enum PhotoError: Error { case invalidSource, encodingFailed }

public final class OrzellPhotoModule: Module {
  public func definition() -> ModuleDefinition {
    Name("OrzellPhoto")
    AsyncFunction("encode") { (uri: String, maxEdge: Int, quality: Double) -> [String: Any] in
      let fm = FileManager.default
      guard let url = URL(string: uri), url.isFileURL,
            (1...1600).contains(maxEdge), (0...1).contains(quality) else {
        throw PhotoError.invalidSource
      }
      let input = url.resolvingSymlinksInPath().standardizedFileURL
      let roots = [fm.urls(for: .documentDirectory, in: .userDomainMask)[0],
                   fm.urls(for: .cachesDirectory, in: .userDomainMask)[0], fm.temporaryDirectory]
      guard roots.contains(where: { input.path.hasPrefix($0.resolvingSymlinksInPath().standardizedFileURL.path + "/") }) else {
        throw PhotoError.invalidSource
      }
      let info = try input.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey])
      guard info.isRegularFile == true, let bytes = info.fileSize, (1...41943040).contains(bytes),
            let source = CGImageSourceCreateWithURL(input as CFURL, [kCGImageSourceShouldCache: false] as CFDictionary),
            let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
            let width = properties[kCGImagePropertyPixelWidth] as? Int,
            let height = properties[kCGImagePropertyPixelHeight] as? Int,
            height > 0, width > 0, width <= 64000000 / height else {
        throw PhotoError.invalidSource
      }
      let options: [CFString: Any] = [kCGImageSourceCreateThumbnailFromImageAlways: true,
                                     kCGImageSourceCreateThumbnailWithTransform: true,
                                     kCGImageSourceThumbnailMaxPixelSize: maxEdge]
      guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
        throw PhotoError.encodingFailed
      }
      let output = roots[1].appendingPathComponent(UUID().uuidString + ".jpg")
      guard let dest = CGImageDestinationCreateWithURL(output as CFURL, UTType.jpeg.identifier as CFString, 1, nil) else {
        throw PhotoError.encodingFailed
      }
      // Add decoded pixels only. Source GPS, EXIF and comments must stay on device.
      CGImageDestinationAddImage(dest, image, [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary)
      guard CGImageDestinationFinalize(dest) else {
        try? fm.removeItem(at: output)
        throw PhotoError.encodingFailed
      }
      return ["uri": output.absoluteString, "width": image.width, "height": image.height]
    }.runOnQueue(DispatchQueue(label: "app.orzell.photo.encode", qos: .userInitiated))
  }
}
