const revealItems = document.querySelectorAll(".reveal");

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries, instance) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        instance.unobserve(entry.target);
      });
    },
    { threshold: 0.12 },
  );

  revealItems.forEach((item) => observer.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}

const year = document.querySelector("#year");
if (year) year.textContent = new Date().getFullYear();

const heroVideo = document.querySelector("#hero-timelapse");
const heroPlayback = document.querySelector(".hero-playback");

if (heroVideo && heroPlayback) {
  const player = heroVideo.closest(".hero-player");
  const label = heroPlayback.querySelector("span");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let wantsPlayback = !reducedMotion.matches && !navigator.connection?.saveData;
  let inView = !("IntersectionObserver" in window);
  let loaded = false;
  let failed = false;

  const updateControl = () => {
    const playing = !heroVideo.paused;
    label.textContent = playing ? "Pause animation" : "Play animation";
    heroPlayback.classList.toggle("is-playing", playing);
  };

  const play = () => {
    if (failed) return;
    if (!loaded) {
      heroVideo.src = heroVideo.dataset.src;
      heroVideo.load();
      loaded = true;
    }
    // Autoplay can be blocked by browser preferences or low power mode.
    // In that case the poster and explicit play button remain available.
    heroVideo.play().catch(updateControl);
  };

  const syncPlayback = () => {
    if (wantsPlayback && inView && !document.hidden) play();
    else heroVideo.pause();
  };

  const showPoster = () => {
    if (!loaded) return;
    failed = true;
    heroVideo.pause();
    player.classList.remove("has-video");
    heroPlayback.hidden = true;
  };

  heroVideo.addEventListener("playing", () => {
    player.classList.add("has-video");
    updateControl();
  });
  heroVideo.addEventListener("pause", updateControl);
  heroVideo.addEventListener("error", showPoster);

  heroPlayback.addEventListener("click", () => {
    wantsPlayback = heroVideo.paused;
    if (wantsPlayback) play();
    else heroVideo.pause();
  });
  heroPlayback.hidden = false;
  updateControl();

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting && entry.intersectionRatio >= 0.1;
      syncPlayback();
    }, { threshold: 0.1 });
    observer.observe(player);
  }

  reducedMotion.addEventListener("change", () => {
    wantsPlayback = !reducedMotion.matches;
    if (reducedMotion.matches) {
      heroVideo.pause();
      player.classList.remove("has-video");
      if (heroVideo.readyState > 0) heroVideo.currentTime = 0;
    }
    syncPlayback();
  });
  document.addEventListener("visibilitychange", syncPlayback);
  syncPlayback();
}
