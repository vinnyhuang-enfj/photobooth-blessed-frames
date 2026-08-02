import { useCallback, useEffect, useRef, useState } from "react";
import {
  Adjust,
  DEFAULT_ADJUST,
  FRAMES,
  WINDOW_PCT,
  composite,
  loadImage,
} from "@/lib/frames";

type Mode = "camera" | "preview";

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
  const [error, setError] = useState<string | null>(null);

  const frame = FRAMES[frameIdx]!;
  const mirror = facing === "user";

  const startCamera = useCallback(async () => {
    setError(null);
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
    } catch {
      setError("無法開啟相機，請確認已允許瀏覽器使用相機權限。");
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
    composite(img, img.naturalWidth, img.naturalHeight, frame.url, adjust).then((url) => {
      if (alive) setResult(url);
    });
    return () => {
      alive = false;
    };
  }, [mode, adjust, frame.url]);

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

  const windowStyle = {
    left: `${WINDOW_PCT.left}%`,
    top: `${WINDOW_PCT.top}%`,
    width: `${WINDOW_PCT.width}%`,
    height: `${WINDOW_PCT.height}%`,
  };

  const mediaTransform = `translate(${adjust.offsetX * 100}%, ${adjust.offsetY * 100}%) scale(${adjust.zoom})${mirror && mode === "camera" ? " scaleX(-1)" : ""}`;

  return (
    <div className="mx-auto w-full max-w-lg space-y-5">
      <div className="relative w-full overflow-hidden rounded-2xl bg-card shadow-frame">
        <div className="relative aspect-square w-full">
          {/* photo window (behind the frame artwork) */}
          <div
            className="absolute overflow-hidden rounded-xl bg-black touch-none cursor-grab active:cursor-grabbing"
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
                className="h-full w-full object-contain"
                style={{ transform: mediaTransform }}
              />
            ) : null}
          </div>

          {/* frame artwork always on top of the camera */}
          {mode === "camera" ? (
            <img
              src={frame.url}
              alt="活動圖框"
              className="pointer-events-none absolute inset-0 h-full w-full select-none"
            />
          ) : (
            result && <img src={result} alt="合成預覽" className="absolute inset-0 h-full w-full" />
          )}
        </div>
      </div>

      {error && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

      <div>
        <p className="mb-2 text-sm font-semibold text-foreground">圖框樣式</p>
        <div className="grid grid-cols-2 gap-3">
          {FRAMES.map((f, i) => (
            <button
              key={f.id}
              onClick={() => setFrameIdx(i)}
              className={`overflow-hidden rounded-xl border-2 transition ${
                i === frameIdx ? "border-primary shadow-frame" : "border-border opacity-80"
              }`}
            >
              <img src={f.url} alt={f.label} className="aspect-square w-full object-cover" />
              <span className="block bg-card py-1 text-xs text-card-foreground">{f.label}</span>
            </button>
          ))}
        </div>
      </div>

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
        {mode === "camera" ? (
          <>
            <button onClick={capture} className="btn-gold">拍照</button>
            <button
              onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
              className="btn-outline"
            >
              翻轉鏡頭
            </button>
          </>
        ) : (
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
