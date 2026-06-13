import AppKit
import AVFoundation
import CoreGraphics
import Foundation
import QuartzCore

struct Caption {
  let start: Double
  let end: Double
  let text: String
}

func fail(_ message: String) -> Never {
  fputs("Error: \(message)\n", stderr)
  exit(1)
}

func srtTime(_ seconds: Double) -> String {
  let totalMs = max(0, Int((seconds * 1000.0).rounded()))
  let ms = totalMs % 1000
  let totalSeconds = totalMs / 1000
  let sec = totalSeconds % 60
  let totalMinutes = totalSeconds / 60
  let min = totalMinutes % 60
  let hour = totalMinutes / 60
  return String(format: "%02d:%02d:%02d,%03d", hour, min, sec, ms)
}

func buildCaptions(duration: Double) -> [Caption] {
  let lines = [
    "Agent SpendGuard：让 AI Agent 能花钱，但不能乱花钱",
    "用户先通过 MetaMask Advanced Permissions 授权：1 USDC / 24 小时",
    "Agent 想调用 DeepSeek 风险简报，先生成 spend decision",
    "SpendGuard 检查预算、endpoint、token、network 和 payTo",
    "通过后，x402 返回 402 challenge，客户端构造 ERC-7710 payment payload",
    "1Shot / ERC-7710 结算成功后，才返回 AI 风险简报",
    "账本记录 service price、relay fee、payload hash 和 tx hash",
    "超预算请求会在 paid header 前阻断：没有交易，没有扣款"
  ]

  let usableDuration = max(duration, Double(lines.count) * 1.6)
  let segment = usableDuration / Double(lines.count)

  return lines.enumerated().map { index, text in
    let start = Double(index) * segment
    let end = min(duration, Double(index + 1) * segment - 0.12)
    return Caption(start: min(start, max(0, duration - 0.4)), end: max(end, min(duration, start + 0.4)), text: text)
  }.filter { $0.start < duration && $0.end > $0.start }
}

func writeSrt(_ captions: [Caption], to url: URL) throws {
  let body = captions.enumerated().map { index, caption in
    """
    \(index + 1)
    \(srtTime(caption.start)) --> \(srtTime(caption.end))
    \(caption.text)
    """
  }.joined(separator: "\n\n") + "\n"

  try body.write(to: url, atomically: true, encoding: .utf8)
}

func fittedFontSize(renderSize: CGSize) -> CGFloat {
  let shortSide = min(renderSize.width, renderSize.height)
  return max(32, min(58, shortSide * 0.045))
}

func makeTextLayer(text: String, frame: CGRect, fontSize: CGFloat) -> CATextLayer {
  let layer = CATextLayer()
  layer.string = text
  layer.frame = frame
  layer.alignmentMode = .center
  layer.foregroundColor = NSColor.white.cgColor
  layer.contentsScale = 2.0
  layer.font = "PingFang SC" as CFTypeRef
  layer.fontSize = fontSize
  layer.isWrapped = true
  layer.truncationMode = .none
  layer.shadowColor = NSColor.black.cgColor
  layer.shadowOpacity = 0.72
  layer.shadowOffset = CGSize(width: 0, height: -1)
  layer.shadowRadius = 4
  layer.opacity = 0
  return layer
}

func makeBackgroundLayer(frame: CGRect) -> CALayer {
  let layer = CALayer()
  layer.frame = frame
  layer.backgroundColor = NSColor.black.withAlphaComponent(0.58).cgColor
  layer.cornerRadius = 18
  layer.opacity = 0
  return layer
}

func makeCaptionBitmap(text: String, size: CGSize, fontSize: CGFloat) -> CGImage {
  let image = NSImage(size: size)
  image.lockFocus()

  NSColor.clear.setFill()
  NSBezierPath(rect: CGRect(origin: .zero, size: size)).fill()

  let backgroundRect = CGRect(origin: .zero, size: size)
  let backgroundPath = NSBezierPath(roundedRect: backgroundRect, xRadius: 18, yRadius: 18)
  NSColor.black.withAlphaComponent(0.58).setFill()
  backgroundPath.fill()

  let paragraph = NSMutableParagraphStyle()
  paragraph.alignment = .center
  paragraph.lineBreakMode = .byWordWrapping

  let font =
    NSFont(name: "PingFangSC-Semibold", size: fontSize) ??
    NSFont.boldSystemFont(ofSize: fontSize)
  let attributes: [NSAttributedString.Key: Any] = [
    .font: font,
    .foregroundColor: NSColor.white,
    .paragraphStyle: paragraph
  ]

  let textRect = CGRect(
    x: 24,
    y: (size.height - fontSize * 2.35) / 2.0,
    width: size.width - 48,
    height: fontSize * 2.35
  )
  NSString(string: text).draw(with: textRect, options: [.usesLineFragmentOrigin, .usesFontLeading], attributes: attributes)

  image.unlockFocus()

  var proposedRect = CGRect(origin: .zero, size: size)
  guard let cgImage = image.cgImage(forProposedRect: &proposedRect, context: nil, hints: nil) else {
    fail("Could not render caption image")
  }
  return cgImage
}

func makeCaptionBitmapLayer(text: String, frame: CGRect, fontSize: CGFloat) -> CALayer {
  let layer = CALayer()
  layer.frame = frame
  layer.contents = makeCaptionBitmap(text: text, size: frame.size, fontSize: fontSize)
  layer.contentsGravity = .resizeAspect
  layer.opacity = 0
  return layer
}

func addVisibilityAnimation(to layer: CALayer, start: Double, duration: Double) {
  let animation = CAKeyframeAnimation(keyPath: "opacity")
  animation.values = [0.0, 1.0, 1.0, 0.0]
  animation.keyTimes = [0.0, 0.04, 0.94, 1.0]
  animation.beginTime = AVCoreAnimationBeginTimeAtZero + start
  animation.duration = duration
  animation.fillMode = .both
  animation.isRemovedOnCompletion = false
  layer.add(animation, forKey: "caption-opacity")
}

if CommandLine.arguments.count < 4 {
  fail("Usage: swift burn_demo_subtitles.swift <input.mov> <output.mp4> <output.srt>")
}

let inputURL = URL(fileURLWithPath: CommandLine.arguments[1])
let outputURL = URL(fileURLWithPath: CommandLine.arguments[2])
let srtURL = URL(fileURLWithPath: CommandLine.arguments[3])

let fileManager = FileManager.default
if !fileManager.fileExists(atPath: inputURL.path) {
  fail("Input video does not exist: \(inputURL.path)")
}

try? fileManager.removeItem(at: outputURL)
try? fileManager.removeItem(at: srtURL)

let asset = AVURLAsset(url: inputURL)
let duration = CMTimeGetSeconds(asset.duration)
if !duration.isFinite || duration <= 0 {
  fail("Could not read video duration")
}

let captions = buildCaptions(duration: duration)
try writeSrt(captions, to: srtURL)

let composition = AVMutableComposition()

guard let sourceVideoTrack = asset.tracks(withMediaType: .video).first else {
  fail("Input has no video track")
}

guard let compositionVideoTrack = composition.addMutableTrack(
  withMediaType: .video,
  preferredTrackID: kCMPersistentTrackID_Invalid
) else {
  fail("Could not create video composition track")
}

try compositionVideoTrack.insertTimeRange(
  CMTimeRange(start: .zero, duration: asset.duration),
  of: sourceVideoTrack,
  at: .zero
)

for sourceAudioTrack in asset.tracks(withMediaType: .audio) {
  if let compositionAudioTrack = composition.addMutableTrack(
    withMediaType: .audio,
    preferredTrackID: kCMPersistentTrackID_Invalid
  ) {
    try compositionAudioTrack.insertTimeRange(
      CMTimeRange(start: .zero, duration: asset.duration),
      of: sourceAudioTrack,
      at: .zero
    )
  }
}

let sourceRect = CGRect(origin: .zero, size: sourceVideoTrack.naturalSize)
let transformedRect = sourceRect.applying(sourceVideoTrack.preferredTransform)
let renderSize = CGSize(width: abs(transformedRect.width), height: abs(transformedRect.height))
let finalTransform = sourceVideoTrack.preferredTransform.concatenating(
  CGAffineTransform(translationX: -transformedRect.origin.x, y: -transformedRect.origin.y)
)

let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: compositionVideoTrack)
layerInstruction.setTransform(finalTransform, at: .zero)

let instruction = AVMutableVideoCompositionInstruction()
instruction.timeRange = CMTimeRange(start: .zero, duration: composition.duration)
instruction.layerInstructions = [layerInstruction]

let videoComposition = AVMutableVideoComposition()
videoComposition.instructions = [instruction]
videoComposition.renderSize = renderSize
videoComposition.frameDuration = CMTime(value: 1, timescale: 30)

let parentLayer = CALayer()
let videoLayer = CALayer()
parentLayer.frame = CGRect(origin: .zero, size: renderSize)
videoLayer.frame = parentLayer.frame
parentLayer.addSublayer(videoLayer)

let captionWidth = renderSize.width * 0.86
let captionHeight = max(96, renderSize.height * 0.12)
let bottomInset = max(42, renderSize.height * 0.075)
let captionX = (renderSize.width - captionWidth) / 2.0
let captionY = bottomInset
let backgroundFrame = CGRect(
  x: captionX - 20,
  y: captionY - 16,
  width: captionWidth + 40,
  height: captionHeight + 32
)
let textFrame = CGRect(x: captionX, y: captionY, width: captionWidth, height: captionHeight)
let fontSize = fittedFontSize(renderSize: renderSize)

for caption in captions {
  let captionLayer = makeCaptionBitmapLayer(text: caption.text, frame: backgroundFrame, fontSize: fontSize)
  addVisibilityAnimation(to: captionLayer, start: caption.start, duration: caption.end - caption.start)
  parentLayer.addSublayer(captionLayer)
}

videoComposition.animationTool = AVVideoCompositionCoreAnimationTool(
  postProcessingAsVideoLayer: videoLayer,
  in: parentLayer
)

guard let exportSession = AVAssetExportSession(
  asset: composition,
  presetName: AVAssetExportPresetHighestQuality
) else {
  fail("Could not create export session")
}

exportSession.outputURL = outputURL
exportSession.outputFileType = .mp4
exportSession.shouldOptimizeForNetworkUse = true
exportSession.videoComposition = videoComposition

let semaphore = DispatchSemaphore(value: 0)
exportSession.exportAsynchronously {
  semaphore.signal()
}
semaphore.wait()

switch exportSession.status {
case .completed:
  print("Duration: \(String(format: "%.2f", duration))s")
  print("Output video: \(outputURL.path)")
  print("Output subtitles: \(srtURL.path)")
case .failed, .cancelled:
  fail(exportSession.error?.localizedDescription ?? "Export failed")
default:
  fail("Export ended with unexpected status: \(exportSession.status.rawValue)")
}
