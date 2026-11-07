import React, { useEffect, useRef, useState } from 'react';
import { Eraser, PenTool } from 'lucide-react';

interface SignaturePadProps {
  initialDataUrl?: string;
  onChange: (dataUrl: string) => void;
  label?: string;
  penColor?: string;
  height?: number;
}

export const SignaturePad: React.FC<SignaturePadProps> = ({
  initialDataUrl = '',
  onChange,
  label = 'Dibuje la firma aquí (compatible con ratón, pantalla táctil móvil y lápiz óptico)',
  penColor = '#0f2942',
  height = 150,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [hasContent, setHasContent] = useState<boolean>(Boolean(initialDataUrl));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let initialized = false, previousWidth = 0, previousDpr = 0, generation = 0;
    const resize = () => {
      const width = canvas.getBoundingClientRect().width || 460;
      const dpr = window.devicePixelRatio || 1;
      if (initialized && Math.abs(previousWidth - width) < 1 && previousDpr === dpr) return;
      const snapshot = initialized ? canvas.toDataURL('image/png') : initialDataUrl;
      isDrawingRef.current = false; lastPointRef.current = null;
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      const ctx = canvas.getContext('2d'); if (!ctx) return;
      ctx.scale(dpr, dpr); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 2.2; ctx.strokeStyle = penColor;
      previousWidth = width; previousDpr = dpr; initialized = true;
      const currentGeneration = ++generation;
      if (snapshot) {
        const image = new Image();
        image.onload = () => { if (generation !== currentGeneration) return; const ratio = Math.min(width / image.width, height / image.height); const drawWidth = image.width * ratio, drawHeight = image.height * ratio; ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight); };
        image.src = snapshot;
      }
    };
    resize();
    const observer = new ResizeObserver(resize); observer.observe(canvas);
    return () => { generation++; observer.disconnect(); };
  }, [height, initialDataUrl, penColor]);

  const getCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    isDrawingRef.current = true;
    lastPointRef.current = getCoords(e);
    const ctx = e.currentTarget.getContext('2d');
    if (ctx) { ctx.fillStyle = penColor; ctx.beginPath(); ctx.arc(lastPointRef.current.x, lastPointRef.current.y, 1.15, 0, Math.PI * 2); ctx.fill(); setHasContent(true); }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !canvasRef.current || !lastPointRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    const pt = getCoords(e);
    ctx.strokeStyle = penColor;
    ctx.lineWidth = 2.3;
    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    lastPointRef.current = pt;
    if (!hasContent) setHasContent(true);
  };

  const handlePointerUp = () => {
    if (!isDrawingRef.current || !canvasRef.current) return;
    isDrawingRef.current = false;
    lastPointRef.current = null;
    onChange(canvasRef.current.toDataURL('image/png'));
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    setHasContent(false);
    onChange('');
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 sp-head">
        <span className="flex items-center gap-1.5 font-medium">
          <PenTool className="w-3.5 h-3.5 sp-icon" />
          {label}
        </span>
        <button
          type="button"
          onClick={handleClear}
          className="btn btn-secondary btn-sm"
        >
          <Eraser className="w-3.5 h-3.5" />
          Limpiar
        </button>
      </div>
      <div className="relative rounded-xl border-2 border-dashed border-slate-300 bg-white overflow-hidden shadow-inner theme-keep-light">
        <canvas
          ref={canvasRef}
          aria-label={label}
          style={{ height: `${height}px`, touchAction: 'none' }}
          className="w-full block cursor-crosshair"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onLostPointerCapture={handlePointerUp}
        />
        {!hasContent && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-slate-400 px-4 text-center">
            Firme sobre este recuadro con el dedo (Móvil/Tablet) o con el ratón (Web)
          </div>
        )}
        <div className="pointer-events-none absolute bottom-4 left-8 right-8 border-b border-slate-300" />
      </div>
    </div>
  );
};
