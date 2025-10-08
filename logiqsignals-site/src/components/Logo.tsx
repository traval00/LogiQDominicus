// src/components/Logo.tsx
import React from "react";

const srcs = [
  "/lion.png",                 // public/lion.png  ✅ recommended
  "/lion.svg",                 // optional backup
  new URL("/lion.png", import.meta.env.BASE_URL).toString(),
  new URL("/lion.svg", import.meta.env.BASE_URL).toString(),
];

export default function Logo({
  size = 72,
}: { size?: number }) {
  const [idx, setIdx] = React.useState(0);
  const [ok, setOk] = React.useState(true);

  // If an image fails, try the next source. Final fallback = emoji.
  const onError = () => {
    if (idx < srcs.length - 1) setIdx(idx + 1);
    else setOk(false);
  };

  if (!ok) {
    return (
      <div
        className="select-none"
        style={{ width: size, height: size, lineHeight: `${size}px` }}
        title="LogiQ Lion"
      >
        <span className="text-5xl md:text-6xl drop-shadow-[0_0_12px_rgba(16,185,129,0.7)]">
          🦁
        </span>
      </div>
    );
  }

  return (
    <img
      src={srcs[idx]}
      alt="LogiQ Lion"
      width={size}
      height={size}
      onError={onError}
      className="rounded-full shadow-[0_0_24px_rgba(16,185,129,0.35)] ring-2 ring-emerald-400/30"
      style={{ objectFit: "contain" }}
      loading="eager"
      fetchPriority="high"
      decoding="sync"
    />
  );
}
