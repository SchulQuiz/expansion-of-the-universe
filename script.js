// ================= FIREBASE INIT =================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, collection, addDoc, serverTimestamp, updateDoc, doc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getAnalytics, logEvent } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "AIzaSyCxUb8bdp-h4CTr4O3MdPvNPInOJjOi9oU",
  authDomain: "schulquiz-3.firebaseapp.com",
  projectId: "schulquiz-3",
  storageBucket: "schulquiz-3.firebasestorage.app",
  messagingSenderId: "45405696226",
  appId: "1:45405696226:web:84de4d172c75957e892ebb",
  measurementId: "G-D4Y5011FSD"
};

// Init
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);

// Unsichtbar anmelden
await signInAnonymously(auth).catch(console.error);
// =================================================


// ================= QUIZ LOADING (from assets/quiz.txt) =================
const QUIZ_TXT_PATH = "assets/quiz.txt";

/**
 * Parsed runtime quiz state:
 * KEY: { q1: "b", ... }
 * EXPLAIN: { q1: { a:"...", b:"...", ... }, ... }
 * QNAMES: ["q1","q2",...]
 */
let KEY = {};
let EXPLAIN = {};
let QNAMES = [];

// Fallback (falls txt fehlt / Parsing kaputt ist)
const DEFAULT_QUIZ = {
  title: "5. Die Expansion des Universums",
  sub: "7 Fragen, pro Frage ist genau eine Antwort richtig.",
  questions: [
    {
      text: "Was beschreibt die Hubble-Konstante H0 am besten?",
      options: {
        a: "Die Temperatur der kosmischen Hintergrundstrahlung",
        b: "Wie stark die Fluchtgeschwindigkeit mit der Entfernung zunimmt",
        c: "Die Masse einer typischen Galaxie"
      },
      correct: "b",
      explain: {
        a: "Nicht ganz: Das wäre kosmische Hintergrundstrahlung (CMB).",
        b: "Richtig: H0 sagt, wie stark v mit d zunimmt.",
        c: "Nicht ganz: H0 hat nichts mit der Masse einer Galaxie zu tun."
      }
    },
    {
      text: "Welche Beziehung passt zum Hubble-Gesetz?",
      options: {
        a: "\\(v = H_0 \\cdot d\\)",
        b: "\\(d = H_0 \\cdot v^2\\)",
        c: "\\(v = \\frac{d}{H_0^2}\\)"
      },
      correct: "a",
      explain: {
        a: "Richtig: Hubble-Gesetz v = H0 · d.",
        b: "Nicht ganz: v^2 kommt hier nicht vor.",
        c: "Nicht ganz: Das wäre keine lineare Proportionalität."
      }
    },
    {
      text: "Was bedeutet „kein Mittelpunkt der Expansion“ (Luftballon-Modell)?",
      options: {
        a: "Galaxien bewegen sich von einem Explosionszentrum weg",
        b: "Der Raum dehnt sich aus; jeder Punkt sieht andere wegdriften",
        c: "Nur unsere Galaxie bewegt sich, alle anderen stehen still"
      },
      correct: "b",
      explain: {
        a: "Nicht ganz: Es ist keine Explosion von einem Zentrum.",
        b: "Richtig: Der Raum dehnt sich aus, es gibt keinen ausgezeichneten Mittelpunkt.",
        c: "Nicht ganz: Nicht nur wir bewegen uns – Abstände wachsen überall."
      }
    }
  ]
};

async function loadQuizTxt(path = QUIZ_TXT_PATH) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`quiz txt not found: ${path} (${res.status})`);
  return await res.text();
}

/**
 * TXT-Format (einfach erweiterbar):
 *
 * TITLE: 5. Die Expansion des Universums
 * SUB: 7 Fragen, pro Frage ist genau eine Antwort richtig.
 *
 * Q: Was beschreibt die Hubble-Konstante H0 am besten?
 * A: Die Temperatur der kosmischen Hintergrundstrahlung
 * B: Wie stark die Fluchtgeschwindigkeit mit der Entfernung zunimmt
 * C: Die Masse einer typischen Galaxie
 * CORRECT: B
 * EXPLAIN_A: Nicht ganz: ...
 * EXPLAIN_B: Richtig: ...
 * EXPLAIN_C: Nicht ganz: ...
 *
 * Q: Nächste Frage ...
 * ...
 */
function parseQuizTxt(txt) {
  const out = { title: null, sub: null, questions: [] };

  const lines = String(txt || "")
    .replace(/\r\n/g, "\n")
    .split("\n");

  let cur = null;

  function pushCur() {
    if (!cur) return;
    // validate minimal
    const optKeys = Object.keys(cur.options || {});
    if (!cur.text || optKeys.length < 2 || !cur.correct) {
      throw new Error("Invalid question block (missing text/options/correct).");
    }
    if (!cur.options[cur.correct]) {
      throw new Error(`Correct option '${cur.correct}' not found in options.`);
    }
    // default explains if missing
    cur.explain = cur.explain || {};
    for (const k of optKeys) {
      if (!cur.explain[k]) cur.explain[k] = "Danke! Schau dir die Lösung an.";
    }
    out.questions.push(cur);
    cur = null;
  }

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    const mTitle = line.match(/^TITLE\s*:\s*(.+)$/i);
    if (mTitle) { out.title = mTitle[1].trim(); continue; }

    const mSub = line.match(/^SUB\s*:\s*(.+)$/i);
    if (mSub) { out.sub = mSub[1].trim(); continue; }

    const mQ = line.match(/^Q\s*:\s*(.+)$/i);
    if (mQ) {
      pushCur();
      cur = { text: mQ[1].trim(), options: {}, correct: null, explain: {} };
      continue;
    }

    if (!cur) {
      // ignore stray lines before first Q:
      continue;
    }

    const mOpt = line.match(/^([A-Z])\s*:\s*(.+)$/);
    if (mOpt) {
      const key = mOpt[1].toLowerCase();
      cur.options[key] = mOpt[2].trim();
      continue;
    }

    const mCorrect = line.match(/^CORRECT\s*:\s*([A-Z])\s*$/i);
    if (mCorrect) {
      cur.correct = mCorrect[1].toLowerCase();
      continue;
    }

    const mExplain = line.match(/^EXPLAIN_([A-Z])\s*:\s*(.+)$/i);
    if (mExplain) {
      const k = mExplain[1].toLowerCase();
      cur.explain[k] = mExplain[2].trim();
      continue;
    }
  }

  pushCur();

  if (!out.questions.length) throw new Error("No questions found in txt.");
  return out;
}

function setHeroText({ title, sub }) {
  const h1 = document.querySelector(".hero h1");
  const p = document.querySelector(".hero .sub");
  if (h1 && title) h1.textContent = title;
  if (p && sub) p.textContent = sub;
}

function renderQuestions(questions) {
  const container = document.getElementById("questions");
  if (!container) {
    console.warn("Kein #questions-Container in der HTML gefunden – verwende vorhandenes HTML (fallback).");
    return;
  }

  container.innerHTML = "";

  questions.forEach((q, idx) => {
    const qname = `q${idx + 1}`;

    const article = document.createElement("article");
    article.className = "q";
    article.dataset.q = qname;

    const top = document.createElement("div");
    top.className = "q__top";

    const h2 = document.createElement("h2");
    h2.textContent = `${idx + 1}) ${q.text}`;

    const pill = document.createElement("div");
    pill.className = "pill";
    pill.id = `pill-${qname}`;
    pill.textContent = "offen";

    top.appendChild(h2);
    top.appendChild(pill);

    const fieldset = document.createElement("fieldset");
    fieldset.className = "options";
    fieldset.setAttribute("aria-label", `Frage ${idx + 1} Antworten`);

    // stable order: A,B,C,... based on keys
    const optKeys = Object.keys(q.options).sort();
    for (const k of optKeys) {
      const label = document.createElement("label");
      label.className = "opt";

      const input = document.createElement("input");
      input.type = "radio";
      input.name = qname;
      input.value = k;

      const spanLabel = document.createElement("span");
      spanLabel.className = "opt__label";
      spanLabel.textContent = q.options[k];

      const mark = document.createElement("span");
      mark.className = "opt__mark";
      mark.setAttribute("aria-hidden", "true");

      label.appendChild(input);
      label.appendChild(spanLabel);
      label.appendChild(mark);
      fieldset.appendChild(label);
    }

    const fb = document.createElement("div");
    fb.className = "feedback";
    fb.id = `fb-${qname}`;
    fb.setAttribute("aria-live", "polite");

    article.appendChild(top);
    article.appendChild(fieldset);
    article.appendChild(fb);

    container.appendChild(article);
  });
}

function buildRuntimeKeyExplain(questions) {
  const key = {};
  const explain = {};
  questions.forEach((q, idx) => {
    const qname = `q${idx + 1}`;
    key[qname] = q.correct;
    explain[qname] = q.explain || {};
  });
  return { key, explain, qnames: Object.keys(key) };
}

async function initQuizFromTxt() {
  let def = null;

  try {
    const txt = await loadQuizTxt(QUIZ_TXT_PATH);
    def = parseQuizTxt(txt);
  } catch (e) {
    console.warn("Quiz TXT konnte nicht geladen/geparst werden – benutze Fallback.", e);
    def = DEFAULT_QUIZ;
  }

  setHeroText(def);
  renderQuestions(def.questions);

  const runtime = buildRuntimeKeyExplain(def.questions);
  KEY = runtime.key;
  EXPLAIN = runtime.explain;
  QNAMES = runtime.qnames;
}
// ==========================================================================

const quizForm = document.getElementById("quiz");
const gradeBtn = document.getElementById("gradeBtn");
const resetBtn = document.getElementById("resetBtn");
const resultBox = document.getElementById("result");
const progressBar = document.getElementById("progressBar");
const answeredMeta = document.getElementById("answeredMeta");
const timeMeta = document.getElementById("timeMeta");
const startOverlay = document.getElementById("startOverlay");
const startBtn = document.getElementById("startBtn");
// const againBtn = document.getElementById("againBtn");
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
// Quiz laden ohne das ganze Script zu blockieren (damit "Los" immer klickbar bleibt)
initQuizFromTxt()
  .then(() => {
    document.querySelectorAll(".options").forEach(shuffleChildren);
    updateProgress(); // falls Anzahl Fragen aus TXT != 3
  })
  .catch((e) => {
    console.warn("initQuizFromTxt failed (non-blocking):", e);
  });

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

async function resetAll({showOverlay = false, restartTimer = false} = {}){
  quizForm.reset();
  await initQuizFromTxt();
document.querySelectorAll(".options").forEach(shuffleChildren);
  for (const q of QNAMES) clearMarks(q);
  gradedOnce = false;
  hideResult();
  updateProgress();
  // againBtn.hidden = true;

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
function normCode(s){
  return (s || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, "");
}

const ADMIN_CODE = "Schule3";

function updateStartState(){
  const name = normName(nameInput?.value);
  const ok = name.length >= 2;
  startBtn.disabled = !ok;
  if (nameHint) nameHint.textContent = ok ? "Bist du bereit? Dann tippe auf Los" : "Bitte erst Namen eingeben";
}
if (nameInput){
  nameInput.addEventListener("input", updateStartState, { passive: true });
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !startBtn.disabled) startBtn.click();
  });
}
updateStartState();

startBtn.addEventListener("click", async () => {
  const raw = nameInput?.value ?? "";
  const entered = normCode(raw);
  const admin = normCode(ADMIN_CODE);

  if (entered === admin) {
    sessionStorage.setItem("admin_mode", "1");
    sessionStorage.removeItem("attempt_id");
    location.href = "./admin.html";
    return;
  }

  try {
    const ref = await addDoc(collection(db, "attempts"), {
      name,
      startedAt: serverTimestamp(),
      userAgent: navigator.userAgent
    });
    sessionStorage.setItem("attempt_id", ref.id);

    logEvent(analytics, "quiz_start", { name });
    unlockQuiz({ startNow: true });

  } catch (e) {
    console.error("addDoc failed:", e);
  }
});




// --- progress ---
function updateProgress() {
  let answered = 0;
  for (const q of QNAMES) {
    if (quizForm.querySelector(`input[name="${q}"]:checked`)) answered++;
  }
  answeredMeta.textContent = `${answered}/${QNAMES.length} beantwortet`;
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

gradeBtn.addEventListener("click", async () => {
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
    if (!gradedOnce) clearMarks(q);
    if (chosen === KEY[q]) score++;
  }

  for (const q of QNAMES) {
    const chosen = quizForm.querySelector(`input[name="${q}"]:checked`).value;
    markOption(q, chosen);
  }

  gradedOnce = true;
  const usedMs = stopTimer();
  const used = fmt(usedMs);
  // againBtn.hidden = false;

  if (score === QNAMES.length) {
    showResult(`✅ ${score}/${QNAMES.length} richtig – sehr gut!  (Zeit: ${used})`, "ok");
    window.confettiRain?.(1400);
  } else {
    showResult(`➡️ ${score}/${QNAMES.length} richtig. (Zeit: ${used})  Schau dir die markierten Stellen erneut an versuche es nochmal.`, "info");
  }

  // ---- Firestore + Analytics (unsichtbar im Hintergrund) ----
  try {
    const attemptId = sessionStorage.getItem("attempt_id");
    if (attemptId) {
      await updateDoc(doc(db, "attempts", attemptId), {
        score,
        timeMs: usedMs,
        finishedAt: serverTimestamp()
      });
      logEvent(analytics, "quiz_finish", { score, time_ms: usedMs });
    }
  } catch (e) {
    console.error("Firestore update failed:", e);
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
