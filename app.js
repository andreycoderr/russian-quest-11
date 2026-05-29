(function () {
  "use strict";

  const STORE_KEY = "rusquest11:v1";
  const STATIONS = (window.QUEST && window.QUEST.stations) || [];
  const TOTAL_Q = STATIONS.reduce((n, s) => n + s.questions.length, 0);
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- helpers ----------
  function $(sel) { return document.querySelector(sel); }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function plural(n, one, few, many) {
    const n10 = n % 10, n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return one;
    if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
    return many;
  }
  function countUp(el, to, dur) {
    if (!el) return;
    const from = parseInt(el.textContent, 10) || 0;
    if (reduceMotion || from === to || document.hidden) { el.textContent = to; return; }
    const t0 = performance.now();
    function step(t) {
      const k = Math.min(1, (t - t0) / dur);
      const ease = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(from + (to - from) * ease);
      if (k < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
    // safety net: guarantee the final value even if rAF is throttled (background tab)
    setTimeout(() => { el.textContent = to; }, dur + 80);
  }

  // ---------- progress ----------
  function loadProgress() {
    try { const raw = localStorage.getItem(STORE_KEY); if (raw) return JSON.parse(raw); }
    catch (e) { /* ignore */ }
    return { best: {}, done: {} };
  }
  function saveProgress() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(progress)); } catch (e) { /* ignore */ }
  }
  let progress = loadProgress();
  if (!progress.best) progress.best = {};
  if (!progress.done) progress.done = {};
  if (!progress.settings) progress.settings = {};
  if (typeof progress.settings.threshold !== "number") progress.settings.threshold = 0.5;
  if (typeof progress.settings.name !== "string") progress.settings.name = "";
  if (typeof progress.settings.teacher !== "boolean") progress.settings.teacher = false;

  // teacher mode: a code unlocks access to every station at once
  const TEACHER_CODE = "1106";

  // a station is "passed" once you score at least the chosen share of its stars
  function passReq(total) { return Math.max(1, Math.ceil(total * progress.settings.threshold)); }
  function isPassed(index) {
    const s = STATIONS[index];
    return (progress.best[s.id] || 0) >= passReq(s.questions.length);
  }
  // the next station unlocks only after the previous one is passed (≥ half stars).
  // Teacher mode opens access to all stations regardless of progress.
  function isUnlocked(index) { return !!progress.settings.teacher || index === 0 || isPassed(index - 1); }
  function earnedStars() { return STATIONS.reduce((n, s) => n + (progress.best[s.id] || 0), 0); }
  function firstPlayableIndex() {
    for (let i = 0; i < STATIONS.length; i++) {
      if (isUnlocked(i) && !isPassed(i)) return i; // first reachable station not yet passed
    }
    return STATIONS.length - 1; // everything passed → last station
  }

  // ---------- views ----------
  const views = { map: $("#view-map"), station: $("#view-station"), result: $("#view-result"), certificate: $("#view-certificate"), analysis: $("#view-analysis") };
  function showView(name) {
    Object.keys(views).forEach(k => { views[k].hidden = (k !== name); });
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  }
  function goMap() { renderMap(); showView("map"); }

  // ============================================================
  //  MAP
  // ============================================================
  function renderMap() {
    const earned = earnedStars();
    countUp($("#stars-earned"), earned, 700);
    $("#stars-total").textContent = TOTAL_Q;

    const ring = $("#orb-fill");
    const C = 2 * Math.PI * 52;
    ring.style.strokeDasharray = C.toFixed(1);
    ring.style.strokeDashoffset = (C * (1 - (TOTAL_Q ? earned / TOTAL_Q : 0))).toFixed(1);

    // start/continue label
    const anyProgress = earned > 0;
    const startLabel = $("#start-label");
    if (startLabel) startLabel.textContent = STATIONS.every(s => progress.done[s.id]) ? "Пройти ещё раз" : (anyProgress ? "Продолжить квест" : "Начать квест");

    renderRankBanner(earned);

    const grid = $("#map-grid");
    grid.innerHTML = "";
    STATIONS.forEach((s, i) => {
      const unlocked = isUnlocked(i);
      const done = !!progress.done[s.id];
      const passed = isPassed(i);
      const best = progress.best[s.id] || 0;
      const total = s.questions.length;

      const card = document.createElement(unlocked ? "button" : "div");
      card.className = "station-card" + (unlocked ? "" : " is-locked") + (passed ? " is-done" : "");
      card.style.setProperty("--hue", s.hue);
      card.style.setProperty("--d", (i * 0.05) + "s");
      if (unlocked) {
        card.type = "button";
        card.addEventListener("click", () => openStation(i));
      } else {
        card.setAttribute("aria-disabled", "true");
      }
      const pct = total ? Math.round((best / total) * 100) : 0;
      const status = passed ? '<span class="sc-status ok">✓ пройдена</span>'
        : (unlocked && done) ? '<span class="sc-status retry">↻ повторить</span>'
        : (!unlocked) ? '<span class="sc-status">🔒</span>' : "";
      const prevTotal = i > 0 ? STATIONS[i - 1].questions.length : 0;
      card.innerHTML = `
        <div class="sc-top">
          <span class="sc-tag">${s.tag}</span>
          <span class="sc-num">Станция&nbsp;${i + 1}</span>
          ${status}
        </div>
        <h3 class="sc-title">${s.title}</h3>
        <p class="sc-sub">${s.subtitle}</p>
        <div class="sc-foot">
          <div class="sc-bar"><span style="width:${pct}%"></span></div>
          <span class="sc-stars">${best}/${total} ⭐</span>
        </div>
        ${unlocked ? "" : `<p class="sc-lock-note">🔒 Наберите ≥&nbsp;${passReq(prevTotal)} из&nbsp;${prevTotal}&nbsp;⭐ на станции&nbsp;${i}</p>`}
      `;
      grid.appendChild(card);
    });

    renderSettings();
    renderTeacherBtn();
    renderFinale();
  }

  function allPassed() { return STATIONS.every((_, i) => isPassed(i)); }

  // ---------- teacher mode ----------
  function renderTeacherBtn() {
    const b = $("#teacher-btn");
    if (!b) return;
    const on = !!progress.settings.teacher;
    b.classList.toggle("is-active", on);
    b.innerHTML = on
      ? '<span class="tb-ico" aria-hidden="true">🔓</span> Учитель: доступ открыт'
      : '<span class="tb-ico" aria-hidden="true">🔑</span> Кнопка учителя';
  }

  function handleTeacherClick() {
    if (progress.settings.teacher) {
      if (confirm("Выключить режим учителя? Доступ к станциям снова будет открываться по набранному порогу.")) {
        progress.settings.teacher = false;
        saveProgress();
        renderMap();
        toast("Режим учителя выключен");
      }
      return;
    }
    const code = prompt("Кнопка учителя\n\nВведите код, чтобы открыть доступ ко всем станциям:");
    if (code === null) return; // отмена
    if (code.trim() === TEACHER_CODE) {
      progress.settings.teacher = true;
      saveProgress();
      renderMap();
      toast("Доступ открыт: все станции разблокированы");
    } else {
      toast("Неверный код");
    }
  }

  // ---------- settings (unlock threshold) ----------
  function renderSettings() {
    const th = progress.settings.threshold;
    document.querySelectorAll("#set-options button").forEach(b => {
      b.classList.toggle("active", Math.abs(parseFloat(b.dataset.th) - th) < 0.001);
    });
    const hint = $("#set-hint");
    if (hint) hint.textContent = th >= 1 ? "нужны все звёзды станции (идеально)" : `нужно ≥ ${Math.round(th * 100)}% звёзд станции`;
  }

  // ---------- finale ----------
  function renderFinale() {
    const el = $("#finale");
    if (!el) return;
    const passedCount = STATIONS.filter((_, i) => isPassed(i)).length;
    const earned = earnedStars();
    if (passedCount === STATIONS.length) {
      el.innerHTML = `
        <button type="button" class="finale-card unlocked" id="finale-card">
          <span class="finale-trophy">🏆</span>
          <span class="finale-body">
            <span class="finale-title">Финал открыт — получите грамоту!</span>
            <span class="finale-sub">Все ${STATIONS.length} станций пройдены · ${earned}/${TOTAL_Q} ⭐. Оформите грамоту и отправьте результат репетитору.</span>
          </span>
          <span class="finale-go" aria-hidden="true">→</span>
        </button>`;
      $("#finale-card").addEventListener("click", showCertificate);
    } else {
      const pct = Math.round(passedCount / STATIONS.length * 100);
      el.innerHTML = `
        <div class="finale-card locked">
          <span class="finale-trophy">🔒</span>
          <span class="finale-body">
            <span class="finale-title">Финал · грамота за весь квест</span>
            <span class="finale-sub">Пройдено станций: ${passedCount} из ${STATIONS.length}. Пройдите все станции на выбранном пороге — и откроется грамота с экспортом результата.</span>
            <span class="finale-bar"><span style="width:${pct}%"></span></span>
          </span>
        </div>`;
    }
  }

  function rankFor(earned) {
    const pct = TOTAL_Q ? earned / TOTAL_Q : 0;
    if (earned === 0) return null;
    if (pct >= 0.9) return { title: "Магистр слова", note: "Блестящее владение нормами русского языка!" };
    if (pct >= 0.75) return { title: "Знаток русского языка", note: "Очень уверенный результат — до вершины совсем близко." };
    if (pct >= 0.55) return { title: "Уверенный уровень", note: "Хорошая база. Повтори станции с ошибками — и будет отлично." };
    return { title: "Начало пути", note: "Главное — начать. Разбирай объяснения и возвращайся за звёздами." };
  }
  function renderRankBanner(earned) {
    const banner = $("#rank-banner");
    const r = rankFor(earned);
    if (!r) { banner.hidden = true; return; }
    const allDone = STATIONS.every(s => progress.done[s.id]);
    banner.hidden = false;
    banner.innerHTML = `
      <span class="rb-label">${allDone ? "Квест пройден · твой ранг" : "Текущий ранг"}</span>
      <span class="rb-title">${r.title}</span>
      <span class="rb-note">${r.note}</span>`;
  }

  // ============================================================
  //  STATION PLAY
  // ============================================================
  let cur = null;        // { index, station, order, qi, correct, streak, answered }
  let lastFinished = 0;  // index of last finished station (for result buttons)

  const lastOrders = {}; // remember each station's previous question order
  function sameOrder(a, b) { return a.length === b.length && a.every((v, i) => v === b[i]); }

  function openStation(index) {
    const station = STATIONS[index];
    const base = station.questions.map((_, k) => k);
    let order = shuffle(base);
    // on replay, guarantee a visibly different order so positions aren't memorised
    const prev = lastOrders[station.id];
    if (prev && base.length > 2) {
      let tries = 0;
      while (sameOrder(order, prev) && tries < 10) { order = shuffle(base); tries++; }
    }
    lastOrders[station.id] = order.slice();
    cur = { index, station, order, qi: 0, correct: 0, streak: 0, answered: false };
    $("#st-tag").textContent = station.tag;
    $("#st-tag").style.setProperty("--hue", station.hue);
    $("#st-name").textContent = station.title;
    $("#st-score").textContent = "0";
    $("#st-score-total").textContent = station.questions.length;
    updateStreak(0);
    showView("station");
    renderQuestion(false);
  }

  function updateStreak(n) {
    const el = $("#streak");
    $("#streak-n").textContent = n;
    if (n >= 2) {
      el.hidden = false;
      el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump");
    } else {
      el.hidden = true;
    }
  }

  function renderQuestion(animate) {
    const { station, order, qi } = cur;
    const q = station.questions[order[qi]];
    cur.answered = false;

    $("#qnum").textContent = qi + 1;
    $("#qtotal").textContent = station.questions.length;
    $("#track-fill").style.width = (qi / station.questions.length * 100) + "%";

    if (animate && !reduceMotion) {
      const card = $("#qcard");
      card.classList.remove("swap"); void card.offsetWidth; card.classList.add("swap");
    }

    $("#qtext").innerHTML = q.q;
    const passage = $("#qpassage");
    if (q.passage) { passage.hidden = false; passage.innerHTML = q.passage; }
    else { passage.hidden = true; passage.innerHTML = ""; }

    const fb = $("#feedback");
    fb.hidden = true; fb.className = "feedback";
    $("#next-btn").hidden = true;
    $("#next-label").textContent = (qi + 1 < station.questions.length) ? "Следующий вопрос" : "Завершить станцию";

    const board = $("#board");
    board.innerHTML = "";
    board.classList.toggle("board-compact", q.options.length === 2);
    const opts = shuffle(q.options.map((text, k) => ({ text, correct: k === q.answer })));
    opts.forEach((opt, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "option";
      btn.style.setProperty("--d", (idx * 0.05) + "s");
      btn.innerHTML = `<span class="opt-text">${opt.text}</span>`;
      btn.addEventListener("click", () => selectOption(btn, opt, board));
      board.appendChild(btn);
    });
  }

  function floatStar(el) {
    if (reduceMotion) return;
    const r = el.getBoundingClientRect();
    const f = document.createElement("div");
    f.className = "floatstar";
    f.textContent = "+1 ⭐";
    f.style.left = (r.left + r.width / 2 - 18) + "px";
    f.style.top = (r.top + 6) + "px";
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 900);
  }

  function selectOption(btn, opt, board) {
    if (cur.answered) return;
    cur.answered = true;

    const buttons = Array.from(board.querySelectorAll(".option"));
    buttons.forEach(b => b.classList.add("locked"));
    const q = cur.station.questions[cur.order[cur.qi]];

    if (opt.correct) {
      btn.classList.add("correct");
      cur.correct++;
      cur.streak++;
      countUp($("#st-score"), cur.correct, 300);
      updateStreak(cur.streak);
      floatStar(btn);
    } else {
      btn.classList.add("wrong");
      cur.streak = 0;
      updateStreak(0);
      buttons.forEach(b => {
        if (b.querySelector(".opt-text").innerHTML === q.options[q.answer]) b.classList.add("correct");
      });
    }

    const streakNote = (opt.correct && cur.streak >= 3) ? ` <b>· серия ${cur.streak} 🔥</b>` : "";
    const fb = $("#feedback");
    fb.hidden = false;
    fb.className = "feedback " + (opt.correct ? "ok" : "no");
    fb.innerHTML = `
      <span class="fb-head">${opt.correct ? "✓ Верно" + streakNote : "✗ Ошибка"}</span>
      <span class="fb-body">${q.explain}</span>`;
    $("#next-btn").hidden = false;
    $("#next-btn").focus();
  }

  function nextQuestion() {
    if (!cur || !cur.answered) return;
    if (cur.qi + 1 < cur.station.questions.length) {
      cur.qi++;
      renderQuestion(true);
      window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    } else {
      finishStation();
    }
  }

  // ============================================================
  //  RESULT
  // ============================================================
  function finishStation() {
    const { station, index, correct } = cur;
    const total = station.questions.length;
    if (correct > (progress.best[station.id] || 0)) progress.best[station.id] = correct;
    progress.done[station.id] = true;
    saveProgress();
    lastFinished = index;

    const isLast = index === STATIONS.length - 1;
    const pct = correct / total;
    const req = passReq(total);
    const passed = isPassed(index); // based on best score (updated above)

    let badge, title;
    if (!passed) { badge = "🔁"; title = "Почти получилось!"; }
    else if (pct === 1) { badge = "🏆"; title = "Безупречно!"; }
    else if (pct >= 0.7) { badge = "⭐"; title = "Отличная работа!"; }
    else { badge = "👍"; title = "Станция пройдена!"; }

    $("#result-badge").textContent = badge;
    $("#result-title").textContent = title;
    $("#result-score").innerHTML =
      `<b>${correct}</b> из <b>${total}</b> ${plural(total, "звезды", "звёзд", "звёзд")} на станции «${station.title}»`;

    let sub;
    if (!passed) {
      sub = `Чтобы открыть следующую станцию, наберите не меньше ${req} из ${total} ⭐. Загляни в объяснения и попробуй ещё раз — получится!`;
    } else {
      if (pct === 1) sub = "Все ответы верны — тема освоена на отлично.";
      else if (pct >= 0.7) sub = "Почти всё верно. Перечитай объяснения к промахам — и будет идеально.";
      else sub = "Порог пройден! Можно идти дальше или пройти заново для большего счёта.";
      sub += isLast ? " Это была последняя станция квеста!" : " Открыта следующая станция!";
    }
    $("#result-sub").textContent = sub;

    // next station only when this one is passed (≥ half) and it isn't the last
    $("#result-next").hidden = isLast || !passed;

    showView("result");
    if (passed && pct >= 0.7) confetti(pct === 1 ? 1 : 0.7);
  }

  // ============================================================
  //  CONFETTI (canvas, no deps)
  // ============================================================
  const cvs = $("#confetti");
  const ctx = cvs.getContext("2d");
  let parts = [], raf = null;
  function sizeCanvas() { cvs.width = innerWidth; cvs.height = innerHeight; }
  function confetti(intensity) {
    if (reduceMotion) return;
    sizeCanvas();
    const colors = ["#a855f7", "#ec4899", "#22d3ee", "#a3e635", "#f472b6", "#ffd166", "#ffffff"];
    const n = Math.round(140 * intensity);
    for (let i = 0; i < n; i++) {
      parts.push({
        x: innerWidth / 2 + (Math.random() - 0.5) * 220,
        y: innerHeight * 0.32,
        vx: (Math.random() - 0.5) * 11,
        vy: Math.random() * -13 - 4,
        g: 0.32 + Math.random() * 0.15,
        s: 5 + Math.random() * 7,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        c: colors[Math.floor(Math.random() * colors.length)],
        life: 0
      });
    }
    if (!raf) raf = requestAnimationFrame(tick);
  }
  function tick() {
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    parts.forEach(p => {
      p.vy += p.g; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life++;
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(0, 1 - p.life / 150);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6);
      ctx.restore();
    });
    parts = parts.filter(p => p.y < cvs.height + 40 && p.life < 150);
    if (parts.length) raf = requestAnimationFrame(tick);
    else { ctx.clearRect(0, 0, cvs.width, cvs.height); raf = null; }
  }
  addEventListener("resize", () => { if (raf) sizeCanvas(); });

  // ============================================================
  //  CERTIFICATE + EXPORT
  // ============================================================
  const QUEST_URL = "https://andreycoderr.github.io/russian-quest-11/";

  function showCertificate() {
    const earned = earnedStars();
    const pct = TOTAL_Q ? Math.round(earned / TOTAL_Q * 100) : 0;
    const rank = rankFor(earned);
    $("#cert-stars").textContent = earned + "/" + TOTAL_Q;
    $("#cert-pct").textContent = pct + "%";
    $("#cert-rank").textContent = rank ? rank.title : "—";
    $("#cert-name").value = progress.settings.name || "";
    $("#cert-date").textContent = "Дата: " + new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
    updateTgLink();
    showView("certificate");
    confetti(1);
  }

  function buildReport() {
    const earned = earnedStars();
    const pct = TOTAL_Q ? Math.round(earned / TOTAL_Q * 100) : 0;
    const rank = rankFor(earned);
    const name = (progress.settings.name || "").trim();
    const lines = ["🏆 Грамота · Русский язык, 11 класс"];
    if (name) lines.push("Ученик: " + name);
    lines.push("Результат: " + earned + "/" + TOTAL_Q + " ⭐ (" + pct + "%)");
    lines.push("Ранг: " + (rank ? rank.title : "—"));
    lines.push("");
    lines.push("По станциям:");
    STATIONS.forEach((s, i) => lines.push((i + 1) + ". " + s.title + " — " + (progress.best[s.id] || 0) + "/" + s.questions.length));
    lines.push("");
    lines.push("Тренажёр «Учительская» · ЕГЭ 2026");
    lines.push(QUEST_URL);
    return lines.join("\n");
  }

  function updateTgLink() {
    const a = $("#cert-tg");
    if (a) a.href = "https://t.me/share/url?url=" + encodeURIComponent(QUEST_URL) + "&text=" + encodeURIComponent(buildReport());
  }

  let toastTimer = null;
  function toast(msg) {
    const t = $("#toast");
    if (!t) return;
    t.textContent = msg; t.hidden = false;
    void t.offsetWidth; t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.classList.remove("show"); setTimeout(() => { t.hidden = true; }, 300); }, 2800);
  }

  function copyReport() {
    const text = buildReport();
    const ok = () => toast("Результат скопирован — вставьте его в чат с репетитором");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(ok).catch(() => fallbackCopy(text, ok));
    } else { fallbackCopy(text, ok); }
  }
  function fallbackCopy(text, cb) {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.focus(); ta.select();
    try { document.execCommand("copy"); cb(); } catch (e) { toast("Не удалось скопировать автоматически"); }
    ta.remove();
  }

  function downloadPNG() {
    const W = 1240, H = 877;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const x = c.getContext("2d");
    const g = x.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#fffdf6"); g.addColorStop(1, "#f1e6cb");
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.strokeStyle = "rgba(150,110,40,.85)"; x.lineWidth = 6; x.strokeRect(28, 28, W - 56, H - 56);
    x.strokeStyle = "rgba(150,110,40,.45)"; x.lineWidth = 2; x.strokeRect(46, 46, W - 92, H - 92);
    x.textAlign = "center";
    x.fillStyle = "#9a6a1f"; x.font = "600 22px Manrope, Inter, sans-serif";
    x.fillText("ПОДГОТОВКА К ОГЭ И ЕГЭ С АРИНОЙ", W / 2, 122);
    x.fillStyle = "#7a4e12"; x.font = "700 94px Lora, Georgia, serif";
    x.fillText("Грамота", W / 2, 232);
    x.fillStyle = "#5c5142"; x.font = "400 30px Inter, sans-serif";
    x.fillText("награждается", W / 2, 300);
    const name = ((progress.settings.name || "").trim()) || "Ученик";
    x.fillStyle = "#2c2415"; x.font = "italic 700 56px Lora, Georgia, serif";
    x.fillText(name, W / 2, 380);
    x.fillStyle = "#5c5142"; x.font = "400 30px Inter, sans-serif";
    x.fillText("за прохождение квеста", W / 2, 446);
    x.fillStyle = "#7a4e12"; x.font = "600 38px Lora, Georgia, serif";
    x.fillText("«Русский язык. 11 класс»", W / 2, 498);
    const earned = earnedStars(), pct = TOTAL_Q ? Math.round(earned / TOTAL_Q * 100) : 0, rank = rankFor(earned);
    const cx = [W / 2 - 320, W / 2, W / 2 + 320];
    const vals = [earned + "/" + TOTAL_Q, pct + "%", rank ? rank.title : "—"];
    const labs = ["ЗВЁЗД", "ВЕРНЫХ", "РАНГ"];
    vals.forEach((v, i) => {
      x.fillStyle = "#7a4e12"; x.font = (i === 2 ? "700 30px" : "700 44px") + " Lora, Georgia, serif";
      x.fillText(v, cx[i], 612);
      x.fillStyle = "#9a7d4a"; x.font = "600 17px Manrope, Inter, sans-serif";
      x.fillText(labs[i], cx[i], 648);
    });
    x.fillStyle = "#7a6a4a"; x.font = "400 24px Inter, sans-serif";
    x.fillText("Дата: " + new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }), W / 2, 742);
    const sg = x.createRadialGradient(W - 200, H - 168, 8, W - 182, H - 150, 58);
    sg.addColorStop(0, "#e8b85c"); sg.addColorStop(1, "#a9701e");
    x.beginPath(); x.arc(W - 182, H - 150, 58, 0, Math.PI * 2); x.fillStyle = sg; x.fill();
    x.fillStyle = "#fff"; x.font = "44px Georgia, serif"; x.fillText("★", W - 182, H - 134);
    c.toBlob(function (blob) {
      if (!blob) { toast("Не удалось создать картинку"); return; }
      const a = document.createElement("a");
      a.download = "gramota-russkiy-10" + (name !== "Ученик" ? "-" + name.replace(/\s+/g, "_") : "") + ".png";
      a.href = URL.createObjectURL(blob);
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1500);
      toast("Грамота сохранена картинкой — отправьте её репетитору");
    }, "image/png");
  }

  // ============================================================
  //  ANALYSIS + RECOMMENDATIONS
  // ============================================================
  function analysisData() {
    const items = STATIONS.map(s => {
      const best = progress.best[s.id] || 0;
      const total = s.questions.length;
      return { s: s, best: best, total: total, pct: total ? best / total : 0 };
    });
    const weak = items.filter(x => x.pct < 1).sort((a, b) => a.pct - b.pct);
    const strong = items.filter(x => x.pct === 1);
    return { items: items, weak: weak, strong: strong };
  }

  function showAnalysis() {
    const d = analysisData();
    const earned = earnedStars();
    const pct = TOTAL_Q ? Math.round(earned / TOTAL_Q * 100) : 0;
    const rank = rankFor(earned);
    $("#analysis-sub").innerHTML =
      `Итог: <b>${earned} из ${TOTAL_Q}</b> ⭐ (${pct}%) · ранг «${rank ? rank.title : "—"}». ` +
      (d.weak.length ? `Тем для повторения: <b>${d.weak.length}</b>.` : "Все темы пройдены идеально!");

    let html = "";
    if (!d.weak.length) {
      html += `<div class="an-card"><p class="an-tip">Блестящий результат — ни одной ошибки! Можно переходить к разбору полных вариантов ЕГЭ и сочинению.</p></div>`;
    } else {
      html += `<h3 class="an-h an-h-weak">На что обратить внимание</h3>`;
      d.weak.forEach(x => {
        const pri = x.pct < 0.7;
        html += `<div class="an-card${pri ? " pri" : ""}" style="--hue:${x.s.hue}">
          <div class="an-top">
            <span class="an-tag">${x.s.tag}</span>
            <span class="an-name">${x.s.title}</span>
            <span class="an-score">${x.best}/${x.total}${pri ? " · приоритет" : ""}</span>
          </div>
          <p class="an-tip">${x.s.tip}</p>
        </div>`;
      });
    }
    if (d.strong.length) {
      html += `<h3 class="an-h an-h-strong">Уже на отлично</h3>
        <div class="an-strong">` +
        d.strong.map(x => `<span class="an-chip" style="--hue:${x.s.hue}">✓ ${x.s.title}</span>`).join("") +
        `</div>`;
    }
    $("#analysis-body").innerHTML = html;
    showView("analysis");
  }

  function buildRecommendations() {
    const d = analysisData();
    const earned = earnedStars();
    const pct = TOTAL_Q ? Math.round(earned / TOTAL_Q * 100) : 0;
    const name = (progress.settings.name || "").trim();
    const L = ["📊 Рекомендации · Русский язык, 11 класс"];
    if (name) L.push("Ученик: " + name);
    L.push("Итог: " + earned + "/" + TOTAL_Q + " ⭐ (" + pct + "%)");
    L.push("");
    if (d.weak.length) {
      L.push("Темы для повторения (от слабых к сильным):");
      d.weak.forEach((x, i) => {
        L.push((i + 1) + ". " + x.s.title + " — " + x.best + "/" + x.total + (x.pct < 0.7 ? " (приоритет)" : ""));
        L.push("   → " + x.s.tip);
      });
    } else {
      L.push("Ошибок нет — все темы пройдены идеально!");
    }
    if (d.strong.length) {
      L.push("");
      L.push("Уже на отлично: " + d.strong.map(x => x.s.title).join(", ") + ".");
    }
    L.push("");
    L.push("Если по каким-то темам остаются сложности — обратитесь к Арине: https://t.me/ArinaGalitskaya");
    L.push("Тренажёр «Учительская» · " + QUEST_URL);
    return L.join("\n");
  }

  function copyRecommendations() {
    const text = buildRecommendations();
    const ok = () => toast("Рекомендации скопированы — можно отправить репетитору");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(ok).catch(() => fallbackCopy(text, ok));
    } else { fallbackCopy(text, ok); }
  }

  // ============================================================
  //  EVENTS (attached once — robust)
  // ============================================================
  $("#next-btn").addEventListener("click", nextQuestion);
  $("#back-btn").addEventListener("click", goMap);
  $("#start-btn").addEventListener("click", () => openStation(firstPlayableIndex()));
  $("#result-next").addEventListener("click", () => openStation(Math.min(lastFinished + 1, STATIONS.length - 1)));
  $("#result-retry").addEventListener("click", () => openStation(lastFinished));
  $("#result-map").addEventListener("click", goMap);
  $("#reset-progress").addEventListener("click", () => {
    if (confirm("Сбросить весь прогресс квеста? Собранные звёзды и открытые станции обнулятся.")) {
      progress = { best: {}, done: {}, settings: { threshold: progress.settings.threshold, name: progress.settings.name, teacher: progress.settings.teacher } };
      saveProgress();
      renderMap();
    }
  });
  $("#teacher-btn").addEventListener("click", handleTeacherClick);

  // threshold selector
  document.querySelectorAll("#set-options button").forEach(b => {
    b.addEventListener("click", () => {
      progress.settings.threshold = parseFloat(b.dataset.th);
      saveProgress();
      renderMap();
    });
  });

  // certificate actions
  $("#cert-name").addEventListener("input", () => {
    progress.settings.name = $("#cert-name").value.slice(0, 40);
    saveProgress();
    updateTgLink();
  });
  $("#cert-copy").addEventListener("click", copyReport);
  $("#cert-png").addEventListener("click", downloadPNG);
  $("#cert-map").addEventListener("click", goMap);
  $("#cert-analysis").addEventListener("click", showAnalysis);
  $("#analysis-copy").addEventListener("click", copyRecommendations);
  $("#analysis-back").addEventListener("click", showCertificate);
  $("#analysis-map").addEventListener("click", goMap);
  document.addEventListener("keydown", (e) => {
    if (views.station.hidden) return;
    if ((e.key === "Enter" || e.key === "ArrowRight") && !$("#next-btn").hidden) {
      e.preventDefault();
      nextQuestion();
    }
  });

  // ---------- init ----------
  const chipQ = $("#chip-q"); if (chipQ) chipQ.textContent = TOTAL_Q;
  renderMap();
  showView("map");
})();
