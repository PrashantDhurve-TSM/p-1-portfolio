/* =========================================================
   Portfolio: GSAP animations, Lenis smooth scroll, nav, filters, form
   Everything degrades gracefully: if a library fails to load or the visitor
   prefers reduced motion, the page still works with no hidden content.
   ========================================================= */
(() => {
  "use strict";

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

  const hasGsap = typeof gsap !== "undefined" && typeof ScrollTrigger !== "undefined";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const animate = hasGsap && !reduceMotion;

  if (hasGsap) gsap.registerPlugin(ScrollTrigger);

  const loader = $("#loader");
  const nav = $("#nav");
  const menu = $("#menu");
  const toggle = $("#menuToggle");
  const progress = $("#progress");

  /* ---------------------------------------------------------
     1. Smooth scrolling (Lenis, wired into GSAP's ticker)
     --------------------------------------------------------- */
  let lenis = null;
  if (animate && typeof Lenis !== "undefined") {
    lenis = new Lenis({
      duration: 1.15,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  function scrollToTarget(target) {
    const el = typeof target === "string" ? $(target) : target;
    if (!el) return;
    const isTop = el.id === "home";
    const offset = isTop ? 0 : -(nav.offsetHeight - 1);

    if (lenis) {
      lenis.scrollTo(isTop ? 0 : el, { offset, duration: 1.4 });
    } else {
      const top = isTop ? 0 : el.getBoundingClientRect().top + window.scrollY + offset;
      window.scrollTo({ top, behavior: reduceMotion ? "auto" : "smooth" });
    }
  }

  /* ---------------------------------------------------------
     2. Navbar: scrolled state, progress bar, mobile menu, active link
     --------------------------------------------------------- */
  function onScroll() {
    const y = window.scrollY;
    nav.classList.toggle("is-scrolled", y > 24);
    const max = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.transform = `scaleX(${max > 0 ? Math.min(y / max, 1) : 0})`;
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  function setMenu(open) {
    nav.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    document.body.style.overflow = open ? "hidden" : "";
    if (lenis) (open ? lenis.stop() : lenis.start());
  }
  toggle.addEventListener("click", () => setMenu(!nav.classList.contains("is-open")));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") setMenu(false); });
  window.matchMedia("(min-width: 861px)").addEventListener("change", (e) => { if (e.matches) setMenu(false); });

  // Anchor links scroll smoothly and account for the fixed navbar.
  $$('a[href^="#"]').forEach((link) => {
    link.addEventListener("click", (e) => {
      const hash = link.getAttribute("href");
      if (hash.length < 2) { e.preventDefault(); return; } // "#" placeholders do nothing
      const target = $(hash);
      if (!target) return;
      e.preventDefault();
      setMenu(false);
      scrollToTarget(target);
      history.replaceState(null, "", hash);
    });
  });

  // Highlight the nav link for the section in view.
  const navLinks = $$(".nav__link");
  const spy = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        navLinks.forEach((l) => l.classList.toggle("is-active", l.getAttribute("href") === `#${entry.target.id}`));
      });
    },
    { rootMargin: "-45% 0px -50% 0px" }
  );
  navLinks.forEach((l) => { const s = $(l.getAttribute("href")); if (s) spy.observe(s); });

  /* ---------------------------------------------------------
     3. Small helpers
     --------------------------------------------------------- */
  $("#year").textContent = new Date().getFullYear();

  // If a remote image fails, the soft orange background behind it shows instead.
  $$("img").forEach((img) => {
    const hide = () => { img.style.visibility = "hidden"; };
    img.addEventListener("error", hide);
    if (img.complete && img.naturalWidth === 0) hide();
  });

  // Wrap every word in a mask so it can slide up into view.
  function splitWords(el) {
    el.setAttribute("aria-label", el.textContent.trim());
    const walk = (node) => {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(" ")); return; }
            const mask = document.createElement("span");
            mask.className = "word-mask";
            mask.setAttribute("aria-hidden", "true");
            const word = document.createElement("span");
            word.className = "word";
            word.textContent = part;
            mask.appendChild(word);
            frag.appendChild(mask);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === 1) {
          walk(child);
        }
      });
    };
    walk(el);
    return $$(".word", el);
  }

  /* ---------------------------------------------------------
     4. Project filters
     --------------------------------------------------------- */
  const cards = $$(".project");
  const filterButtons = $$(".filter");

  function applyFilter(filter) {
    filterButtons.forEach((b) => {
      const on = b.dataset.filter === filter;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", String(on));
    });

    cards.forEach((card) => {
      const match = filter === "all" || card.dataset.category.split(" ").includes(filter);
      card.hidden = !match;
    });

    if (!animate) return;
    const visible = cards.filter((c) => !c.hidden);
    // drop any pending scroll-reveal on the cards so the two animations don't fight
    gsap.killTweensOf(cards);
    gsap.fromTo(
      visible,
      { opacity: 0, y: 36, scale: 0.97 },
      { opacity: 1, y: 0, scale: 1, duration: 0.8, ease: "power3.out", stagger: 0.08, clearProps: "transform,opacity" }
    );
    ScrollTrigger.refresh();
  }
  filterButtons.forEach((b) => b.addEventListener("click", () => applyFilter(b.dataset.filter)));

  /* ---------------------------------------------------------
     5. Contact form (validation + send)
     --------------------------------------------------------- */
  const form = $("#contactForm");
  const statusEl = $("#formStatus");
  const submitBtn = $("#submitBtn");

  function setError(field, message) {
    const wrap = field.closest(".field");
    wrap.classList.toggle("has-error", Boolean(message));
    $(`#${field.id}Error`).textContent = message || "";
    field.setAttribute("aria-invalid", message ? "true" : "false");
  }
  ["name", "email", "message"].forEach((id) => {
    $(`#${id}`).addEventListener("input", (e) => setError(e.target, ""));
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (form.elements.company.value) return; // spam trap: real people leave this empty

    const name = form.elements.name;
    const email = form.elements.email;
    const message = form.elements.message;
    let firstInvalid = null;

    const check = (field, test, text) => {
      const bad = !test;
      setError(field, bad ? text : "");
      if (bad && !firstInvalid) firstInvalid = field;
    };
    check(name, name.value.trim().length >= 2, "Please enter your name.");
    check(email, /^\S+@\S+\.\S+$/.test(email.value.trim()), "Please enter a valid email address.");
    check(message, message.value.trim().length >= 10, "Please write at least a few words about your project.");

    statusEl.className = "form__status";
    statusEl.textContent = "";
    if (firstInvalid) { firstInvalid.focus(); return; }

    const payload = { name: name.value.trim(), email: email.value.trim(), message: message.value.trim() };
    const endpoint = form.dataset.endpoint;

    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";

    try {
      if (endpoint) {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("Request failed");
        form.reset();
        statusEl.classList.add("is-success");
        statusEl.textContent = "Thanks! Your message has been sent. I’ll reply within one working day.";
      } else {
        // No form service connected yet: fall back to the visitor's email app.
        const to = $(".contact__mail").getAttribute("href").replace("mailto:", "");
        const subject = encodeURIComponent(`Project enquiry from ${payload.name}`);
        const body = encodeURIComponent(`${payload.message}\n\n${payload.name}\n${payload.email}`);
        window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
        statusEl.classList.add("is-success");
        statusEl.textContent = "Opening your email app so you can send the message.";
      }
    } catch (err) {
      statusEl.classList.add("is-error");
      statusEl.textContent = "Something went wrong. Please try again, or email me directly.";
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Send message";
    }
  });

  /* ---------------------------------------------------------
     6. Animations (GSAP + ScrollTrigger)
     --------------------------------------------------------- */
  if (!animate) {
    // Reduced motion, or GSAP failed to load: show everything, no loader.
    loader && loader.remove();
    return;
  }

  // Safety net: never leave the visitor stuck behind the loader.
  setTimeout(() => { if (loader && document.body.contains(loader)) loader.remove(); }, 7000);

  /* ---- Starting states (hidden behind the loader) ---- */
  const heroWords = splitWords($(".hero__title"));
  gsap.set(heroWords, { yPercent: 115 });
  gsap.set([".hero__text", ".hero__actions"], { opacity: 0, y: 28 });
  gsap.set(".hero__photo", { opacity: 0, y: 60 });
  gsap.set(".hero__orb", { scale: 0, transformOrigin: "60% 60%" });
  gsap.set(".hero__badge", { scale: 0, rotate: -120 });
  gsap.set(".nav__bar", { opacity: 0, y: -24 });

  document.body.style.overflow = "hidden";
  if (lenis) lenis.stop();

  /* ---- The one big moment: landing sequence ---- */
  function heroIntro() {
    gsap
      .timeline({ defaults: { ease: "power4.out" } })
      .to(".nav__bar", { opacity: 1, y: 0, duration: 0.9 })
      .to(heroWords, { yPercent: 0, duration: 1.2, stagger: 0.07 }, "-=0.6")
      .to(".hero__orb", { scale: 1, duration: 1.3, ease: "expo.out" }, "-=1")
      .to(".hero__photo", { opacity: 1, y: 0, duration: 1.2 }, "-=1.1")
      .from(".hero__photo img", { scale: 1.4, duration: 1.8, ease: "power3.out" }, "<")
      .to([".hero__text", ".hero__actions"], { opacity: 1, y: 0, duration: 0.9, stagger: 0.12 }, "-=1")
      .to(".hero__badge", { scale: 1, rotate: 0, duration: 1.1, ease: "back.out(1.6)" }, "-=0.7");
  }

  function runLoader() {
    const count = $("#loaderCount");
    const bar = $("#loaderBar");
    const state = { v: 0 };

    gsap
      .timeline({
        onComplete: () => {
          loader.remove();
          document.body.style.overflow = "";
          if (lenis) lenis.start();
          ScrollTrigger.refresh();
        },
      })
      .to(state, {
        v: 100,
        duration: 1.4,
        ease: "power2.inOut",
        onUpdate: () => {
          count.textContent = Math.round(state.v);
          bar.style.transform = `scaleX(${state.v / 100})`;
        },
      })
      .add(heroIntro, "+=0.1")
      .to(loader, { yPercent: -100, duration: 0.95, ease: "power4.inOut" }, "<");
  }
  runLoader();   

  /* ---- Hero: parallax on scroll ---- */
  gsap.to(".hero__orb", { yPercent: -14, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });
  gsap.to(".hero__photo img", { yPercent: 8, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });

  /* ---- Section headings: words rise when scrolled into view ---- */
  $$("[data-split]")
    .filter((el) => !el.classList.contains("hero__title"))
    .forEach((el) => {
      const words = splitWords(el);
      gsap.from(words, {
        yPercent: 115,
        duration: 1,
        stagger: 0.06,
        ease: "power4.out",
        scrollTrigger: { trigger: el, start: "top 88%", once: true },
      });
    });

  /* ---- Generic reveals: soft rise, or slide in from the left ---- */
  $$("[data-reveal]").forEach((el) => {
    const fromLeft = el.dataset.reveal === "left";
    gsap.from(el, {
      x: fromLeft ? -70 : 0,
      y: fromLeft ? 0 : 34,
      opacity: 0,
      duration: 1,
      ease: "power3.out",
      clearProps: "transform,opacity",
      scrollTrigger: { trigger: el, start: "top 90%", once: true },
    });
  });

  /* ---- About: image parallax and the orange frame sliding into place ---- */
  $$("[data-parallax]").forEach((wrap) => {
    const img = $("img", wrap);
    if (!img) return;
    gsap.fromTo(img, { yPercent: -7 }, { yPercent: 7, ease: "none", scrollTrigger: { trigger: wrap, start: "top bottom", end: "bottom top", scrub: true } });
  });
  gsap.from(".about__frame", {
    x: -40, y: -40, duration: 1.2, ease: "power3.out",
    scrollTrigger: { trigger: ".about__media", start: "top 80%", once: true },
  });

  /* ---- Count-up numbers ---- */
  $$("[data-count]").forEach((el) => {
    const end = Number(el.dataset.count);
    const suffix = el.dataset.suffix || "";
    const state = { v: 0 };
    el.textContent = `0${suffix}`;
    ScrollTrigger.create({
      trigger: el,
      start: "top 92%",
      once: true,
      onEnter: () =>
        gsap.to(state, {
          v: end, duration: 1.8, ease: "power2.out",
          onUpdate: () => { el.textContent = `${Math.round(state.v)}${suffix}`; },
        }),
    });
  });

  /* ---- Skill bars fill while their number counts up ---- */
  $$(".meter").forEach((meter) => {
    const fill = $(".meter__fill", meter);
    const value = $(".meter__value", meter);
    const level = Number(value.dataset.level);
    const state = { v: 0 };
    gsap.set(fill, { scaleX: 0 });
    value.textContent = "0%";
    ScrollTrigger.create({
      trigger: meter,
      start: "top 92%",
      once: true,
      onEnter: () => {
        gsap.to(fill, { scaleX: 1, duration: 1.5, ease: "power3.out" });
        gsap.to(state, { v: level, duration: 1.5, ease: "power3.out", onUpdate: () => { value.textContent = `${Math.round(state.v)}%`; } });
      },
    });
  });

  /* ---- Contact panel grows in ---- */
  gsap.from(".contact__panel", {
    y: 70, scale: 0.97, opacity: 0, duration: 1.2, ease: "power3.out", clearProps: "transform,opacity",
    scrollTrigger: { trigger: ".contact__panel", start: "top 88%", once: true },
  });

  /* ---- Keep trigger positions right once fonts and images settle ---- */
  window.addEventListener("load", () => ScrollTrigger.refresh());
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => ScrollTrigger.refresh());
})();