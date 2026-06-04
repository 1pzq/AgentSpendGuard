"use client";

import { useEffect, useRef, useState } from "react";

export function SplineSceneBackground({
  variant = "app"
}: {
  variant?: "app" | "landing";
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasElement = canvas;

    let disposed = false;
    let app: { dispose: () => void } | null = null;

    async function loadScene() {
      try {
        const { Application } = await import("@splinetool/runtime");
        if (disposed) return;

        const spline = new Application(canvasElement, { renderMode: "continuous" });
        app = spline;
        await spline.load("/spline/black-particle-sun.splinecode");
        if (!disposed) {
          setLoaded(true);
        }
      } catch {
        if (!disposed) {
          setFailed(true);
        }
      }
    }

    void loadScene();

    return () => {
      disposed = true;
      app?.dispose();
    };
  }, []);

  return (
    <div className="spline-backdrop" data-variant={variant} aria-hidden="true">
      <div
        className="spline-fallback"
        data-loaded={loaded && !failed}
        style={{ backgroundImage: "url('/spline/black-particle-sun.jpg')" }}
      />
      <canvas className="spline-canvas" data-failed={failed} ref={canvasRef} />
      <div className="spline-vignette" />
      <div className="spline-scrim" />
    </div>
  );
}
