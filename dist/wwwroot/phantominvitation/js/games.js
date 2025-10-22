(function () {
  console.log("Phantom games.js loaded");

  const DPR = () => (window.devicePixelRatio || 1);

  function drawPrize(ctx, w, h, text) {
    ctx.save();
    ctx.clearRect(0, 0, w, h);

    // Dramatic backdrop
    const grd = ctx.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, "#1a0b0f");
    grd.addColorStop(1, "#360a0a");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);

    // Phantom mask watermark
    ctx.font = Math.floor(h * 0.48) + "px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffffff";
    ctx.globalAlpha = 0.12;
    ctx.fillText("🎭", w * 0.5, h * 0.45);
    ctx.globalAlpha = 1;

    // Prize text
    ctx.fillStyle = "#ffd166";
    ctx.font = "bold " + Math.floor(h * 0.14) + "px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(text, w * 0.5, h * 0.78);
    ctx.restore();
  }

  function drawCover(ctx, w, h, color) {
    ctx.save();
    ctx.fillStyle = color || "#c0c0c0";
    ctx.fillRect(0, 0, w, h);
    // Sheen
    ctx.globalAlpha = 0.25;
    for (let i = 0; i < h; i += 8) {
      ctx.fillStyle = i % 16 === 0 ? "#ffffff" : "#000000";
      ctx.fillRect(0, i, w, 1);
    }
    ctx.restore();
  }

  function scratchAt(ctx, x, y, r) {
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(0,0,0,1)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function erasedRatio(ctx, w, h) {
    const data = ctx.getImageData(0, 0, w, h).data;
    let transparent = 0; // count alpha==0
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] === 0) transparent++;
    }
    return transparent / (w * h);
  }

  // Per-canvas state (for proper dispose)
  const scratchState = new Map();

  window.scratchGame = {

    init: function (canvasId, opts, dotnetRef) {
      const canvas = document.getElementById(canvasId);
      if (!canvas) { console.warn("scratchGame: canvas not found", canvasId); return; }

      // Re-init safe
      if (scratchState.has(canvasId)) this.dispose(canvasId);

      const dpr = DPR();

      // Auto-size nicely on phones if width/height omitted
      const parentW = canvas.parentElement ? canvas.parentElement.clientWidth : 320;
      const logicalW = Math.max(260, Math.min(opts?.width ?? parentW - 24, 520));
      const logicalH = opts?.height ?? Math.round(logicalW * 0.5);

      canvas.width  = Math.floor(logicalW * dpr);
      canvas.height = Math.floor(logicalH * dpr);
      canvas.style.width  = logicalW + "px";
      canvas.style.height = logicalH + "px";

      const ctx = canvas.getContext("2d");
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);

      // Prize underlayer (backbuffer)
      const back = document.createElement("canvas");
      back.width = canvas.width; back.height = canvas.height;
      const bctx = back.getContext("2d");
      bctx.scale(dpr, dpr);
      drawPrize(bctx, logicalW, logicalH, opts?.prize || "Prize");

      // Copy prize to visible, then cover on top
      ctx.drawImage(back, 0, 0);
      drawCover(ctx, logicalW, logicalH, opts?.coverColor || "#c0c0c0");

      let isDown = false;
      const brush = Math.max(10, opts?.brushRadius || 20);
      const threshold = Math.min(Math.max(opts?.threshold ?? 0.55, 0.1), 0.95);
      let unlocked = false;

      const toLocal = (clientX, clientY) => {
        const rect = canvas.getBoundingClientRect();
        return { x: clientX - rect.left, y: clientY - rect.top };
      };

      // Pointer Events = mouse + touch + pen
      const onDown = (e) => { isDown = true; onMove(e); e.preventDefault(); };
      const onUp   = (e) => {
        if (!isDown) return;
        isDown = false;
        if (!unlocked) {
          const ratio = erasedRatio(ctx, logicalW, logicalH);
          if (ratio >= threshold) {
            unlocked = true;
            ctx.clearRect(0, 0, logicalW, logicalH);
            try { dotnetRef && dotnetRef.invokeMethodAsync("ScratchUnlocked"); } catch {}
          }
        }
      };
      const onMove = (e) => {
        if (!isDown) return;
        const px = e.clientX ?? (e.touches?.[0]?.clientX);
        const py = e.clientY ?? (e.touches?.[0]?.clientY);
        if (px == null || py == null) return;
        const p = toLocal(px, py);
        scratchAt(ctx, p.x, p.y, brush);
        e.preventDefault();
      };

      canvas.addEventListener("pointerdown", onDown, { passive: false });
      window.addEventListener("pointermove", onMove, { passive: false });
      window.addEventListener("pointerup", onUp, { passive: true });
      window.addEventListener("pointercancel", onUp, { passive: true });

      scratchState.set(canvasId, {
        handlers: { onDown, onMove, onUp },
        canvas, ctx, w: logicalW, h: logicalH, unlocked, opts
      });

      console.log("scratchGame:init", { canvasId, logicalW, logicalH, opts });
    },

    dispose: function (canvasId) {
      const st = scratchState.get(canvasId);
      if (!st) return;
      const { handlers, canvas } = st;
      try {
        canvas.removeEventListener("pointerdown", handlers.onDown);
        window.removeEventListener("pointermove", handlers.onMove);
        window.removeEventListener("pointerup", handlers.onUp);
        window.removeEventListener("pointercancel", handlers.onUp);
      } catch {}
      scratchState.delete(canvasId);
      try { st.ctx.clearRect(0, 0, st.w, st.h); } catch {}
      console.log("scratchGame:disposed", canvasId);
    }
  };

  // Utility (used by Memory Match sometimes)
  window.setText = function (id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };
})();

// ----- simple localStorage helper (polyfill if not present) -----
window.storage = window.storage || {
  get: (key) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch { return localStorage.getItem(key); }
  },
  set: (key, val) => {
    try {
      localStorage.setItem(key, typeof val === 'string' ? val : JSON.stringify(val));
    } catch {}
  }
};




// Memory match (mobile-friendly)
window.memoryGame = {
  init: (gridId, dotnetRef) => {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    const icons = ["🎭","🎼","🕯️","🎟️"];
    const cards = [...icons, ...icons].map((v,i)=>({id:i, v, flipped:false, done:false}));
    // shuffle
    for (let i=cards.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [cards[i],cards[j]]=[cards[j],cards[i]];
    }
    grid.innerHTML = '';
    let first = null, lock = false, matched = 0;

    const render = () => {
      grid.innerHTML = '';
      cards.forEach((c)=>{
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'mem-card'; // let CSS scale on phones
        el.style.cssText = `
          aspect-ratio:1/1; border-radius:12px; 
          background:${c.flipped||c.done ? 'rgba(217,179,107,.25)' : 'rgba(255,255,255,.06)'};
          border:1px solid rgba(255,255,255,.2); 
          font-size:28px; color:#fff; display:grid; place-items:center; 
        `;
        el.textContent = (c.flipped||c.done) ? c.v : "？";
        el.addEventListener('pointerdown', async ()=>{
          if (lock || c.done || c.flipped) return;
          c.flipped = true; render();
          if (!first) { first = c; return; }
          lock = true;
          setTimeout(async ()=>{
            if (first.v === c.v) {
              first.done = c.done = true;
              matched += 2;
              if (navigator.vibrate) try { navigator.vibrate(40); } catch {}
              if (matched === cards.length && dotnetRef) {
                await dotnetRef.invokeMethodAsync('MemoryDone');
              }
            } else {
              first.flipped = false; c.flipped = false;
            }
            first = null; lock = false; render();
          }, 400);
        }, { passive: true });
        grid.appendChild(el);
      });
    };
    render();
  }
};

