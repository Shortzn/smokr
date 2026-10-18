/* Ziehbares Blatt mit drei Rastpunkten: collapsed, half, expanded.
   Touch: Ziehen am Blatt bewegt es. Ist es ganz offen, scrollt der Inhalt, bis er oben ankommt,
   dann zieht eine Abwärtsbewegung das Blatt wieder herunter.
   Maus: Ziehen am Griff. Tastatur und Screenreader: der Griff ist ein Knopf (Klick, Pfeiltasten). */
(function (root) {
  "use strict";

  const ORDER = ["collapsed", "half", "expanded"];
  const VELOCITY = 0.45; // px/ms, ab hier zählt die Richtung der Wischbewegung
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function insets() {
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;left:0;top:0;width:0;visibility:hidden;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)";
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe);
    const out = { top: parseFloat(cs.paddingTop) || 0, bottom: parseFloat(cs.paddingBottom) || 0 };
    probe.remove();
    return out;
  }

  function createSheet(el, opts) {
    const grab = el.querySelector("[data-grab]");
    const panelQuery = window.matchMedia(opts.panelQuery);
    let snaps = {};
    let height = 0;
    let state = opts.initial || "half";
    let y = 0;
    let drag = null;
    let suppressClick = false;
    let frame = 0;

    function isPanel() { return panelQuery.matches; }

    function compute() {
      height = window.innerHeight;
      const ins = insets();
      const peek = opts.peek ? opts.peek() : 168;
      const expanded = Math.round(ins.top + 10);
      const collapsed = Math.round(height - peek - ins.bottom);
      let half = Math.round(height * 0.5);
      half = Math.min(Math.max(half, expanded + 120), collapsed - 90);
      snaps = { expanded, half, collapsed: Math.max(collapsed, half + 60) };
    }

    function paint(nextY) {
      y = nextY;
      el.style.transform = `translate3d(0,${Math.round(y)}px,0)`;
      document.documentElement.style.setProperty("--sheet-y", `${Math.round(y)}px`);
      if (opts.onMove) opts.onMove(y, height);
    }
    function scheduled(nextY) {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => paint(nextY));
    }
    function setHeight(top) {
      el.style.height = `${Math.max(0, height - top)}px`;
    }

    function snap(name, animate) {
      if (isPanel()) { applyPanel(); return; }
      if (!snaps[name]) return;
      const prev = state;
      state = name;
      const target = snaps[name];
      const smooth = animate !== false && !reduceMotion.matches && Math.abs(target - y) > 1;
      // Beim Aufziehen zuerst Platz schaffen, beim Zuziehen erst nach der Bewegung kürzen
      setHeight(Math.min(target, y || target));
      el.classList.toggle("anim", smooth);
      paint(target);
      const done = () => {
        el.classList.remove("anim");
        setHeight(target);
        if (opts.onSettle) opts.onSettle(state, prev);
      };
      if (smooth) {
        let finished = false;
        const end = (ev) => {
          if (ev && ev.target !== el) return;
          if (finished) return;
          finished = true;
          el.removeEventListener("transitionend", end);
          done();
        };
        el.addEventListener("transitionend", end);
        setTimeout(end, 420);
      } else done();
      updateGrab();
    }

    function applyPanel() {
      state = "panel";
      el.classList.remove("anim", "dragging");
      el.style.transform = "";
      el.style.height = "";
      document.documentElement.style.removeProperty("--sheet-y");
      updateGrab();
      if (opts.onSettle) opts.onSettle("panel", null);
    }

    function updateGrab() {
      if (!grab) return;
      const L = opts.labels ? opts.labels() : { grow: "Expand panel", shrink: "Collapse panel" };
      const label = state === "expanded" ? L.shrink : L.grow;
      grab.setAttribute("aria-label", label);
      grab.setAttribute("aria-expanded", String(state === "expanded"));
      el.dataset.state = state;
    }

    function nearest(posY, velocity) {
      const list = ORDER.map((n) => [n, snaps[n]]);
      if (Math.abs(velocity) > VELOCITY) {
        // Wischrichtung entscheidet: nächster Rastpunkt in Bewegungsrichtung
        const dir = velocity < 0 ? -1 : 1;
        const candidates = list.filter(([, v]) => (dir < 0 ? v < posY - 4 : v > posY + 4));
        if (candidates.length) {
          candidates.sort((a, b) => Math.abs(a[1] - posY) - Math.abs(b[1] - posY));
          return candidates[0][0];
        }
      }
      list.sort((a, b) => Math.abs(a[1] - posY) - Math.abs(b[1] - posY));
      return list[0][0];
    }

    function begin(clientY, t, scroller) {
      drag = { startY: clientY, startX: null, y0: y, scroller, decided: false, active: false, samples: [[clientY, t]] };
    }
    function activate() {
      drag.active = true;
      el.classList.remove("anim");
      el.classList.add("dragging");
      setHeight(snaps.expanded);
    }
    function move(clientY, t) {
      const dy = clientY - drag.startY;
      let next = drag.y0 + dy;
      if (next < snaps.expanded) next = snaps.expanded - (snaps.expanded - next) * 0.2;
      if (next > snaps.collapsed) next = snaps.collapsed + (next - snaps.collapsed) * 0.2;
      drag.samples.push([clientY, t]);
      if (drag.samples.length > 6) drag.samples.shift();
      scheduled(next);
    }
    function finish(t) {
      const s = drag.samples;
      let v = 0;
      for (let i = s.length - 1; i > 0; i--) {
        if (t - s[i - 1][1] > 120) break;
        const dt = s[s.length - 1][1] - s[i - 1][1];
        if (dt > 0) v = (s[s.length - 1][0] - s[i - 1][0]) / dt;
      }
      el.classList.remove("dragging");
      cancelAnimationFrame(frame);
      const lastY = drag.y0 + (s[s.length - 1][0] - drag.startY);
      drag = null;
      snap(nearest(lastY, v), true);
    }

    // ---- Touch ----
    el.addEventListener("touchstart", (e) => {
      if (isPanel() || e.touches.length > 1) { drag = null; return; }
      const touch = e.touches[0];
      begin(touch.clientY, e.timeStamp, e.target.closest("[data-scroll]"));
      drag.startX = touch.clientX;
    }, { passive: true });

    el.addEventListener("touchmove", (e) => {
      if (!drag) return;
      const touch = e.touches[0];
      const dy = touch.clientY - drag.startY;
      const dx = touch.clientX - drag.startX;
      if (!drag.decided) {
        if (Math.abs(dy) < 7 && Math.abs(dx) < 7) return;
        drag.decided = true;
        if (Math.abs(dx) > Math.abs(dy)) { drag = null; return; } // waagrecht, etwa Filterchips
        const sc = drag.scroller;
        const scrollable = sc && sc.scrollHeight > sc.clientHeight + 1;
        if (scrollable && state === "expanded" && (sc.scrollTop > 0 || dy < 0)) { drag = null; return; }
        if (scrollable && state !== "expanded" && sc.scrollTop > 0 && dy > 0) { drag = null; return; }
        activate();
      }
      if (!drag || !drag.active) return;
      e.preventDefault();
      move(touch.clientY, e.timeStamp);
    }, { passive: false });

    const touchEnd = (e) => {
      if (!drag) return;
      if (drag.active) finish(e.timeStamp);
      else drag = null;
    };
    el.addEventListener("touchend", touchEnd);
    el.addEventListener("touchcancel", touchEnd);

    // ---- Maus am Griff ----
    if (grab) {
      grab.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "touch" || isPanel() || e.button !== 0) return;
        begin(e.clientY, e.timeStamp, null);
        grab.setPointerCapture(e.pointerId);
      });
      grab.addEventListener("pointermove", (e) => {
        if (!drag || e.pointerType === "touch") return;
        if (!drag.decided) {
          if (Math.abs(e.clientY - drag.startY) < 4) return;
          drag.decided = true;
          activate();
        }
        move(e.clientY, e.timeStamp);
      });
      grab.addEventListener("pointerup", (e) => {
        if (!drag || e.pointerType === "touch") return;
        if (drag.active) { suppressClick = true; finish(e.timeStamp); } else drag = null;
      });
      grab.addEventListener("click", () => {
        if (suppressClick) { suppressClick = false; return; }
        const i = ORDER.indexOf(state);
        snap(state === "expanded" ? "collapsed" : ORDER[Math.min(ORDER.length - 1, i + 1)], true);
      });
      grab.addEventListener("keydown", (e) => {
        const i = ORDER.indexOf(state);
        if (e.key === "ArrowUp") { e.preventDefault(); snap(ORDER[Math.min(2, i + 1)], true); }
        if (e.key === "ArrowDown") { e.preventDefault(); snap(ORDER[Math.max(0, i - 1)], true); }
      });
    }

    function layout() {
      if (isPanel()) { applyPanel(); return; }
      compute();
      const name = state === "panel" ? "half" : state;
      state = name;
      setHeight(snaps[name]);
      paint(snaps[name]);
      updateGrab();
      if (opts.onSettle) opts.onSettle(state, null);
    }

    let resizeTimer = 0;
    const onResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(layout, 80); };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    panelQuery.addEventListener("change", layout);

    layout();
    return {
      snap,
      layout,
      get state() { return state; },
      get y() { return y; },
      get snaps() { return Object.assign({}, snaps); },
      isPanel,
      visibleHeight() { return isPanel() ? 0 : Math.max(0, height - y); },
    };
  }

  root.SmokrSheet = { createSheet };
})(window);
