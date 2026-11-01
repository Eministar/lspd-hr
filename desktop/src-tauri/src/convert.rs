//! Hilfen für den in Windows eingebauten MediaTranscoder (Hardware-Encoder der
//! Grafikkarte: NVENC, Quick Sync, AMF). Genutzt beim Rendern der Kill-Clips.

use std::path::Path;

use windows::{
    core::HSTRING,
    Foundation::TimeSpan,
    Media::MediaProperties::{MediaEncodingProfile, VideoEncodingQuality},
};

pub(crate) fn span(seconds: f64) -> TimeSpan {
    TimeSpan { Duration: (seconds.max(0.0) * 10_000_000.0).round() as i64 }
}

/// WinRT akzeptiert nur absolute Pfade mit Backslash.
pub(crate) fn winrt_path(path: &Path) -> HSTRING {
    let absolute = std::path::absolute(path).unwrap_or_else(|_| path.to_path_buf());
    HSTRING::from(absolute.to_string_lossy().replace('/', "\\"))
}

pub(crate) fn winrt<T>(result: windows::core::Result<T>, what: &str) -> Result<T, String> {
    result.map_err(|e| format!("{what}: {}", e.message()))
}

/// Zielprofil: H.264 in der gewünschten Höhe (nie hochskaliert), höchstens `max_fps`.
pub(crate) fn compressed_profile(source: Option<&MediaEncodingProfile>, height: u32, bitrate: u32, max_fps: u32) -> windows::core::Result<MediaEncodingProfile> {
    let quality = if height >= 1080 { VideoEncodingQuality::HD1080p } else { VideoEncodingQuality::HD720p };
    let profile = MediaEncodingProfile::CreateMp4(quality)?;
    let video = profile.Video()?;

    let (src_w, src_h, src_fps) = source
        .and_then(|p| p.Video().ok())
        .map(|v| {
            let fps = v
                .FrameRate()
                .ok()
                .and_then(|r| Some((r.Numerator().ok()?, r.Denominator().ok()?)))
                .filter(|(_, d)| *d > 0)
                .map(|(n, d)| n / d)
                .unwrap_or(max_fps);
            (v.Width().unwrap_or(0), v.Height().unwrap_or(0), fps)
        })
        .unwrap_or((0, 0, max_fps));

    if src_w > 0 && src_h > 0 {
        let h = height.min(src_h) & !1;
        let w = ((src_w as f64 * h as f64 / src_h as f64).round() as u32) & !1;
        video.SetWidth(w)?;
        video.SetHeight(h)?;
    }
    video.SetBitrate(bitrate)?;
    let rate = video.FrameRate()?;
    rate.SetNumerator(src_fps.clamp(1, max_fps))?;
    rate.SetDenominator(1)?;
    if let Ok(audio) = profile.Audio() {
        audio.SetBitrate(128_000)?;
    }
    Ok(profile)
}
