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
     2) Carousel — ROTATE SLIDES (no snap, no DOM wipe)
     + smooth fade in/out on card content updates
  --------------------------- */
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

    let index = 0; // текущий центр
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

    // 1) создаём слайды ОДИН раз и больше не делаем innerHTML wipe
    const makeSlide = (pos) => {
      const el = document.createElement("div");
      el.className = `slide slide--${pos}`;

      const card = document.createElement("div");
      card.className = "slide__card";

      const media = document.createElement("div");
      media.className = "slide__media";

      const img = document.createElement("img");
      img.loading = "lazy";
      img.decoding = "async";
      media.appendChild(img);

      const body = document.createElement("div");
      body.className = "slide__body";

      const title = document.createElement("h3");
      title.className = "slide__title";

      const text = document.createElement("p");
      text.className = "slide__text";

      body.appendChild(title);
      body.appendChild(text);

      card.appendChild(media);
      card.appendChild(body);
      el.appendChild(card);

      // refs
      el._refs = { img, title, text };
      return el;
    };

    // 2) fill: обновляем только поля, + плавный fade при подмене контента
    const fill = async (el, item, { animate = false } = {}) => {
      if (!el || !el._refs) return;
      const { img, title, text } = el._refs;

      if (animate && !prefersReduce) {
        el.classList.add("is-updating"); // CSS сделает fade-out
        await raf2();
      }

      img.src = item.img;
      img.alt = String(item.title || "");
      title.textContent = String(item.title || "");
      text.textContent = String(item.text || "");

      if (animate && !prefersReduce) {
        await raf2(); // применить контент
        el.classList.remove("is-updating"); // fade-in
      } else {
        el.classList.remove("is-updating");
      }
    };

    // 3 постоянных слайда
    let elL = makeSlide("left");
    let elC = makeSlide("center");
    let elR = makeSlide("right");
    viewport.replaceChildren(elL, elC, elR);

    const syncAll = async () => {
      await fill(elL, items[clamp(index - 1)], { animate: false });
      await fill(elC, items[clamp(index)], { animate: false });
      await fill(elR, items[clamp(index + 1)], { animate: false });
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
      void el.offsetWidth;
    };

    const waitAnimEnd = (el, fallback = 760) =>
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

    const disableBtns = (v) => {
      if (btnPrev) btnPrev.disabled = v;
      if (btnNext) btnNext.disabled = v;
    };

    const next = async () => {
      if (lock) return;

      if (prefersReduce) {
        index = clamp(index + 1);
        await syncAll();
        return;
      }

      lock = true;
      disableBtns(true);

      clearAnim();
      forceRestart(elC);
      forceRestart(elR);
      forceRestart(elL);

      // center -> left, right -> center, left -> fade out
      elC.classList.add("anim-next-toLeft");
      elR.classList.add("anim-next-fromRight");
      elL.classList.add("anim-next-fadeOutLeft");

      await waitAnimEnd(elC, 760);

      // ROTATE elements: [L,C,R] -> [C,R,L]
      const oldL = elL,
        oldC = elC,
        oldR = elR;
      elL = oldC;
      elC = oldR;
      elR = oldL;

      index = clamp(index + 1);

      clearAnim();
      setPosClasses();

      // обновляем ТОЛЬКО новый right (это бывший oldL) — с плавным появлением
      await fill(elR, items[clamp(index + 1)], { animate: true });

      lock = false;
      disableBtns(false);
    };

    const prev = async () => {
      if (lock) return;

      if (prefersReduce) {
        index = clamp(index - 1);
        await syncAll();
        return;
      }

      lock = true;
      disableBtns(true);

      clearAnim();
      forceRestart(elC);
      forceRestart(elR);
      forceRestart(elL);

      // center -> right, left -> center, right -> fade out
      elC.classList.add("anim-prev-toRight");
      elL.classList.add("anim-prev-fromLeft");
      elR.classList.add("anim-prev-fadeOutRight");

      await waitAnimEnd(elC, 760);

      // ROTATE: [L,C,R] -> [R,L,C]
      const oldL = elL,
        oldC = elC,
        oldR = elR;
      elR = oldC;
      elC = oldL;
      elL = oldR;

      index = clamp(index - 1);

      clearAnim();
      setPosClasses();

      // обновляем ТОЛЬКО новый left (это бывший oldR) — с плавным появлением
      await fill(elL, items[clamp(index - 1)], { animate: true });

      lock = false;
      disableBtns(false);
    };

    btnNext?.addEventListener("click", next, { passive: true });
    btnPrev?.addEventListener("click", prev, { passive: true });

    window.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    });

    // init
    syncAll();
  })();

  /* ---------------------------
     3) Details accordion — fixed height animation
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

      details.open = true;
      details.classList.add("is-open");

      panel.style.overflow = "hidden";
      panel.style.willChange = "height, opacity, transform";

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

      panel.style.height = "auto";
      panel.style.overflow = "";
      panel.style.willChange = "";
      busy = false;
    };

    const close = async () => {
      if (busy) return;
      busy = true;

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

      details.classList.remove("is-open");
      details.open = false;

      panel.style.overflow = "";
      panel.style.willChange = "";
      busy = false;
    };

    summary.addEventListener("click", (e) => {
      e.preventDefault();
      if (details.open) close();
      else open();
    });

    details.open = false;
    details.classList.remove("is-open");
    setH(0);
  })();

  /* ---------------------------
     4) Form toast — WAAPI
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
      } catch {}
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
