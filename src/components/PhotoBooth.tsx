import { Camera, CameraOff } from "lucide-react";
import { toast } from "sonner";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  DEFAULT_ADJUST,
  FRAMES,
  Frame,
  windowPct,
  composite,
  drawComposite,
  loadImage,
} from "@/lib/frames";

type Mode = "camera" | "preview" | "video";
type CamStatus = "idle" | "starting" | "ready" | "error";
type CamError = {
  title: string;
  message: string;
  hints: string[];
  canRetry: boolean;
};

function describeError(err: unknown): CamError {
  const name = (err as { name?: string })?.name ?? "";
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const settingsHint = isIOS
    ? "iPhone / iPad：點網址列左側的「ᴀA」→ 網站設定 → 相機 → 允許，再按下方「重新嘗試」。"
    : "點網址列左側的鎖頭圖示 → 權限 / 相機 → 允許，再按下方「重新嘗試」。";

  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return {
        title: "相機權限被拒絕",
        message: "瀏覽器目前封鎖了本網站的相機權限，需要重新授權才能使用拍貼機。",
        hints: [settingsHint, "若使用 LINE、Facebook 等 App 內建瀏覽器，請改用 Safari 或 Chrome 開啟本頁。"],
        canRetry: true,
      };
    case "NotFoundError":
    case "OverconstrainedError":
      return {
        title: "找不到可用的相機",
        message: "此裝置沒有偵測到相機，或所選的鏡頭不存在。",
        hints: ["請試著按「翻轉鏡頭」切換前／後鏡頭。", "確認裝置已連接相機後再重新嘗試。"],
        canRetry: true,
      };
    case "NotReadableError":
    case "AbortError":
      return {
        title: "相機正被其他程式使用",
        message: "無法讀取相機畫面，可能已被其他 App 或分頁佔用。",
        hints: ["關閉其他正在使用相機的視訊軟體或分頁。", "關閉後按「重新嘗試」。"],
        canRetry: true,
      };
    default:
      return {
        title: "無法開啟相機",
        message: "發生未預期的問題，請稍後再試一次。",
        hints: ["重新整理頁面後再開啟拍貼機。"],
        canRetry: true,
      };
  }
}

export function PhotoBooth() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rawRef = useRef<HTMLImageElement | null>(null);

  const [frameIdx, setFrameIdx] = useState(0);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [mode, setMode] = useState<Mode>("camera");
  const [result, setResult] = useState<string | null>(null);
  const [status, setStatus] = useState<CamStatus>("idle");
  const [error, setError] = useState<CamError | null>(null);
  const [recording, setRecording] = useState(false);
  const [armed, setArmed] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const frame = FRAMES[frameIdx]!;
  const mirror = facing === "user";

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const rafRef = useRef<number | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const liveRef = useRef<{ frame: Frame; mirror: boolean }>({ frame, mirror });
  liveRef.current = { frame, mirror };
  const videoExtRef = useRef("mp4");
  const audioStreamRef = useRef<MediaStream | null>(null);


  const startCamera = useCallback(async () => {
    setError(null);
    setStatus("starting");

    if (typeof window !== "undefined" && !window.isSecureContext) {
      setStatus("error");
      setError({
        title: "連線不安全，無法使用相機",
        message: "瀏覽器只允許在 HTTPS 網站上使用相機。",
        hints: ["請改用 https:// 開頭的網址重新開啟本頁。"],
        canRetry: false,
      });
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("error");
      setError({
        title: "此瀏覽器不支援相機",
        message: "目前的瀏覽器無法存取相機功能。",
        hints: ["請改用最新版的 Safari、Chrome 或 Edge 開啟本頁。"],
        canRetry: false,
      });
      return;
    }

    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1920 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setStatus("ready");
    } catch (err) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setStatus("error");
      setError(describeError(err));
      toast.error(describeError(err).title);
    }
  }, [facing]);

  useEffect(() => {
    if (mode === "camera") startCamera();
    return () => streamRef.current?.getTracks().forEach((t) => t.stop());
  }, [mode, startCamera]);


  // re-composite whenever the frame changes in preview mode
  useEffect(() => {
    const img = rawRef.current;
    if (mode !== "preview" || !img) return;
    let alive = true;
    composite(img, img.naturalWidth, img.naturalHeight, frame, DEFAULT_ADJUST).then((url) => {
      if (alive) setResult(url);
    });
    return () => {
      alive = false;
    };
  }, [mode, frame]);

  const capture = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    const ctx = c.getContext("2d")!;
    if (mirror) {
      ctx.translate(c.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);
    rawRef.current = await loadImage(c.toDataURL("image/png"));
    setMode("preview");
  };

  const retake = () => {
    rawRef.current = null;
    setResult(null);
    setMode("camera");
  };

  const cleanupRecording = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    audioStreamRef.current?.getTracks().forEach((t) => t.stop());
    audioStreamRef.current = null;
  };

  const stopRecording = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  }, []);

  // stage 1: enter video mode (camera preview stays live, waiting for 開始錄影)
  const armRecording = () => {
    if (recording || status !== "ready") return;
    setArmed(true);
  };

  const cancelArmed = () => setArmed(false);

  // stage 2: actually start recording video + audio
  const startRecording = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || recording) return;
    setArmed(false);
    if (typeof MediaRecorder === "undefined") {
      toast.error("此瀏覽器不支援錄影功能");
      return;
    }

    const overlay = await loadImage(frame.overlay);
    const cw = frame.canvas.w;
    const ch = frame.canvas.h;
    const scale = Math.min(1, 720 / Math.max(cw, ch));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(cw * scale);
    canvas.height = Math.round(ch * scale);
    const ctx = canvas.getContext("2d")!;

    const draw = () => {
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      const { frame: f, adjust: a, mirror: m } = liveRef.current;
      drawComposite(ctx, video, video.videoWidth, video.videoHeight, f, a, overlay, m);
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();

    const candidates = [
      "video/mp4;codecs=avc1",
      "video/mp4",
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
    ];
    const mime = candidates.find((t) => MediaRecorder.isTypeSupported?.(t)) ?? "";
    videoExtRef.current = mime.includes("mp4") ? "mp4" : "webm";

    // request microphone; recording continues silently if denied
    try {
      audioStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch {
      audioStreamRef.current = null;
      toast.warning("無法錄製聲音", { description: "已繼續錄影，但影片將沒有聲音。請確認麥克風權限。" });
    }

    const stream = canvas.captureStream(30);
    audioStreamRef.current?.getAudioTracks().forEach((t) => stream.addTrack(t));
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      cleanupRecording();
      setRecording(false);
      const blob = new Blob(chunksRef.current, { type: mime || "video/webm" });
      setVideoUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
      setMode("video");
      toast.success("錄影完成");
    };
    recorderRef.current = rec;
    rec.start();
    setRecording(true);
    setCountdown(5);

    for (let s = 1; s <= 5; s++) {
      timersRef.current.push(setTimeout(() => setCountdown(5 - s), s * 1000));
    }
    timersRef.current.push(setTimeout(() => stopRecording(), 5_000));
  };

  useEffect(() => cleanupRecording, []);

  const videoFileName = () => `BLIA2026-${Date.now()}.${videoExtRef.current}`;

  const saveVideo = () => {
    if (!videoUrl) return;
    const a = document.createElement("a");
    a.href = videoUrl;
    a.download = videoFileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const shareVideo = async () => {
    if (!videoUrl) return;
    try {
      const blob = await (await fetch(videoUrl)).blob();
      const file = new File([blob], videoFileName(), { type: blob.type || "video/mp4" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "2026國際佛光會 與大師合影",
          text: "2026國際佛光會 世界會員代表大會｜與大師合影",
        });
        return;
      }
      throw new Error("unsupported");
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return;
      toast.error("此瀏覽器不支援直接分享影片", {
        description: "請先按「儲存錄影」，再到 LINE、Facebook、Instagram 或 Gmail 附上影片分享。",
      });
    }
  };

  const reRecord = () => {
    setVideoUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setMode("camera");
  };


  const fileName = () => `BLIA2026-${Date.now()}.png`;

  const save = () => {
    if (!result) return;
    const a = document.createElement("a");
    a.href = result;
    a.download = fileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const share = async () => {
    if (!result) return;
    try {
      const blob = await (await fetch(result)).blob();
      const file = new File([blob], fileName(), { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "2026國際佛光會 與大師合影",
          text: "2026國際佛光會 世界會員代表大會｜與大師合影",
        });
        return;
      }
      if (navigator.share) {
        await navigator.share({
          title: "2026國際佛光會 與大師合影",
          text: "2026國際佛光會 世界會員代表大會｜與大師合影",
          url: window.location.href,
        });
        return;
      }
      throw new Error("unsupported");
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(window.location.href);
        toast.error("此瀏覽器不支援直接分享相片", {
          description: "網址已複製。請先按「儲存照片」，再到 LINE、Facebook、Instagram 或 Gmail 附上照片分享。",
        });
      } catch {
        toast.error("此瀏覽器不支援直接分享相片", {
          description: "請先按「儲存照片」，再到 LINE、Facebook、Instagram 或 Gmail 附上照片分享。",
        });
      }
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, ox: adjust.offsetX, oy: adjust.offsetY };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setAdjust((a) => ({
      ...a,
      offsetX: d.ox + (e.clientX - d.x) / rect.width,
      offsetY: d.oy + (e.clientY - d.y) / rect.height,
    }));
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  const pct = windowPct(frame);
  // keep the camera strictly inside the window so the frame border stays visible
  const windowStyle = {
    left: `${pct.left}%`,
    top: `${pct.top}%`,
    width: `${pct.width}%`,
    height: `${pct.height}%`,
  };

  const mediaTransform = `translate(${adjust.offsetX * 100}%, ${adjust.offsetY * 100}%) scale(${adjust.zoom})${mirror && mode === "camera" ? " scaleX(-1)" : ""}`;

  return (
    <div className="mx-auto w-full max-w-lg space-y-5">
      <div className="relative w-full bg-card shadow-frame">
        <div className="relative w-full" style={{ aspectRatio: `${frame.canvas.w} / ${frame.canvas.h}` }}>
          {/* photo window (behind the frame artwork) */}
          <div
            className="absolute overflow-hidden bg-black touch-none cursor-grab active:cursor-grabbing"
            style={windowStyle}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {mode === "camera" ? (
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className="h-full w-full object-cover"
                style={{ transform: mediaTransform }}
              />
            ) : null}

            {mode === "camera" && status !== "ready" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
                {status === "error" ? (
                  <>
                    <CameraOff className="h-8 w-8 text-accent" />
                    <p className="text-sm font-semibold text-accent">{error?.title}</p>
                    <p className="text-xs text-accent/80">請依下方說明重新授權相機</p>
                  </>
                ) : (
                  <>
                    <Camera className="h-8 w-8 animate-pulse text-accent" />
                    <p className="text-xs text-accent/80">正在啟動相機，請於跳出的視窗按「允許」</p>
                  </>
                )}
              </div>
            )}
          </div>

          {/* frame artwork always on top of the camera */}
          {mode === "camera" ? (
            <>
              <img
                src={frame.overlay}
                alt="活動圖框"
                className="pointer-events-none absolute inset-0 z-10 h-full w-full select-none object-contain"
              />
              {recording && (
                <div className="pointer-events-none absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full bg-destructive px-3 py-1 text-xs font-bold text-destructive-foreground">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
                  錄影中 {countdown}s
                </div>
              )}
              {armed && !recording && (
                <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">
                  影片模式｜按「開始錄影」即錄影並錄製聲音
                </div>
              )}
            </>
          ) : mode === "video" ? (
            videoUrl && (
              <video
                src={videoUrl}
                controls
                autoPlay
                loop
                playsInline
                className="absolute inset-0 h-full w-full object-contain"
              />
            )
          ) : (
            result && (
              <img src={result} alt="合成預覽" className="absolute inset-0 h-full w-full object-contain" />
            )
          )}

        </div>
      </div>

      {error && (
        <div className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4">
          <p className="text-sm font-bold text-destructive">{error.title}</p>
          <p className="text-xs text-foreground/80">{error.message}</p>
          <ul className="list-disc space-y-1 pl-5 text-xs text-foreground/80">
            {error.hints.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            {error.canRetry && (
              <button onClick={startCamera} className="btn-gold" disabled={status === "starting"}>
                {status === "starting" ? "重新連線中…" : "重新嘗試"}
              </button>
            )}
            <button onClick={() => window.location.reload()} className="btn-outline">
              重新整理頁面
            </button>
          </div>
        </div>
      )}


      {mode === "camera" && (
        <div className="flex flex-wrap justify-center gap-3">
          {recording ? (
            <button onClick={stopRecording} className="btn-gold">
              結束錄影
            </button>
          ) : armed ? (
            <>
              <button onClick={startRecording} className="btn-gold">
                開始錄影
              </button>
              <button onClick={cancelArmed} className="btn-outline">
                取消
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
                className="btn-outline"
              >
                翻轉鏡頭
              </button>
              <button onClick={capture} className="btn-gold disabled:opacity-50" disabled={status !== "ready"}>
                拍照
              </button>
              <button
                onClick={armRecording}
                className="btn-gold disabled:opacity-50"
                disabled={status !== "ready"}
              >
                錄影
              </button>
            </>
          )}
        </div>
      )}

      {mode === "camera" && !recording && (
        <div>
          <p className="mb-2 text-sm font-semibold text-foreground">圖框樣式</p>
          <div className="grid grid-cols-3 gap-3">
            {FRAMES.map((f, i) => (
              <button
                key={f.id}
                onClick={() => setFrameIdx(i)}
                className={`overflow-hidden rounded-xl border-2 transition ${
                  i === frameIdx ? "border-primary shadow-frame" : "border-border opacity-80"
                }`}
              >
                <img src={f.url} alt={f.label} className="aspect-square w-full bg-card object-contain" />
                <span className="block bg-card py-1 text-xs text-card-foreground">{f.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}


      {mode === "camera" && !recording && !armed && (
      <div className="space-y-3 rounded-xl bg-card p-4 shadow-frame">
        <p className="text-sm font-semibold text-card-foreground">對位微調（可直接拖曳畫面）</p>
        <Slider label="縮放" min={0.5} max={2} step={0.01} value={adjust.zoom} onChange={(v) => setAdjust((a) => ({ ...a, zoom: v }))} />
        <Slider label="水平" min={-0.5} max={0.5} step={0.005} value={adjust.offsetX} onChange={(v) => setAdjust((a) => ({ ...a, offsetX: v }))} />
        <Slider label="垂直" min={-0.5} max={0.5} step={0.005} value={adjust.offsetY} onChange={(v) => setAdjust((a) => ({ ...a, offsetY: v }))} />
        <button
          onClick={() => setAdjust(DEFAULT_ADJUST)}
          className="rounded-full border border-border px-4 py-1.5 text-xs text-card-foreground"
        >
          置中還原
        </button>
      </div>
      )}

      <div className="flex flex-wrap justify-center gap-3 pb-8">
        {mode === "preview" && (
          <>
            <button onClick={save} className="btn-gold">儲存照片</button>
            <button onClick={share} className="btn-gold">分享照片</button>
            <button onClick={retake} className="btn-outline">重新拍照</button>
          </>
        )}
        {mode === "video" && (
          <>
            <button onClick={saveVideo} className="btn-gold">儲存錄影</button>
            <button onClick={shareVideo} className="btn-gold">分享錄影</button>
            <button onClick={reRecord} className="btn-outline">重新錄影</button>
          </>
        )}
      </div>

    </div>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="w-8 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-full accent-primary"
      />
    </label>
  );
}
