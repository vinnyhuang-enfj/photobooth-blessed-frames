import frame01 from "@/assets/frame01.png.asset.json";
import frame02 from "@/assets/frame02.png.asset.json";
import frame01Hole from "@/assets/frame01-hole.png.asset.json";
import frame02Hole from "@/assets/frame02-hole.png.asset.json";

export const CANVAS_SIZE = 1254;

/** Black photo window measured from the frame artwork (px, in a 1254x1254 canvas). */
export const WINDOW = { x: 144, y: 164, w: 916, h: 900 };

export const WINDOW_PCT = {
  left: (WINDOW.x / CANVAS_SIZE) * 100,
  top: (WINDOW.y / CANVAS_SIZE) * 100,
  width: (WINDOW.w / CANVAS_SIZE) * 100,
  height: (WINDOW.h / CANVAS_SIZE) * 100,
};

export const FRAMES = [
  { id: "frame01", label: "圖框 01", url: frame01.url, overlay: frame01Hole.url },
  { id: "frame02", label: "圖框 02", url: frame02.url, overlay: frame02Hole.url },
];

export type Adjust = { zoom: number; offsetX: number; offsetY: number };

export const DEFAULT_ADJUST: Adjust = { zoom: 1, offsetX: 0, offsetY: 0 };

/** cover-fit so the photo always fills the black window, plus zoom/offset fine tuning */
export function computeFit(sw: number, sh: number, adjust: Adjust) {
  const base = Math.max(WINDOW.w / sw, WINDOW.h / sh);
  const scale = base * adjust.zoom;
  const dw = sw * scale;
  const dh = sh * scale;
  const dx = WINDOW.x + (WINDOW.w - dw) / 2 + adjust.offsetX * WINDOW.w;
  const dy = WINDOW.y + (WINDOW.h - dh) / 2 + adjust.offsetY * WINDOW.h;
  return { dx, dy, dw, dh };
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function composite(
  source: CanvasImageSource & { width?: number; height?: number },
  sw: number,
  sh: number,
  frameUrl: string,
  adjust: Adjust,
  mirror = false,
): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(WINDOW.x, WINDOW.y, WINDOW.w, WINDOW.h);

  const { dx, dy, dw, dh } = computeFit(sw, sh, adjust);
  ctx.save();
  ctx.beginPath();
  ctx.rect(WINDOW.x, WINDOW.y, WINDOW.w, WINDOW.h);
  ctx.clip();
  if (mirror) {
    ctx.translate(CANVAS_SIZE, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(source, CANVAS_SIZE - dx - dw, dy, dw, dh);
  } else {
    ctx.drawImage(source, dx, dy, dw, dh);
  }
  ctx.restore();

  const frame = await loadImage(frameUrl);
  ctx.drawImage(frame, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
  return canvas.toDataURL("image/png");
}
