// face_track.swift: where the face is, and where it is looking, at every moment of a video.
// Uses Apple's Vision framework (built into macOS, free, on-device).
// usage: swift scripts/face_track.swift <video> <out.json> [fps, default 10]
// Output: {"w","h","dur","fps","frames":[{"t","box":[x0,y0,x1,y1] in 0..1 from top-left or null,
//          "pitch","yaw" in degrees or null, "eyes": 0..1 how open (null if unknown), "mouth": inner lips height/width}]}
import AVFoundation
import Vision
import Foundation

let args = CommandLine.arguments
guard args.count >= 3 else { print("usage: swift face_track.swift <video> <out.json> [fps]"); exit(2) }
let url = URL(fileURLWithPath: args[1])
let fps = args.count > 3 ? Double(args[3]) ?? 10 : 10
let asset = AVURLAsset(url: url)
let sem = DispatchSemaphore(value: 0)
var dur = 0.0
var size = CGSize.zero
Task {
    dur = (try? await asset.load(.duration).seconds) ?? 0
    if let tr = try? await asset.loadTracks(withMediaType: .video).first {
        let s = (try? await tr.load(.naturalSize)) ?? .zero
        let t = (try? await tr.load(.preferredTransform)) ?? .identity
        let r = CGRect(origin: .zero, size: s).applying(t)
        size = CGSize(width: abs(r.width), height: abs(r.height))
    }
    sem.signal()
}
sem.wait()
let gen = AVAssetImageGenerator(asset: asset)
gen.appliesPreferredTrackTransform = true
gen.requestedTimeToleranceBefore = CMTime(value: 1, timescale: 60)
gen.requestedTimeToleranceAfter = CMTime(value: 1, timescale: 60)
gen.maximumSize = CGSize(width: 960, height: 960)

func openness(_ pts: [CGPoint]) -> Double? {
    guard pts.count >= 4 else { return nil }
    let xs = pts.map { $0.x }, ys = pts.map { $0.y }
    let w = (xs.max()! - xs.min()!), h = (ys.max()! - ys.min()!)
    return w > 0 ? Double(h / w) : nil
}

var frames: [[String: Any]] = []
var t = 0.0
while t < dur {
    var rec: [String: Any] = ["t": (t * 1000).rounded() / 1000]
    if let cg = try? gen.copyCGImage(at: CMTime(seconds: t, preferredTimescale: 600), actualTime: nil) {
        let req = VNDetectFaceLandmarksRequest()
        let rect = VNDetectFaceRectanglesRequest()
        if #available(macOS 12.0, *) { rect.revision = VNDetectFaceRectanglesRequestRevision3 }
        let h = VNImageRequestHandler(cgImage: cg, options: [:])
        try? h.perform([req, rect])
        let big = (rect.results ?? []).max(by: { $0.boundingBox.width * $0.boundingBox.height < $1.boundingBox.width * $1.boundingBox.height })
        if let f = (req.results ?? []).max(by: { $0.boundingBox.width * $0.boundingBox.height < $1.boundingBox.width * $1.boundingBox.height }) {
            let b = f.boundingBox   // origin bottom-left, normalised
            rec["box"] = [b.minX, 1 - b.maxY, b.maxX, 1 - b.minY].map { ($0 * 10000).rounded() / 10000 }
            let pv = big?.pitch ?? f.pitch, yv = big?.yaw ?? f.yaw
            rec["pitch"] = pv.map { ($0.doubleValue * 180 / .pi * 10).rounded() / 10 } ?? NSNull()
            rec["yaw"] = yv.map { ($0.doubleValue * 180 / .pi * 10).rounded() / 10 } ?? NSNull()
            // where the pupils sit inside the eyes, 0 = top, 1 = bottom (looking down pushes this up)
            if let lp = f.landmarks?.leftPupil?.normalizedPoints.first, let le = f.landmarks?.leftEye?.normalizedPoints, le.count > 3 {
                let ys = le.map { $0.y }
                let lo = ys.min()!, hi = ys.max()!
                if hi > lo { rec["gaze"] = (Double((hi - lp.y) / (hi - lo)) * 1000).rounded() / 1000 }
            }
            var eyes: [Double] = []
            if let l = f.landmarks?.leftEye?.normalizedPoints, let v = openness(l) { eyes.append(v) }
            if let r = f.landmarks?.rightEye?.normalizedPoints, let v = openness(r) { eyes.append(v) }
            rec["eyes"] = eyes.isEmpty ? NSNull() : ((eyes.reduce(0, +) / Double(eyes.count)) * 1000).rounded() / 1000
            // how open the mouth is (inner lips height / width), for the lip sync test
            if let m = f.landmarks?.innerLips?.normalizedPoints, let v = openness(m) { rec["mouth"] = (v * 1000).rounded() / 1000 }
        } else {
            rec["box"] = NSNull()
        }
    }
    frames.append(rec)
    t += 1.0 / fps
}
let out: [String: Any] = ["w": size.width, "h": size.height, "dur": dur, "fps": fps, "frames": frames]
let data = try JSONSerialization.data(withJSONObject: out, options: [])
try data.write(to: URL(fileURLWithPath: args[2]))
let found = frames.filter { !($0["box"] is NSNull) }.count
print("face found in \(found) of \(frames.count) frames -> \(args[2])")
