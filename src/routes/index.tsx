import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PhotoBooth } from "@/components/PhotoBooth";
import eventImg from "@/assets/event.jpg.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "2026 國際佛光會世界會員代表大會 | 和諧與和平" },
      {
        name: "description",
        content:
          "2026 國際佛光會世界會員代表大會活動網站，查看 10/2–10/6 活動內容，並使用「與大師合影」拍攝專屬紀念圖框照片。",
      },
      { property: "og:title", content: "2026 國際佛光會世界會員代表大會" },
      {
        property: "og:description",
        content: "活動內容與線上「與大師合影」，留下屬於你的和諧與和平紀念照。",
      },

      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const [tab, setTab] = useState<"event" | "booth">("event");

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border/40 bg-gradient-hero px-4 py-6 text-center">
        <h1 className="text-lg font-bold tracking-wide text-primary-foreground sm:text-2xl">
          2026 國際佛光會 世界會員代表大會
        </h1>
        <p className="mt-1 text-sm text-primary-foreground/80">和諧與和平 · Harmony and Peace</p>
      </header>

      <nav className="sticky top-0 z-10 flex justify-center gap-2 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        {(
          [
            ["event", "活動內容"],
            ["booth", "與大師合影"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={tab === key ? "btn-gold" : "btn-outline"}
          >
            {label}
          </button>
        ))}
      </nav>

      <section className="px-4 py-6">
        {tab === "event" ? (
          <img
            src={eventImg.url}
            alt="2026 國際佛光會世界會員代表大會活動內容"
            className="mx-auto w-full max-w-lg rounded-2xl shadow-frame"
          />
        ) : (
          <PhotoBooth />
        )}
      </section>
    </main>
  );
}
