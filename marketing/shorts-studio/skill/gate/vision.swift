// Apple Vision helper for check.py (free, on-device).
// usage: vision <faces|text|all> <frame1.jpg> [frame2.jpg ...]
// Prints one JSON object per frame, one per line. Boxes are 0..1, origin top-left.
//   faces:  [{x,y,w,h,c,yaw,roll}]   (yaw/roll in degrees, null if unknown)
//   humans: [{x,y,w,h,c}]             (upper body, the person can face away)
//   text:   [{s,x,y,w,h,c}]           (one entry per recognised line)
import Foundation
import Vision
import AppKit

func box(_ b: CGRect) -> [String: Double] {
    return ["x": Double(b.minX), "y": Double(1 - b.maxY), "w": Double(b.width), "h": Double(b.height)]
}
func deg(_ n: NSNumber?) -> Any { if let v = n { return v.doubleValue * 180.0 / Double.pi }; return NSNull() }

let args = CommandLine.arguments
guard args.count >= 3 else { FileHandle.standardError.write("usage: vision <faces|text|all> frames...\n".data(using: .utf8)!); exit(2) }
let mode = args[1]
for path in args.dropFirst(2) {
    var out: [String: Any] = ["f": path]
    guard let img = NSImage(contentsOfFile: path), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
        out["error"] = "unreadable"
        if let d = try? JSONSerialization.data(withJSONObject: out), let s = String(data: d, encoding: .utf8) { print(s) }
        continue
    }
    var reqs: [VNRequest] = []
    let fr = VNDetectFaceRectanglesRequest()
    let hr = VNDetectHumanRectanglesRequest()
    hr.upperBodyOnly = true
    let tr = VNRecognizeTextRequest()
    tr.recognitionLevel = .accurate
    tr.usesLanguageCorrection = false
    tr.minimumTextHeight = 0.008
    if mode == "faces" || mode == "all" { reqs.append(fr); reqs.append(hr) }
    if mode == "text" || mode == "all" { reqs.append(tr) }
    try? VNImageRequestHandler(cgImage: cg, options: [:]).perform(reqs)
    if mode == "faces" || mode == "all" {
        out["faces"] = (fr.results ?? []).map { f -> [String: Any] in
            var d: [String: Any] = box(f.boundingBox)
            d["c"] = Double(f.confidence); d["yaw"] = deg(f.yaw); d["roll"] = deg(f.roll)
            return d
        }
        out["humans"] = (hr.results ?? []).map { h -> [String: Any] in
            var d: [String: Any] = box(h.boundingBox); d["c"] = Double(h.confidence); return d
        }
    }
    if mode == "text" || mode == "all" {
        out["text"] = (tr.results ?? []).compactMap { o -> [String: Any]? in
            guard let c = o.topCandidates(1).first else { return nil }
            var d: [String: Any] = box(o.boundingBox); d["s"] = c.string; d["c"] = Double(c.confidence); return d
        }
    }
    if let d = try? JSONSerialization.data(withJSONObject: out), let s = String(data: d, encoding: .utf8) { print(s) }
}
