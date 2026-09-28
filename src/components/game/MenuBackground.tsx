// ============ RIFT BRAWL — Cinematic Menu Background V4 ============
// Layered void scene: twinkling parallax starfield, drifting nebulae,
// animated rift seam with energy nodes, floating glowing shards, floor glow.

'use client';

import { useEffect, useRef } from 'react';

interface Shard { x: number; y: number; vx: number; vy: number; s: number; r: number; vr: number; a: number; hue: number; pulse: number }
interface Star { x: number; y: number; r: number; tw: number; ph: number; depth: number }

export default function MenuBackground({ intensity = 1 }: { intensity?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let W = 0, H = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
    const resize = () => {
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildStars();
    };

    // ---- persistent scene objects ----
    const shards: Shard[] = [];
    const N = 34;
    for (let i = 0; i < N; i++) {
      shards.push({
        x: Math.random(), y: Math.random(),
        vx: (Math.random() - 0.5) * 0.0005,
        vy: (Math.random() - 0.5) * 0.0005,
        s: 7 + Math.random() * 24,
        r: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.004,
        a: 0.07 + Math.random() * 0.2,
        hue: Math.random() < 0.55 ? 160 + Math.random() * 30 : 250 + Math.random() * 20,
        pulse: Math.random() * Math.PI * 2,
      });
    }

    let stars: Star[] = [];
    const buildStars = () => {
      stars = [];
      const count = Math.round((W * H) / 16000);
      for (let i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * W,
          y: Math.random() * H * 0.9,
          r: 0.5 + Math.random() * 1.3,
          tw: 0.5 + Math.random() * 1.8,
          ph: Math.random() * Math.PI * 2,
          depth: 0.3 + Math.random() * 0.7,
        });
      }
    };
    buildStars();

    const nebulae = [
      { x: 0.24, y: 0.3, r: 0.5, hue: 165, a: 0.1 },
      { x: 0.72, y: 0.55, r: 0.62, hue: 255, a: 0.12 },
      { x: 0.5, y: 0.85, r: 0.7, hue: 190, a: 0.07 },
    ];

    let t = 0;
    const loop = () => {
      t += 1;
      // ---- base void ----
      const g = ctx.createRadialGradient(W * 0.5, H * 0.38, 40, W * 0.5, H * 0.5, Math.max(W, H) * 0.8);
      g.addColorStop(0, '#14102b');
      g.addColorStop(0.5, '#0a0819');
      g.addColorStop(1, '#040309');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      // ---- drifting nebulae (screen-space, additive) ----
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      nebulae.forEach((nb, i) => {
        const nx = W * (nb.x + Math.sin(t * 0.0016 + i * 2.2) * 0.05);
        const ny = H * (nb.y + Math.cos(t * 0.0021 + i * 1.4) * 0.04);
        const nr = Math.max(W, H) * nb.r;
        const ng = ctx.createRadialGradient(nx, ny, 0, nx, ny, nr);
        ng.addColorStop(0, `hsla(${nb.hue}, 80%, 60%, ${nb.a * intensity})`);
        ng.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = ng;
        ctx.fillRect(0, 0, W, H);
      });
      ctx.restore();

      // ---- parallax starfield ----
      const mx = Math.sin(t * 0.003) * 10;
      for (const st of stars) {
        const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 0.017 * st.tw + st.ph));
        const px = st.x + mx * st.depth;
        ctx.globalAlpha = tw * 0.55 * st.depth * intensity;
        ctx.fillStyle = st.depth > 0.8 ? '#dffcf4' : '#9db8ff';
        ctx.fillRect(px, st.y, st.r, st.r);
      }
      ctx.globalAlpha = 1;

      // ---- the rift: glowing seam on the horizon with energy nodes ----
      const horizonY = H * 0.72;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // wide haze band
      const seam = ctx.createLinearGradient(0, horizonY - 90, 0, horizonY + 90);
      seam.addColorStop(0, 'rgba(0,229,176,0)');
      seam.addColorStop(0.5, `rgba(0,229,176,${0.06 * intensity})`);
      seam.addColorStop(1, 'rgba(0,229,176,0)');
      ctx.fillStyle = seam;
      ctx.fillRect(0, horizonY - 90, W, 180);
      // seam path (rebuild each frame; cheap)
      const path = () => {
        ctx.beginPath();
        ctx.moveTo(-30, horizonY);
        for (let x = -30; x <= W + 30; x += 34) {
          const y = horizonY + Math.sin(x * 0.011 + t * 0.004) * 7 + Math.sin(x * 0.031 - t * 0.006) * 3.4;
          ctx.lineTo(x, y);
        }
      };
      path();
      ctx.strokeStyle = `rgba(0,229,176,${(0.05 + 0.03 * Math.sin(t * 0.02)) * intensity})`;
      ctx.lineWidth = 30;
      ctx.stroke();
      path();
      ctx.strokeStyle = `rgba(139,124,255,${(0.12 + 0.05 * Math.sin(t * 0.017 + 2)) * intensity})`;
      ctx.lineWidth = 8;
      ctx.stroke();
      path();
      ctx.strokeStyle = 'rgba(224,255,246,0.4)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      // energy nodes traveling along the seam
      for (let i = 0; i < 4; i++) {
        const p = ((t * 0.0022 + i * 0.25) % 1) * (W + 60) - 30;
        const y = horizonY + Math.sin(p * 0.011 + t * 0.004) * 7 + Math.sin(p * 0.031 - t * 0.006) * 3.4;
        const ng = ctx.createRadialGradient(p, y, 0, p, y, 26);
        ng.addColorStop(0, `rgba(224,255,246,${0.5 * intensity})`);
        ng.addColorStop(0.4, `rgba(0,229,176,${0.28 * intensity})`);
        ng.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = ng;
        ctx.fillRect(p - 26, y - 26, 52, 52);
      }
      ctx.restore();

      // ---- energy bands ----
      for (let band = 0; band < 3; band++) {
        ctx.beginPath();
        const yBase = H * (0.3 + band * 0.22);
        ctx.moveTo(-40, yBase);
        for (let x = -40; x <= W + 40; x += 44) {
          ctx.lineTo(x, yBase + Math.sin(x * 0.004 + t * 0.008 + band * 2.1) * (36 + band * 14));
        }
        ctx.strokeStyle = `hsla(${165 + band * 40}, 85%, 60%, ${(0.05 * intensity).toFixed(3)})`;
        ctx.lineWidth = 30 + band * 22;
        ctx.stroke();
      }

      // ---- light shafts ----
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        const sx = W * (0.18 + i * 0.32) + Math.sin(t * 0.003 + i * 2) * 34;
        const grad = ctx.createLinearGradient(sx, 0, sx + 130, H);
        grad.addColorStop(0, `hsla(${168 + i * 36}, 85%, 65%, ${(0.05 * intensity).toFixed(3)})`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(sx - 30, -20);
        ctx.lineTo(sx + 30, -20);
        ctx.lineTo(sx + 200, H + 20);
        ctx.lineTo(sx + 70, H + 20);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // ---- floating shards ----
      ctx.save();
      for (const s of shards) {
        s.x += s.vx; s.y += s.vy; s.r += s.vr;
        if (s.x < -0.05) s.x = 1.05; if (s.x > 1.05) s.x = -0.05;
        if (s.y < -0.05) s.y = 1.05; if (s.y > 1.05) s.y = -0.05;
        const px = s.x * W, py = s.y * H + Math.sin(t * 0.01 + s.pulse) * 9;
        const glow = 0.55 + 0.45 * Math.sin(t * 0.03 + s.pulse);
        ctx.translate(px, py);
        ctx.rotate(s.r);
        // glow underlay
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const sg = ctx.createRadialGradient(0, 0, 0, 0, 0, s.s * 2.2);
        sg.addColorStop(0, `hsla(${s.hue}, 90%, 65%, ${s.a * 0.5 * glow * intensity})`);
        sg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = sg;
        ctx.fillRect(-s.s * 2.2, -s.s * 2.2, s.s * 4.4, s.s * 4.4);
        ctx.restore();
        ctx.fillStyle = `hsla(${s.hue}, 88%, 68%, ${s.a * glow * intensity})`;
        const sz = s.s * (1 + glow * 0.1);
        ctx.beginPath();
        ctx.moveTo(0, -sz); ctx.lineTo(sz * 0.55, 0); ctx.lineTo(0, sz); ctx.lineTo(-sz * 0.55, 0);
        ctx.closePath();
        ctx.fill();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      ctx.restore();

      // ---- floor glow (anchors the UI) ----
      const fg = ctx.createLinearGradient(0, H * 0.86, 0, H);
      fg.addColorStop(0, 'rgba(0,229,176,0)');
      fg.addColorStop(1, `rgba(0,229,176,${0.07 * intensity})`);
      ctx.fillStyle = fg;
      ctx.fillRect(0, H * 0.86, W, H * 0.14);

      // ---- vignette ----
      const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.36, W / 2, H / 2, Math.max(W, H) * 0.74);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(2,2,8,0.82)');
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    resize();
    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [intensity]);

  return <canvas ref={ref} className="absolute inset-0 w-full h-full" aria-hidden />;
}
