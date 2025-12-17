/* ===========================
   app.js — fixed animations
   =========================== */

(() => {
  const prefersReduce =
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;

  const raf2 = () =>
    new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  const parseTimeList = (v) =>
    String(v)
      .split(",")
      .map((s) => s.trim())
      .map((s) => (s.endsWith("ms") ? parseFloat(s) : parseFloat(s) * 1000))
      .filter((n) => Number.isFinite(n));

  const maxMotionMs = (el) => {
    if (!el) return 0;
    const cs = getComputedStyle(el);

    // CSS animations
    const aD = parseTimeList(cs.animationDuration);
    const aDel = parseTimeList(cs.animationDelay);
    const aMax = Math.max(
      0,
      ...aD.map((d, i) => d + (aDel[i] ?? aDel[0] ?? 0))
    );

    // CSS transitions
    const tD = parseTimeList(cs.transitionDuration);
    const tDel = parseTimeList(cs.transitionDelay);
    const tMax = Math.max(
      0,
      ...tD.map((d, i) => d + (tDel[i] ?? tDel[0] ?? 0))
    );

    return Math.max(aMax, tMax);
  };

  const waitEnd = (el, fallbackMs = 900) =>
    new Promise((resolve) => {
      if (!el) return resolve();

      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        el.removeEventListener("animationend", onEnd);
        el.removeEventListener("transitionend", onEnd);
        resolve();
      };
      const onEnd = (ev) => {
        if (ev.target !== el) return;
        finish();
      };

      el.addEventListener("animationend", onEnd);
      el.addEventListener("transitionend", onEnd);

      setTimeout(finish, fallbackMs);
    });

  /* ---------------------------
     1) Reveal
  --------------------------- */
  (() => {
    const items = document.querySelectorAll("[data-reveal]");
    if (!items.length) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;

          const el = e.target;
          const delay = Number(el.getAttribute("data-reveal-delay") || 0);

          if (!el.dataset.revealInit) {
            el.style.transitionDelay = `${delay}ms`;
            el.dataset.revealInit = "1";
          }

          if (prefersReduce) el.style.transition = "none";

          el.classList.add("is-visible");
          io.unobserve(el);
        }
      },
      { threshold: 0.12 }
    );

    items.forEach((el) => io.observe(el));
  })();

  /* ---------------------------
     2) Carousel — NO DOM wipe during animation
  --------------------------- */
/* 2) Carousel — ROTATE SLIDES (no snap, no DOM wipe) */
(() => {
  const root = document.querySelector("[data-carousel]");
  if (!root) return;

  const viewport = root.querySelector("[data-viewport]");
  const btnPrev = root.querySelector("[data-prev]");
  const btnNext = root.querySelector("[data-next]");
  const dataEl = document.getElementById("casesData");
  if (!viewport || !dataEl) return;

  let items = [];
  try {
    items = JSON.parse(dataEl.textContent.trim());
  } catch {
    items = [];
  }
  if (!items.length) return;

  const prefersReduce =
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;

  let index = 0;     // текущий центр
  let lock = false;

  const ALL_ANIM = [
    "anim-next-toLeft",
    "anim-next-fromRight",
    "anim-next-fadeOutLeft",
    "anim-prev-toRight",
    "anim-prev-fromLeft",
    "anim-prev-fadeOutRight",
  ];

  const clamp = (i) => {
    const n = items.length;
    return (i % n + n) % n;
  };

  const escapeHtml = (s) =>
    String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const fill = (el, item) => {
    el.innerHTML = `
      <div class="slide__card">
        <div class="slide__media">
          <img src="${item.img}" alt="${escapeHtml(item.title)}" loading="lazy" decoding="async" />
        </div>
        <div class="slide__body">
          <h3 class="slide__title">${escapeHtml(item.title)}</h3>
          <p class="slide__text">${escapeHtml(item.text)}</p>
        </div>
      </div>
    `;
  };

  const makeSlide = (pos) => {
    const el = document.createElement("div");
    el.className = `slide slide--${pos}`;
    return el;
  };

  // 3 постоянных слайда
  let elL = makeSlide("left");
  let elC = makeSlide("center");
  let elR = makeSlide("right");
  viewport.replaceChildren(elL, elC, elR);

  const syncAll = () => {
    fill(elL, items[clamp(index - 1)]);
    fill(elC, items[clamp(index)]);
    fill(elR, items[clamp(index + 1)]);
  };

  const clearAnim = () => {
    [elL, elC, elR].forEach((el) => el.classList.remove(...ALL_ANIM));
  };

  const setPosClasses = () => {
    elL.classList.remove("slide--center", "slide--right");
    elL.classList.add("slide--left");

    elC.classList.remove("slide--left", "slide--right");
    elC.classList.add("slide--center");

    elR.classList.remove("slide--left", "slide--center");
    elR.classList.add("slide--right");
  };

  const forceRestart = (el) => {
    // перезапуск анимации гарантированно
    void el.offsetWidth;
  };

  const waitAnimEnd = (el, fallback = 700) =>
    new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        el.removeEventListener("animationend", onEnd);
        resolve();
      };
      const onEnd = (e) => {
        if (e.target !== el) return;
        finish();
      };
      el.addEventListener("animationend", onEnd);
      setTimeout(finish, fallback);
    });

  const next = async () => {
    if (lock) return;
    if (prefersReduce) {
      index = clamp(index + 1);
      syncAll();
      return;
    }
    lock = true;
    btnPrev && (btnPrev.disabled = true);
    btnNext && (btnNext.disabled = true);

    clearAnim();
    forceRestart(elC); forceRestart(elR); forceRestart(elL);

    // Анимируем как у тебя в CSS:
    // center -> left, right -> center, left -> fade out
    elC.classList.add("anim-next-toLeft");
    elR.classList.add("anim-next-fromRight");
    elL.classList.add("anim-next-fadeOutLeft");

    await waitAnimEnd(elC, 760);

    // РОТАЦИЯ элементов (без телепортов)
    // было: [L, C, R] -> стало: [C, R, L]
    const oldL = elL, oldC = elC, oldR = elR;
    elL = oldC;
    elC = oldR;
    elR = oldL;

    index = clamp(index + 1);

    // фикс классов позиций + очистка анимаций
    clearAnim();
    setPosClasses();

    // обновляем ТОЛЬКО новый right (это бывший oldL)
    fill(elR, items[clamp(index + 1)]);

    lock = false;
    btnPrev && (btnPrev.disabled = false);
    btnNext && (btnNext.disabled = false);
  };

  const prev = async () => {
    if (lock) return;
    if (prefersReduce) {
      index = clamp(index - 1);
      syncAll();
      return;
    }
    lock = true;
    btnPrev && (btnPrev.disabled = true);
    btnNext && (btnNext.disabled = true);

    clearAnim();
    forceRestart(elC); forceRestart(elR); forceRestart(elL);

    // center -> right, left -> center, right -> fade out
    elC.classList.add("anim-prev-toRight");
    elL.classList.add("anim-prev-fromLeft");
    elR.classList.add("anim-prev-fadeOutRight");

    await waitAnimEnd(elC, 760);

    // РОТАЦИЯ: [L, C, R] -> [R, L, C]
    const oldL = elL, oldC = elC, oldR = elR;
    elR = oldC;
    elC = oldL;
    elL = oldR;

    index = clamp(index - 1);

    clearAnim();
    setPosClasses();

    // обновляем ТОЛЬКО новый left (это бывший oldR)
    fill(elL, items[clamp(index - 1)]);

    lock = false;
    btnPrev && (btnPrev.disabled = false);
    btnNext && (btnNext.disabled = false);
  };

  btnNext?.addEventListener("click", next, { passive: true });
  btnPrev?.addEventListener("click", prev, { passive: true });

  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") next();
    if (e.key === "ArrowLeft") prev();
  });

  syncAll();
})();


  /* ---------------------------
     3) Contact details — FIX (no instant close, no huge empty block)
     Manual open/close, native toggle bypassed
  --------------------------- */
  (() => {
    const details = document.getElementById("contactDetails");
    const panel = document.getElementById("contactPanel");
    const summary = details?.querySelector("summary");
    if (!details || !panel || !summary) return;

    let busy = false;

    const setH = (px) => (panel.style.height = `${px}px`);

    const open = async () => {
      if (busy) return;
      busy = true;

      details.open = true; // важно: сначала открыть, чтобы scrollHeight был корректный
      details.classList.add("is-open");

      panel.style.overflow = "hidden";
      panel.style.willChange = "height, opacity, transform";

      // старт с 0
      setH(0);
      await raf2();

      const target = panel.scrollHeight;

      if (prefersReduce) {
        setH(target);
        panel.style.height = "auto";
        panel.style.overflow = "";
        panel.style.willChange = "";
        busy = false;
        return;
      }

      setH(target);
      await waitEnd(panel, Math.max(400, Math.ceil(maxMotionMs(panel) + 80)));

      // финал: auto чтобы не ломало адаптив/ресайз
      panel.style.height = "auto";
      panel.style.overflow = "";
      panel.style.willChange = "";
      busy = false;
    };

    const close = async () => {
      if (busy) return;
      busy = true;

      // фиксируем текущую высоту (даже если auto)
      const current = panel.scrollHeight;
      panel.style.overflow = "hidden";
      panel.style.willChange = "height, opacity, transform";
      setH(current);
      await raf2();

      if (prefersReduce) {
        setH(0);
        details.classList.remove("is-open");
        details.open = false;
        panel.style.overflow = "";
        panel.style.willChange = "";
        busy = false;
        return;
      }

      setH(0);
      await waitEnd(panel, Math.max(400, Math.ceil(maxMotionMs(panel) + 80)));

      // только ПОСЛЕ анимации реально закрываем <details>
      details.classList.remove("is-open");
      details.open = false;

      panel.style.overflow = "";
      panel.style.willChange = "";
      busy = false;
    };

    // перехватываем клик по summary (иначе нативный toggle ломает анимацию)
    summary.addEventListener("click", (e) => {
      e.preventDefault();
      if (details.open) close();
      else open();
    });

    // стартовое состояние
    details.open = false;
    details.classList.remove("is-open");
    setH(0);
  })();

  /* ---------------------------
     4) Form toast — cancel previous animation
  --------------------------- */
  (() => {
    const form = document.getElementById("contactForm");
    const toast = document.getElementById("formToast");
    if (!form || !toast) return;

    let toastAnim = null;

    const play = (keyframes, options) => {
      try {
        toastAnim?.cancel?.();
        toastAnim = toast.animate(keyframes, options);
      } catch {
        // fallback: без WAAPI
      }
    };

    form.addEventListener("submit", (e) => {
      e.preventDefault();

      const fd = new FormData(form);
      const email = String(fd.get("email") || "").trim();

      if (!email) {
        toast.textContent = "Укажите email — это обязательное поле.";
        play([{ opacity: 0 }, { opacity: 1 }], { duration: 180 });
        return;
      }

      toast.textContent =
        "Заявка отправлена (демо). Подключим сервер — будет реальная отправка.";
      play(
        [
          { opacity: 0, transform: "translateY(4px)" },
          { opacity: 1, transform: "translateY(0px)" },
        ],
        { duration: 220, easing: "cubic-bezier(0.2,0.8,0.2,1)" }
      );

      form.reset();
    });
  })();
})();
