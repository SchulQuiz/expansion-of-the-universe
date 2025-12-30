// --- Quiz config (genau deine 3 Fragen, Antworten: b, a, b) ---
const KEY = { q1: "b", q2: "a", q3: "b" };
const EXPLAIN = {
  q1: {
    a: "Nicht ganz: Das wäre kosmische Hintergrundstrahlung (CMB).",
    b: "Richtig: H0 sagt, wie stark v mit d zunimmt.",
    c: "Nicht ganz: H0 hat nichts mit der Masse einer Galaxie zu tun."
  },
  q2: {
    a: "Richtig: Hubble-Gesetz v = H0 · d.",
    b: "Nicht ganz: v^2 kommt hier nicht vor.",
    c: "Nicht ganz: Das wäre keine lineare Proportionalität."
  },
  q3: {
    a: "Nicht ganz: Es ist keine Explosion von einem Zentrum.",
    b: "Richtig: Der Raum dehnt sich aus, es gibt keinen ausgezeichneten Mittelpunkt.",
    c: "Nicht ganz: Nicht nur wir bewegen uns – Abstände wachsen überall."
  }
};

const quizForm = document.getElementById("quiz");
const gradeBtn = document.getElementById("gradeBtn");
const resetBtn = document.getElementById("resetBtn");
const resultBox = document.getElementById("result");
const progressBar = document.getElementById("progressBar");
const answeredMeta = document.getElementById("answeredMeta");
const timeMeta = document.getElementById("timeMeta");
const startOverlay = document.getElementById("startOverlay");
const startBtn = document.getElementById("startBtn");
const againBtn = document.getElementById("againBtn");
const nameInput = document.getElementById("nameInput");
const nameHint = document.getElementById("nameHint");

// --- shuffle answer options (per question) ---
function shuffleChildren(parent) {
  const kids = Array.from(parent.children);
  for (let i = kids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [kids[i], kids[j]] = [kids[j], kids[i]];
  }
  kids.forEach(k => parent.appendChild(k));
}
document.querySelectorAll(".options").forEach(shuffleChildren);


const QNAMES = Object.keys(KEY);
let gradedOnce = false;

// --- Start/Lock + Timer ---
let hasStartedOnce = false;
let timerRAF = null;
let timerStart = 0;
let elapsedMs = 0;
let timerRunning = false;

function fmt(ms){
  const s = Math.floor(ms / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function tickTimer(){
  if (!timerRunning) return;
  const ms = Date.now() - timerStart;
  timeMeta.textContent = fmt(ms);
  timerRAF = requestAnimationFrame(tickTimer);
}

function startTimer(){
  elapsedMs = 0;
  timerStart = Date.now();
  timerRunning = true;
  timeMeta.textContent = "00:00";
  if (timerRAF) cancelAnimationFrame(timerRAF);
  timerRAF = requestAnimationFrame(tickTimer);
}

function stopTimer(){
  if (!timerRunning) return elapsedMs;
  elapsedMs = Date.now() - timerStart;
  timerRunning = false;
  if (timerRAF) cancelAnimationFrame(timerRAF);
  timerRAF = null;
  timeMeta.textContent = fmt(elapsedMs);
  return elapsedMs;
}

function unlockQuiz({startNow}){
  document.body.classList.remove("is-locked");
  startOverlay.hidden = true;
  if (startNow) startTimer();
}

function resetAll({showOverlay = false, restartTimer = false} = {}){
  quizForm.reset();
  document.querySelectorAll(".options").forEach(shuffleChildren);
  for (const q of QNAMES) clearMarks(q);
  gradedOnce = false;
  hideResult();
  updateProgress();
  againBtn.hidden = true;

  stopTimer();
  timeMeta.textContent = "00:00";

  if (showOverlay) {
    document.body.classList.add("is-locked");
    startOverlay.hidden = false;
  }
  if (restartTimer) {
    startTimer();
  }
}

// Initial state: locked until "Los"
timeMeta.textContent = "00:00";
startOverlay.hidden = false;
document.body.classList.add("is-locked");

// Los ist erst aktiv, wenn Name vorhanden
function normName(s){
  return (s || "").trim().replace(/\s+/g, " ");
}
function updateStartState(){
  const name = normName(nameInput?.value);
  const ok = name.length >= 2;
  startBtn.disabled = !ok;
  if (nameHint) nameHint.textContent = ok ? "Alles klar – du kannst starten." : "Bitte Name eingeben, dann ist „Los“ aktiv.";
}
if (nameInput){
  nameInput.addEventListener("input", updateStartState, { passive: true });
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !startBtn.disabled) startBtn.click();
  });
}
updateStartState();

startBtn.addEventListener("click", () => {
  const name = normName(nameInput?.value);
  if (!name || name.length < 2) return; // safety
  sessionStorage.setItem("quiz_name", name);

  hasStartedOnce = true;
  unlockQuiz({ startNow: true });
});


// --- progress ---
function updateProgress() {
  let answered = 0;
  for (const q of QNAMES) {
    if (quizForm.querySelector(`input[name="${q}"]:checked`)) answered++;
  }
  answeredMeta.textContent = `${answered}/3 beantwortet`;
  progressBar.style.width = `${(answered / QNAMES.length) * 100}%`;
}
quizForm.addEventListener("change", updateProgress);
updateProgress();

// --- grading helpers ---
function setPill(q, state) {
  const pill = document.getElementById(`pill-${q}`);
  pill.classList.remove("ok", "bad");
  if (state === "ok") { pill.classList.add("ok"); pill.textContent = "richtig"; }
  else if (state === "bad") { pill.classList.add("bad"); pill.textContent = "falsch"; }
  else { pill.textContent = "offen"; }
}

function clearMarks(q) {
  const opts = quizForm.querySelectorAll(`[data-q="${q}"] .opt`);
  opts.forEach(o => o.classList.remove("correct", "wrong"));
  const fb = document.getElementById(`fb-${q}`);
  fb.textContent = "";
  setPill(q, "open");
}

function markOption(q, chosenVal) {
  const correctVal = KEY[q];
  const block = quizForm.querySelector(`[data-q="${q}"]`);
  const opts = block.querySelectorAll(".opt");
  opts.forEach(label => {
    const input = label.querySelector("input");
    if (!input) return;
    if (input.value === correctVal) label.classList.add("correct");
    if (chosenVal && input.value === chosenVal && chosenVal !== correctVal) label.classList.add("wrong");
  });

  const fb = document.getElementById(`fb-${q}`);
  fb.textContent = EXPLAIN[q][chosenVal] ?? "Bitte wähle eine Antwort.";
  setPill(q, chosenVal === correctVal ? "ok" : "bad");
}

function shake(el) {
  el.animate(
    [{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(6px)" }, { transform: "translateX(0)" }],
    { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)" }
  );
}

gradeBtn.addEventListener("click", () => {
  // verify all answered
  let allAnswered = true;
  for (const q of QNAMES) {
    const chosen = quizForm.querySelector(`input[name="${q}"]:checked`);
    if (!chosen) {
      allAnswered = false;
      const block = quizForm.querySelector(`[data-q="${q}"]`);
      shake(block);
      setPill(q, "bad");
      document.getElementById(`fb-${q}`).textContent = "Bitte eine Antwort auswählen.";
    }
  }
  if (!allAnswered) {
    showResult("⚠️ Beantworte erst alle Fragen, dann auf „Auswerten“ klicken.", "warn");
    return;
  }

  // grade
  let score = 0;
  for (const q of QNAMES) {
    const chosen = quizForm.querySelector(`input[name="${q}"]:checked`).value;
    if (!gradedOnce) clearMarks(q); // first time cleanup
    if (chosen === KEY[q]) score++;
  }

  for (const q of QNAMES) {
    const chosen = quizForm.querySelector(`input[name="${q}"]:checked`).value;
    markOption(q, chosen);
  }

  gradedOnce = true;
  const usedMs = stopTimer();
  const used = fmt(usedMs);
  againBtn.hidden = false;

  if (score === QNAMES.length) {
    showResult(`✅ ${score}/3 richtig – sehr gut!  (Zeit: ${used})`, "ok");
    // confettiBurst();
    confettiRain(1400);
  } else {
    showResult(`➡️ ${score}/3 richtig. (Zeit: ${used})  Schau dir die markierten Stellen erneut an versuche es nochmal.`, "info");
  }
});

resetBtn.addEventListener("click", () => {
  // „Zurücksetzen“: alles löschen + Timer stoppen (Overlay kommt NICHT wieder)
  resetAll({ showOverlay: false, restartTimer: true });
});

// againBtn.addEventListener("click", () => {
//   // „Nochmal“: alles resetten + Timer direkt neu starten (Overlay bleibt weg)
//   resetAll({ showOverlay: false, restartTimer: true });
// });

// againBtn.addEventListener("click", () => {
//   // „Nochmal“: alles zurücksetzen + Timer sofort neu starten (ohne Overlay)
//   resetAll({ showOverlay: false, restartTimer: true });
// });

function showResult(text, tone) {
  resultBox.textContent = text;
  resultBox.classList.add("show");
  // slight tone tweak via border color
  if (tone === "ok") {
    resultBox.style.borderColor = "rgba(34,197,94,.45)";
    resultBox.style.background = "rgba(34,197,94,.10)";
  } else if (tone === "warn") {
    resultBox.style.borderColor = "rgba(239,68,68,.45)";
    resultBox.style.background = "rgba(239,68,68,.10)";
  } else {
    resultBox.style.borderColor = "rgba(255,255,255,.14)";
    resultBox.style.background = "rgba(0,0,0,.14)";
  }
  resultBox.animate([{ transform: "translateY(6px)", opacity: 0 }, { transform: "translateY(0)", opacity: 1 }],
    { duration: 280, easing: "cubic-bezier(.2,.8,.2,1)" });
}

function hideResult() {
  resultBox.classList.remove("show");
  resultBox.textContent = "";
}

// // --- Tiny confetti (no libraries) ---
// const canvas = document.getElementById("confetti");
// const ctx = canvas.getContext("2d");
// let confetti = [];
// let confettiRAF = null;

// function resizeCanvas() {
//   canvas.width = window.innerWidth * devicePixelRatio;
//   canvas.height = window.innerHeight * devicePixelRatio;
//   ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
// }
// window.addEventListener("resize", resizeCanvas);
// resizeCanvas();

// function confettiBurst() {
//   const w = window.innerWidth, h = window.innerHeight;
//   const originX = w / 2, originY = Math.min(220, h * 0.25);

//   confetti = [];
//   const count = 120;
//   for (let i = 0; i < count; i++) {
//     const angle = (Math.random() * Math.PI) - (Math.PI / 2);
//     const speed = 6 + Math.random() * 6;
//     confetti.push({
//       x: originX,
//       y: originY,
//       vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 2,
//       vy: Math.sin(angle) * speed - Math.random() * 4,
//       g: 0.16 + Math.random() * 0.06,
//       r: 2 + Math.random() * 3,
//       a: 1,
//       rot: Math.random() * Math.PI,
//       vr: (Math.random() - 0.5) * 0.2,
//       hue: 220 + Math.random() * 140
//     });
//   }
//   if (confettiRAF) cancelAnimationFrame(confettiRAF);
//   tickConfetti();
// }

// function tickConfetti() {
//   ctx.clearRect(0, 0, canvas.width, canvas.height);
//   let alive = 0;

//   for (const p of confetti) {
//     p.vy += p.g;
//     p.x += p.vx;
//     p.y += p.vy;
//     p.rot += p.vr;
//     p.a *= 0.992;

//     if (p.y < window.innerHeight + 80 && p.a > 0.05) alive++;

//     ctx.save();
//     ctx.globalAlpha = Math.max(0, Math.min(1, p.a));
//     ctx.translate(p.x, p.y);
//     ctx.rotate(p.rot);
//     ctx.fillStyle = `hsl(${p.hue} 90% 60%)`;
//     ctx.fillRect(-p.r, -p.r, p.r * 2.2, p.r * 1.4);
//     ctx.restore();
//   }

//   if (alive > 0) confettiRAF = requestAnimationFrame(tickConfetti);
//   else ctx.clearRect(0, 0, canvas.width, canvas.height);
// }

function hexToHsl(hex) {
  hex = hex.replace('#', '');
  const r = parseInt(hex.substring(0,2),16)/255;
  const g = parseInt(hex.substring(2,4),16)/255;
  const b = parseInt(hex.substring(4,6),16)/255;

  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

const BASE_COLORS = [
  hexToHsl("#6d4bff"),
  hexToHsl("#00d0ff"),
  hexToHsl("#22c55e")
];

function randomBrandColor() {
  const base = BASE_COLORS[(Math.random() * BASE_COLORS.length) | 0];
  const hueJitter = (Math.random() - 0.5) * 20; // ±10°
  return {
    h: (base.h + hueJitter + 360) % 360,
    s: base.s,
    l: base.l
  };
}

const canvas = document.getElementById("confetti");
const ctx = canvas.getContext("2d", { alpha: true });

let confetti = [];
let confettiRAF = null;

function resizeCanvas() {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.width  = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

window.addEventListener("resize", resizeCanvas, { passive: true });
resizeCanvas();

function spawnRainPiece(x) {
  const c = randomBrandColor();

  return {
    x,
    y: -20 - Math.random() * 80,
    vx: (Math.random() - 0.5) * 1.2,
    vy: 2.5 + Math.random() * 3.5,
    g: 0.03 + Math.random() * 0.05,
    r: 2 + Math.random() * 3.5,
    a: 0.9,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.25,
    h: c.h,
    s: c.s,
    l: c.l
  };
}

// öffentlich nutzbar
window.confettiRain = function (durationMs = 1200) {
  const start = performance.now();
  const w = window.innerWidth;

  const isMobile = window.matchMedia("(max-width: 600px)").matches;
  const ratePerFrame = isMobile ? 6 : 10;

  confetti = [];
  if (confettiRAF) cancelAnimationFrame(confettiRAF);

  function tick(now) {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    if (now - start < durationMs) {
      for (let i = 0; i < ratePerFrame; i++) {
        confetti.push(spawnRainPiece(Math.random() * w));
      }
    }

    let alive = 0;
    for (const p of confetti) {
      p.vy += p.g;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;

      if (p.y > window.innerHeight * 0.6) p.a *= 0.992;
      if (p.y < window.innerHeight + 80 && p.a > 0.05) alive++;

      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.a));
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = `hsl(${p.h} ${p.s}% ${p.l}%)`;
      ctx.fillRect(-p.r, -p.r, p.r * 2.2, p.r * 1.4);
      ctx.restore();
    }

    if (alive > 0 || now - start < durationMs) {
      confettiRAF = requestAnimationFrame(tick);
    } else {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }
  }

  confettiRAF = requestAnimationFrame(tick);
};
