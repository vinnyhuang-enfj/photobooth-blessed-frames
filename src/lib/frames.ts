import frame01 from "@/assets/frame01.png.asset.json";
import frame02 from "@/assets/frame02.png.asset.json";
import frame03 from "@/assets/frame03.png.asset.json";
import frame04 from "@/assets/frame04.png.asset.json";
import frame05 from "@/assets/frame05.png.asset.json";
import frame06 from "@/assets/frame06.png.asset.json";
import frame01Hole from "@/assets/frame01-hole.png.asset.json";
import frame02Hole from "@/assets/frame02-hole.png.asset.json";
import frame03Hole from "@/assets/frame03-hole.png.asset.json";
import frame04Hole from "@/assets/frame04-hole.png.asset.json";
import frame05Hole from "@/assets/frame05-hole.png.asset.json";
import frame06Hole from "@/assets/frame06-hole.png.asset.json";

export type Rect = { x: number; y: number; w: number; h: number };

export type Frame = {
  id: string;
  label: string;
  url: string;
  overlay: string;
  /** natural size of the frame artwork */
  canvas: { w: number; h: number };
  /** photo window measured on the artwork */
  window: Rect;
};

export const FRAMES: Frame[] = [
  {
    id: "frame01",
    label: "圖框 01",
    url: frame01.url,
    overlay: frame01Hole.url,
    canvas: { w: 1254, h: 1254 },
    window: { x: 145, y: 164, w: 964, h: 900 },
  },
  {
    id: "frame02",
    label: "圖框 02",
    url: frame02.url,
    overlay: frame02Hole.url,
    canvas: { w: 1254, h: 1254 },
    window: { x: 145, y: 164, w: 964, h: 900 },
  },
  {
    id: "frame03",
    label: "圖框 03",
    url: frame03.url,
    overlay: frame03Hole.url,
    canvas: { w: 1254, h: 1254 },
    window: { x: 144, y: 164, w: 965, h: 901 },
  },
  {
    id: "frame04",
    label: "圖框 04",
    url: frame04.url,
    overlay: frame04Hole.url,
    canvas: { w: 1254, h: 1254 },
    window: { x: 143, y: 163, w: 965, h: 902 },
  },
  {
    id: "frame05",
    label: "圖框 05",
    url: frame05.url,
    overlay: frame05Hole.url,
    canvas: { w: 1447, h: 1087 },
    window: { x: 55, y: 218, w: 1336, h: 635 },
  },
  {
    id: "frame06",
    label: "圖框 06",
    url: frame06.url,
    overlay: frame06Hole.url,
    canvas: { w: 1402, h: 1122 },
    window: { x: 179, y: 203, w: 1042, h: 563 },
  },
];


export function windowPct(frame: Frame) {
  return {
    left: (frame.window.x / frame.canvas.w) * 100,
    top: (frame.window.y / frame.canvas.h) * 100,
    width: (frame.window.w / frame.canvas.w) * 100,
    height: (frame.window.h / frame.canvas.h) * 100,
  };
}

export type Adjust = { zoom: number; offsetX: number; offsetY: number };

export const DEFAULT_ADJUST: Adjust = { zoom: 1, offsetX: 0, offsetY: 0 };

/** cover-fit so the photo always fills the window, plus zoom/offset fine tuning */
export function computeFit(win: Rect, sw: number, sh: number, adjust: Adjust) {
  const base = Math.max(win.w / sw, win.h / sh);
  const scale = base * adjust.zoom;
  const dw = sw * scale;
  const dh = sh * scale;
  const dx = win.x + (win.w - dw) / 2 + adjust.offsetX * win.w;
  const dy = win.y + (win.h - dh) / 2 + adjust.offsetY * win.h;
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
  frame: Frame,
  adjust: Adjust,
  mirror = false,
): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = frame.canvas.w;
  canvas.height = frame.canvas.h;
  const ctx = canvas.getContext("2d")!;
  const base = frame.window;
  // bleed outward so the frame artwork always overlaps the photo edges
  const bx = base.w * 0.02;
  const by = base.h * 0.02;
  const win: Rect = { x: base.x - bx, y: base.y - by, w: base.w + bx * 2, h: base.h + by * 2 };
  ctx.fillStyle = "#000";
  ctx.fillRect(win.x, win.y, win.w, win.h);

  const { dx, dy, dw, dh } = computeFit(win, sw, sh, adjust);
  ctx.save();
  ctx.beginPath();
  ctx.rect(win.x, win.y, win.w, win.h);
  ctx.clip();
  if (mirror) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(source, canvas.width - dx - dw, dy, dw, dh);
  } else {
    ctx.drawImage(source, dx, dy, dw, dh);
  }
  ctx.restore();

  const art = await loadImage(frame.overlay);
  ctx.drawImage(art, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}
