import { Camera, CameraOff } from "lucide-react";
import { toast } from "sonner";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  Adjust,
  DEFAULT_ADJUST,
  FRAMES,
  windowPct,
  composite,
  loadImage,
} from "@/lib/frames";

type Mode = "camera" | "preview";
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
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const rawRef = useRef<HTMLImageElement | null>(null);

  const [frameIdx, setFrameIdx] = useState(0);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [mode, setMode] = useState<Mode>("camera");
  const [adjust, setAdjust] = useState<Adjust>(DEFAULT_ADJUST);
  const [result, setResult] = useState<string | null>(null);
  const [status, setStatus] = useState<CamStatus>("idle");
  const [error, setError] = useState<CamError | null>(null);

  const frame = FRAMES[frameIdx]!;
  const mirror = facing === "user";

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


  // re-composite whenever adjustments / frame change in preview mode
  useEffect(() => {
    const img = rawRef.current;
    if (mode !== "preview" || !img) return;
    let alive = true;
    composite(img, img.naturalWidth, img.naturalHeight, frame, adjust).then((url) => {
      if (alive) setResult(url);
    });
    return () => {
      alive = false;
    };
  }, [mode, adjust, frame]);

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

  const save = () => {
    if (!result) return;
    const a = document.createElement("a");
    a.href = result;
    a.download = `BLIA2026-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
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
  // bleed slightly outward so the frame border always overlaps the camera edge
  const bleedX = pct.width * 0.02;
  const bleedY = pct.height * 0.02;
  const windowStyle = {
    left: `${pct.left - bleedX}%`,
    top: `${pct.top - bleedY}%`,
    width: `${pct.width + bleedX * 2}%`,
    height: `${pct.height + bleedY * 2}%`,
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
            <img
              src={frame.overlay}
              alt="活動圖框"
              className="pointer-events-none absolute inset-0 z-10 h-full w-full select-none object-contain"
            />
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
        <div className="flex justify-center gap-3">
          <button
            onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
            className="btn-outline"
          >
            翻轉鏡頭
          </button>
          <button onClick={capture} className="btn-gold disabled:opacity-50" disabled={status !== "ready"}>
            拍照
          </button>
        </div>
      )}

      {mode === "camera" && (
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

      <div className="flex flex-wrap justify-center gap-3 pb-8">
        {mode === "preview" && (
          <>
            <button onClick={save} className="btn-gold">儲存照片</button>
            <button onClick={retake} className="btn-outline">重新拍照</button>
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
