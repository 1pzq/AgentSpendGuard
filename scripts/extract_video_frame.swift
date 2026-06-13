import AppKit
import AVFoundation
import Foundation

func fail(_ message: String) -> Never {
  fputs("Error: \(message)\n", stderr)
  exit(1)
}

if CommandLine.arguments.count < 4 {
  fail("Usage: swift extract_video_frame.swift <input.mp4> <seconds> <output.png>")
}

let inputURL = URL(fileURLWithPath: CommandLine.arguments[1])
let seconds = Double(CommandLine.arguments[2]) ?? 1.0
let outputURL = URL(fileURLWithPath: CommandLine.arguments[3])

let asset = AVURLAsset(url: inputURL)
let generator = AVAssetImageGenerator(asset: asset)
generator.appliesPreferredTrackTransform = true
generator.requestedTimeToleranceBefore = .zero
generator.requestedTimeToleranceAfter = .zero

do {
  let image = try generator.copyCGImage(
    at: CMTime(seconds: seconds, preferredTimescale: 600),
    actualTime: nil
  )
  let bitmap = NSBitmapImageRep(cgImage: image)
  guard let data = bitmap.representation(using: .png, properties: [:]) else {
    fail("Could not encode PNG")
  }
  try data.write(to: outputURL)
  print(outputURL.path)
} catch {
  fail(error.localizedDescription)
}
