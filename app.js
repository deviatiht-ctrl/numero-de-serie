/* ===== AI INFLUENCE — Dashboard & Scanner Biyè Haute Sécurité =====
 * 1 000 Billets organisés en 10 Lots (LOT 1 à LOT 10 : AJ9128001 à AJ9129000)
 * Cycle de vie : stock -> sold -> used
 * Scanner caméra : OCR WebAssembly (Tesseract) + BarcodeDetector + Reticle Laser HUD + Audio Feedback
 */

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ---------- Helpers ---------- */
const $ = (sel) => document.querySelector(sel);

let currentUser = null;
let historyCache = [];
let recentCheckinLogs = [];

const STATUS_LABELS = { stock: "En stock", sold: "Vendu", used: "Entré" };

/* Configuration des 10 Lots officiels */
const LOTS = [
  { num: 1, name: "LOT 1", min: 9128001, max: 9128100 },
  { num: 2, name: "LOT 2", min: 9128101, max: 9128200 },
  { num: 3, name: "LOT 3", min: 9128201, max: 9128300 },
  { num: 4, name: "LOT 4", min: 9128301, max: 9128400 },
  { num: 5, name: "LOT 5", min: 9128401, max: 9128500 },
  { num: 6, name: "LOT 6", min: 9128501, max: 9128600 },
  { num: 7, name: "LOT 7", min: 9128601, max: 9128700 },
  { num: 8, name: "LOT 8", min: 9128701, max: 9128800 },
  { num: 9, name: "LOT 9", min: 9128801, max: 9128900 },
  { num: 10, name: "LOT 10", min: 9128901, max: 9129000 },
];

function getLotInfo(serial) {
  if (!serial) return { num: null, name: "—" };
  const match = serial.match(/\d+/);
  if (!match) return { num: null, name: "—" };
  const val = parseInt(match[0], 10);
  const found = LOTS.find((l) => val >= l.min && val <= l.max);
  return found || { num: null, name: "Hors Lot" };
}

function toast(msg, type = "info") {
  const el = $("#toast");
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 3500);
}

function setLoading(btn, on) {
  btn.classList.toggle("loading", on);
  btn.disabled = on;
}

function fmtTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-HT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function esc(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

function statusBadge(status) {
  return `<span class="badge badge-${esc(status)}">${STATUS_LABELS[status] || esc(status)}</span>`;
}

/* ==========================================================================
   SYSTÈME AUDIO & HAPTIQUE (Web Audio API — 100% Hors-Ligne & Fiable)
   ========================================================================== */
let soundEnabled = true;
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) audioCtx = new AudioContextClass();
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

function playSuccessChime() {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const startTime = ctx.currentTime + idx * 0.07;
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.2, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.32);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.32);
    });
    if (navigator.vibrate) navigator.vibrate([100]);
  } catch (e) {
    console.warn("Audio error", e);
  }
}

function playErrorBuzz() {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(160, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(110, ctx.currentTime + 0.35);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
    if (navigator.vibrate) navigator.vibrate([180, 80, 250]);
  } catch (e) {
    console.warn("Audio error", e);
  }
}

function playWarningBeep() {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    [0, 0.14].forEach((delay) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = 440;
      const t = ctx.currentTime + delay;
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.1);
    });
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
  } catch (e) {
    console.warn("Audio error", e);
  }
}

$("#toggle-sound-btn")?.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  $("#sound-icon").textContent = soundEnabled ? "🔊" : "🔇";
  $("#sound-label").textContent = soundEnabled ? "Son Actif" : "Son Coupé";
  toast(soundEnabled ? "Son activé" : "Son désactivé", "info");
});

/* ==========================================================================
   NAVIGATION DES VUES
   ========================================================================== */
function showView(name) {
  $("#login-view").classList.toggle("hidden", name !== "login");
  $("#dash-view").classList.toggle("hidden", name !== "dash");
}

const SECTION_TITLES = {
  "section-stock": "Stock des billets",
  "section-sell": "Vendre un billet",
  "section-checkin": "Scanner de Billets & Contrôle Entrée",
  "section-lots": "Lots des Billets (1 à 10)",
  "section-history": "Historique des billets",
};

document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".section").forEach((s) => s.classList.add("hidden"));
    const secId = btn.dataset.section;
    $("#" + secId).classList.remove("hidden");
    $("#page-title").textContent = SECTION_TITLES[secId];

    if (secId === "section-checkin") {
      startCamera();
      loadCheckinLog();
    } else {
      stopCamera();
    }

    if (secId === "section-lots") loadLotsData();
    if (secId === "section-history") loadHistory();
  });
});

/* ==========================================================================
   AUTHENTIFICATION
   ========================================================================== */
$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#login-btn");
  setLoading(btn, true);
  const { error } = await sb.auth.signInWithPassword({
    email: $("#login-email").value.trim(),
    password: $("#login-password").value,
  });
  setLoading(btn, false);
  if (error) toast("Échec de connexion : " + error.message, "error");
});

$("#logout-btn").addEventListener("click", async () => {
  stopCamera();
  await sb.auth.signOut();
});

sb.auth.onAuthStateChange((_event, session) => {
  currentUser = session?.user ?? null;
  if (currentUser) {
    $("#user-email").textContent = currentUser.email;
    $("#user-avatar").textContent = (currentUser.email[0] || "?").toUpperCase();
    showView("dash");
    initDashboard();
  } else {
    showView("login");
  }
});

/* ==========================================================================
   INITIALISATION DU DASHBOARD
   ========================================================================== */
let dashboardReady = false;
function initDashboard() {
  refreshStats();
  loadRecentStock();
  loadRecentSales();
  loadLotsData();
  if (!dashboardReady) {
    dashboardReady = true;
    $("#today-label").textContent = new Date().toLocaleDateString("fr-HT", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    // Realtime Supabase : mise à jour instantanée si une autre porte scanne un billet
    sb.channel("aif-tickets-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "aif_tickets" }, () => {
        refreshStats();
        loadRecentStock();
        loadRecentSales();
        loadLotsData();
        loadHistory(true);
        loadCheckinLog();
      })
      .subscribe();

    initOcrEngine();
  }
}

/* ==========================================================================
   STATISTIQUES GÉNÉRALES
   ========================================================================== */
async function refreshStats() {
  const { data, error } = await sb.from("aif_tickets").select("status, price");
  if (error) return toast("Erreur stats : " + error.message, "error");

  const stock = data.filter((t) => t.status === "stock").length;
  const sold = data.filter((t) => t.status === "sold" || t.status === "used").length;
  const used = data.filter((t) => t.status === "used").length;
  const revenue = data
    .filter((t) => t.status !== "stock")
    .reduce((sum, t) => sum + (t.price || TICKET_PRICE), 0);

  $("#stat-stock").textContent = stock;
  $("#stat-sold").textContent = sold;
  $("#stat-used").textContent = used;
  $("#stat-revenue").innerHTML = `${revenue.toLocaleString("fr-HT")} <small>HTG</small>`;
}

/* ==========================================================================
   LECTURE D'UN BILLET
   ========================================================================== */
async function findTicket(serial) {
  const { data, error } = await sb
    .from("aif_tickets")
    .select("id, serial_number, lot_number, lot_name, status, seller_email, sold_at, checked_in_by_email, checked_in_at")
    .eq("serial_number", serial)
    .maybeSingle();
  return { ticket: data, error };
}

/* ==========================================================================
   GESTION DU STOCK
   ========================================================================== */
$("#stock-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("#stock-input");
  const serial = input.value.trim().toUpperCase().replace(/\s+/g, "");
  if (!serial) return;

  const lotInfo = getLotInfo(serial);
  const btn = $("#stock-btn");
  setLoading(btn, true);

  const { error } = await sb.from("aif_tickets").insert({
    serial_number: serial,
    lot_number: lotInfo.num || 1,
    lot_name: lotInfo.name || "LOT 1",
    price: TICKET_PRICE,
    added_by: currentUser.id,
    added_by_email: currentUser.email,
  });

  setLoading(btn, false);
  if (error) {
    toast(
      error.code === "23505"
        ? `« ${serial} » existe déjà dans le système.`
        : "Erreur : " + error.message,
      "error"
    );
    input.select();
    return;
  }

  toast(`« ${serial} » (${lotInfo.name}) ajouté au stock.`, "success");
  input.value = "";
  input.focus();
});

$("#view-sql-info-btn")?.addEventListener("click", (e) => {
  e.preventDefault();
  alert(
    "Pour importer les 10 lots complets (1 000 billets de AJ9128001 à AJ9129000), " +
    "exécutez simplement le script 'insert_lots.sql' ou 'schema.sql' dans l'éditeur SQL de Supabase. " +
    "L'insertion prend moins de 2 secondes !"
  );
});

async function loadRecentStock() {
  const { data, error } = await sb
    .from("aif_tickets")
    .select("serial_number, lot_name, status, added_by_email, created_at")
    .order("created_at", { ascending: false })
    .limit(12);

  const body = $("#stock-body");
  if (error) {
    body.innerHTML = `<tr><td colspan="5" class="empty">Erreur : ${esc(error.message)}</td></tr>`;
    return;
  }
  if (!data.length) {
    body.innerHTML = `<tr><td colspan="5" class="empty">Aucun billet en stock.</td></tr>`;
    return;
  }
  body.innerHTML = data
    .map(
      (t) => `<tr>
        <td class="serial">${esc(t.serial_number)}</td>
        <td><strong>${esc(t.lot_name || "—")}</strong></td>
        <td>${statusBadge(t.status)}</td>
        <td>${esc(t.added_by_email)}</td>
        <td>${fmtTime(t.created_at)}</td>
      </tr>`
    )
    .join("");
}
$("#refresh-stock").addEventListener("click", () => {
  loadRecentStock();
  refreshStats();
});

/* ==========================================================================
   VENTES : STOCK -> SOLD
   ========================================================================== */
$("#sell-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("#sell-input");
  const serial = input.value.trim().toUpperCase().replace(/\s+/g, "");
  if (!serial) return;

  const btn = $("#sell-btn");
  const box = $("#sell-result");
  setLoading(btn, true);
  box.classList.add("hidden");

  const { ticket, error } = await findTicket(serial);

  if (error) {
    setLoading(btn, false);
    toast("Erreur : " + error.message, "error");
    return;
  }

  if (!ticket) {
    showResult(
      box,
      "invalid",
      "NUMÉRO INTROUVABLE",
      `« ${serial} » n'est pas dans le stock. Vérifiez le numéro sur le billet papier.`
    );
    setLoading(btn, false);
    input.select();
    playErrorBuzz();
    return;
  }
  if (ticket.status === "sold") {
    showResult(
      box,
      "warning",
      "DÉJÀ VENDU",
      `« ${serial} » a déjà été vendu par ${ticket.seller_email} le ${fmtTime(ticket.sold_at)}.`
    );
    setLoading(btn, false);
    input.select();
    playWarningBeep();
    return;
  }
  if (ticket.status === "used") {
    showResult(
      box,
      "invalid",
      "DÉJÀ UTILISÉ",
      `« ${serial} » a déjà servi à entrer le ${fmtTime(ticket.checked_in_at)}.`
    );
    setLoading(btn, false);
    input.select();
    playErrorBuzz();
    return;
  }

  // Mise à jour protégée : uniquement si le statut est encore 'stock'
  const { data: updated, error: updErr } = await sb
    .from("aif_tickets")
    .update({
      status: "sold",
      seller_id: currentUser.id,
      seller_email: currentUser.email,
      sold_at: new Date().toISOString(),
    })
    .eq("serial_number", serial)
    .eq("status", "stock")
    .select();

  setLoading(btn, false);

  if (updErr) {
    toast("Erreur : " + updErr.message, "error");
    return;
  }
  if (!updated.length) {
    showResult(
      box,
      "warning",
      "DÉJÀ VENDU",
      "Un autre membre vient de vendre ce billet à l'instant."
    );
    input.select();
    playWarningBeep();
    return;
  }

  playSuccessChime();
  showResult(
    box,
    "valid",
    `VENTE ENREGISTRÉE — ${serial}`,
    `Encaissez les ${TICKET_PRICE} HTG. Billet assigné à ${currentUser.email} (${ticket.lot_name || "LOT"}).`
  );
  toast(`Billet ${serial} vendu — ${TICKET_PRICE} HTG`, "success");
  input.value = "";
  input.focus();
});

async function loadRecentSales() {
  const { data, error } = await sb
    .from("aif_tickets")
    .select("serial_number, lot_name, seller_email, sold_at")
    .in("status", ["sold", "used"])
    .order("sold_at", { ascending: false })
    .limit(12);

  const body = $("#sales-body");
  if (error) {
    body.innerHTML = `<tr><td colspan="4" class="empty">Erreur : ${esc(error.message)}</td></tr>`;
    return;
  }
  if (!data.length) {
    body.innerHTML = `<tr><td colspan="4" class="empty">Aucune vente pour le moment.</td></tr>`;
    return;
  }
  body.innerHTML = data
    .map(
      (t) => `<tr>
        <td class="serial">${esc(t.serial_number)}</td>
        <td><strong>${esc(t.lot_name || "—")}</strong></td>
        <td>${esc(t.seller_email)}</td>
        <td>${fmtTime(t.sold_at)}</td>
      </tr>`
    )
    .join("");
}
$("#refresh-sales").addEventListener("click", () => {
  loadRecentSales();
  refreshStats();
});

/* ==========================================================================
   CONTRÔLE ATOMIQUE HAUTE SÉCURITÉ À L'ENTRÉE (GATE CHECK-IN)
   ========================================================================== */
async function validateTicketGate(serial) {
  const cleanSerial = serial.trim().toUpperCase().replace(/\s+/g, "");

  // 1) Tentative via la RPC PostgreSQL atomique (verrouillage FOR UPDATE)
  try {
    const { data: rpcRes, error: rpcErr } = await sb.rpc("aif_validate_ticket_scan", {
      p_serial: cleanSerial,
      p_user_id: currentUser.id,
      p_user_email: currentUser.email,
    });
    if (!rpcErr && rpcRes) {
      return rpcRes;
    }
  } catch (e) {
    console.warn("RPC non disponible, fallback direct Supabase client", e);
  }

  // 2) Fallback direct si la RPC n'a pas encore été créée dans Supabase
  const { ticket, error } = await findTicket(cleanSerial);
  if (error) {
    return { success: false, code: "DB_ERROR", verdict: "ERREUR RÉSEAU", message: error.message };
  }

  if (!ticket) {
    return {
      success: false,
      code: "FAUX_BILLET",
      verdict: "FAUX BILLET",
      message: `« ${cleanSerial} » pa egziste nan lis 1 000 tikè ofisyèl yo (AJ9128001 - AJ9129000). Biyè sa a pa soti nan sistèm nan.`,
      serial_number: cleanSerial,
    };
  }

  if (ticket.status === "stock") {
    return {
      success: false,
      code: "JAMAIS_VENDU",
      verdict: "BILLET JAMAIS VENDU",
      message: `« ${cleanSerial} » se yon vrè nimewo papye (${ticket.lot_name}), men li poko janm peye oswa anrejistre kòm vann!`,
      ticket,
    };
  }

  if (ticket.status === "used") {
    return {
      success: false,
      code: "DEJA_UTILISE",
      verdict: "BILLET DÉJÀ ENTRÉ",
      message: `« ${cleanSerial} » te deja itilize pou antre le ${fmtTime(ticket.checked_in_at)} (valide pa ${ticket.checked_in_by_email || "yon ajan"}). Atansyon : Fòk ou tcheke si se pa yon fotokopi.`,
      ticket,
    };
  }

  // Passage atomique de sold -> used
  const { data: updated, error: updErr } = await sb
    .from("aif_tickets")
    .update({
      status: "used",
      checked_in_by: currentUser.id,
      checked_in_by_email: currentUser.email,
      checked_in_at: new Date().toISOString(),
    })
    .eq("serial_number", cleanSerial)
    .eq("status", "sold")
    .select();

  if (updErr || !updated?.length) {
    return {
      success: false,
      code: "DEJA_UTILISE",
      verdict: "BILLET DÉJÀ ENTRÉ",
      message: "Yon lòt pòt fèk valide biyè sa a nan menm segonn nan!",
      ticket,
    };
  }

  return {
    success: true,
    code: "ENTREE_AUTORISEE",
    verdict: "ENTRÉE AUTORISÉE",
    message: `Biyè Valab ! Aksè otorize pou ${cleanSerial} (${ticket.lot_name}). Vande pa ${ticket.seller_email} le ${fmtTime(ticket.sold_at)}.`,
    ticket: updated[0],
  };
}

/* Affichage du Verdict avec Animation, Audio et Métadonnées */
function showResult(box, cls, verdict, detail, ticket = null) {
  box.className = `verify-result ${cls}`;
  let metaHtml = "";
  if (ticket) {
    metaHtml = `
      <div class="verify-meta">
        <span><strong>Lot :</strong> ${esc(ticket.lot_name || "LOT")}</span>
        ${ticket.seller_email ? `<span><strong>Vendeur :</strong> ${esc(ticket.seller_email)}</span>` : ""}
        ${ticket.checked_in_at ? `<span><strong>Entré :</strong> ${fmtTime(ticket.checked_in_at)}</span>` : ""}
      </div>`;
  }
  box.innerHTML = `
    <span class="verdict">${verdict}</span>
    <span class="detail">${detail}</span>
    ${metaHtml}`;
  box.classList.remove("hidden");
}

/* Traitement d'un numéro scanné ou saisi manuellement */
let lastScannedSerial = null;
let lastScanTime = 0;
let isScanProcessing = false;

async function handleScannedTicket(serial) {
  const clean = (serial || "").toUpperCase().replace(/\s+/g, "");
  const now = Date.now();

  // Éviter de re-scanner le même billet plusieurs fois d'affilée en boucle rapide
  if (clean === lastScannedSerial && now - lastScanTime < 2800) {
    return;
  }
  if (isScanProcessing) return;

  isScanProcessing = true;
  lastScannedSerial = clean;
  lastScanTime = now;

  $("#det-text").textContent = `Validasyon ${clean}...`;
  const box = $("#checkin-result");

  const res = await validateTicketGate(clean);
  isScanProcessing = false;

  if (res.success) {
    playSuccessChime();
    showResult(box, "valid", `✅ ${res.verdict}`, res.message, res.ticket);
    toast(`Accès autorisé : ${clean}`, "success");
    addCheckinLogRow(clean, res.ticket?.lot_name || "LOT", currentUser.email, new Date().toISOString(), "used");
  } else if (res.code === "DEJA_UTILISE") {
    playErrorBuzz();
    showResult(box, "invalid", `⛔ ${res.verdict}`, res.message, res.ticket);
  } else if (res.code === "JAMAIS_VENDU") {
    playWarningBeep();
    showResult(box, "warning", `⚠️ ${res.verdict}`, res.message, res.ticket);
  } else {
    playErrorBuzz();
    showResult(box, "invalid", `❌ ${res.verdict || "FAUX BILLET"}`, res.message);
  }

  $("#det-text").textContent = `Dènye: ${clean} (${res.code})`;
  refreshStats();
}

/* Saisie manuelle de secours */
$("#checkin-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("#checkin-input");
  const serial = input.value.trim();
  if (!serial) return;
  const btn = $("#checkin-btn");
  setLoading(btn, true);
  await handleScannedTicket(serial);
  setLoading(btn, false);
  input.value = "";
});

/* ==========================================================================
   SCANNER CAMÉRA AVANCÉ (OCR Tesseract.js + BarcodeDetector)
   ========================================================================== */
let mediaStream = null;
let isCameraActive = false;
let currentFacingMode = "environment"; // Caméra arrière sur smartphone par défaut
let videoTrack = null;
let torchActive = false;
let ocrWorker = null;
let isOcrBusy = false;
let scanInterval = null;
let barcodeDetector = null;

if ("BarcodeDetector" in window) {
  try {
    barcodeDetector = new BarcodeDetector({
      formats: ["code_128", "code_39", "qr_code", "ean_13", "upc_a"],
    });
  } catch (e) {
    console.warn("BarcodeDetector error", e);
  }
}

async function initOcrEngine() {
  if (ocrWorker) return;
  if (!window.Tesseract) return;
  try {
    $("#det-text").textContent = "Chargement du moteur OCR...";
    const worker = await Tesseract.createWorker("eng", 1, {
      workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js",
      corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core.wasm.js",
    });
    await worker.setParameters({
      tessedit_char_whitelist: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-:",
      tessedit_pageseg_mode: "7", // Traite l'image comme une seule ligne de texte
    });
    ocrWorker = worker;
    $("#det-text").textContent = "OCR pare pou lekti";
  } catch (err) {
    console.warn("Init OCR warning :", err);
    $("#det-text").textContent = "Mòd Kòd-Bar Pare";
  }
}

async function startCamera() {
  if (isCameraActive) return;
  const video = $("#scanner-video");
  const overlay = $("#camera-off-overlay");

  try {
    const constraints = {
      video: {
        facingMode: { ideal: currentFacingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    };
    mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = mediaStream;
    await video.play();

    videoTrack = mediaStream.getVideoTracks()[0];
    isCameraActive = true;
    overlay.classList.add("hidden");
    $("#cam-toggle-text").textContent = "Kanpe Kamera";

    // Vérifier support du Flash/Torch
    const capabilities = videoTrack.getCapabilities ? videoTrack.getCapabilities() : {};
    if (capabilities.torch) {
      $("#torch-toggle-btn").classList.remove("hidden");
    }

    startScanningLoop();
    $("#det-text").textContent = "Kamera ap gade...";
  } catch (err) {
    console.error("Camera access error:", err);
    toast("Aksè kamera refize oswa endisponib : " + err.message, "error");
    overlay.classList.remove("hidden");
    isCameraActive = false;
  }
}

function stopCamera() {
  if (scanInterval) {
    clearInterval(scanInterval);
    scanInterval = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }
  isCameraActive = false;
  videoTrack = null;
  torchActive = false;
  $("#camera-off-overlay").classList.remove("hidden");
  $("#cam-toggle-text").textContent = "Limen Kamera";
}

$("#start-cam-btn")?.addEventListener("click", startCamera);
$("#cam-toggle-btn")?.addEventListener("click", () => {
  if (isCameraActive) stopCamera();
  else startCamera();
});

$("#cam-switch-btn")?.addEventListener("click", async () => {
  currentFacingMode = currentFacingMode === "environment" ? "user" : "environment";
  stopCamera();
  await startCamera();
  toast("Kamera chanje", "info");
});

$("#torch-toggle-btn")?.addEventListener("click", async () => {
  if (!videoTrack) return;
  try {
    torchActive = !torchActive;
    await videoTrack.applyConstraints({ advanced: [{ torch: torchActive }] });
    $("#torch-toggle-btn").textContent = torchActive ? "⚡ Eten Flash" : "⚡ Flash";
  } catch (e) {
    console.warn("Torch non supportée", e);
  }
});

/* Loop d'analyse de la caméra (Region of Interest - ROI) */
function startScanningLoop() {
  if (scanInterval) clearInterval(scanInterval);
  // Scan toutes les 450ms
  scanInterval = setInterval(async () => {
    if (!isCameraActive || isScanProcessing) return;
    await processCameraFrame();
  }, 450);
}

/* Capture & prétraitement de l'image dans le cadre HUD */
async function processCameraFrame() {
  const video = $("#scanner-video");
  if (!video || video.readyState < 2) return;

  const canvas = $("#scanner-canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return;

  // Calcul du cadre de ciblage (HUD)
  // Le cadre fait 70% de la largeur et 35% de la hauteur au centre
  const cropW = Math.round(vw * 0.75);
  const cropH = Math.round(vh * 0.38);
  const cropX = Math.round((vw - cropW) / 2);
  const cropY = Math.round((vh - cropH) / 2);

  canvas.width = cropW;
  canvas.height = cropH;

  // Dessin du rectangle de ciblage
  ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  // 1) Vérification rapide par BarcodeDetector (si le billet contient un code-barres / QR)
  if (barcodeDetector) {
    try {
      const barcodes = await barcodeDetector.detect(canvas);
      if (barcodes && barcodes.length > 0) {
        const rawVal = barcodes[0].rawValue;
        const match = rawVal.match(/AJ\s*912[89]\d{4}/i) || rawVal.match(/AJ\s*\d{7}/i);
        if (match) {
          const serialClean = match[0].toUpperCase().replace(/\s+/g, "");
          handleScannedTicket(serialClean);
          return;
        }
      }
    } catch (e) {
      // Ignorer l'erreur silencieusement et passer à l'OCR
    }
  }

  // 2) Binarisation pour améliorer la netteté du texte OCR
  // Rend le fond blanc pur et l'encre noire pour que l'OCR lise parfaitement même avec reflet
  const imgData = ctx.getImageData(0, 0, cropW, cropH);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const val = gray > 135 ? 255 : 0;
    d[i] = val;
    d[i + 1] = val;
    d[i + 2] = val;
  }
  ctx.putImageData(imgData, 0, 0);

  // 3) Analyse OCR via Tesseract.js
  if (ocrWorker && !isOcrBusy) {
    isOcrBusy = true;
    try {
      const { data } = await ocrWorker.recognize(canvas);
      const text = (data.text || "").toUpperCase();

      // Motif exact : AJ9128001 à AJ9129000
      const serialMatch = text.match(/AJ\s*9\s*1\s*2\s*[89]\s*\d\s*\d\s*\d/i) || text.match(/AJ\s*\d{7}/i);

      if (serialMatch) {
        const cleanSerial = serialMatch[0].replace(/\s+/g, "");
        handleScannedTicket(cleanSerial);
      }
    } catch (err) {
      console.warn("OCR recognize err:", err);
    } finally {
      isOcrBusy = false;
    }
  }
}

$("#force-scan-btn")?.addEventListener("click", async () => {
  $("#det-text").textContent = "Analiz an kour...";
  await processCameraFrame();
});

/* ==========================================================================
   JOURNAL DES DERNIERS CONTRÔLES À LA PORTE
   ========================================================================== */
function addCheckinLogRow(serial, lotName, email, time, status) {
  recentCheckinLogs.unshift({ serial, lotName, email, time, status });
  if (recentCheckinLogs.length > 10) recentCheckinLogs.pop();
  renderCheckinLogs();
}

async function loadCheckinLog() {
  const { data, error } = await sb
    .from("aif_tickets")
    .select("serial_number, lot_name, checked_in_by_email, checked_in_at, status")
    .eq("status", "used")
    .order("checked_in_at", { ascending: false })
    .limit(10);

  if (error || !data) return;
  recentCheckinLogs = data.map((t) => ({
    serial: t.serial_number,
    lotName: t.lot_name || "LOT",
    email: t.checked_in_by_email,
    time: t.checked_in_at,
    status: t.status,
  }));
  renderCheckinLogs();
}

function renderCheckinLogs() {
  const body = $("#checkin-log-body");
  if (!body) return;
  if (!recentCheckinLogs.length) {
    body.innerHTML = `<tr><td colspan="5" class="empty">Aucun contrôle récent.</td></tr>`;
    return;
  }
  body.innerHTML = recentCheckinLogs
    .map(
      (r) => `<tr>
        <td class="serial">${esc(r.serial)}</td>
        <td><strong>${esc(r.lotName || "—")}</strong></td>
        <td>${esc(r.email || "—")}</td>
        <td>${fmtTime(r.time)}</td>
        <td>${statusBadge(r.status)}</td>
      </tr>`
    )
    .join("");
}
$("#refresh-checkin-log")?.addEventListener("click", loadCheckinLog);

/* ==========================================================================
   GESTION DES LOTS (LOT 1 À LOT 10 : AJ9128001 à AJ9129000)
   ========================================================================== */
async function loadLotsData() {
  const container = $("#lots-container");
  if (!container) return;

  const { data, error } = await sb
    .from("aif_tickets")
    .select("serial_number, lot_number, lot_name, status");

  if (error) {
    container.innerHTML = `<p class="muted">Erreur chargement lots : ${esc(error.message)}</p>`;
    return;
  }

  // Calcul des statistiques pour chaque Lot
  const lotsStats = LOTS.map((lot) => {
    const lotTickets = data.filter((t) => {
      if (t.lot_number === lot.num) return true;
      const numMatch = (t.serial_number || "").match(/\d+/);
      if (numMatch) {
        const val = parseInt(numMatch[0], 10);
        return val >= lot.min && val <= lot.max;
      }
      return false;
    });

    const total = lotTickets.length || 100;
    const stock = lotTickets.filter((t) => t.status === "stock").length;
    const sold = lotTickets.filter((t) => t.status === "sold").length;
    const used = lotTickets.filter((t) => t.status === "used").length;

    return {
      ...lot,
      total,
      stock,
      sold,
      used,
      pctUsed: ((used / (total || 1)) * 100).toFixed(0),
      pctSold: ((sold / (total || 1)) * 100).toFixed(0),
      pctStock: ((stock / (total || 1)) * 100).toFixed(0),
    };
  });

  container.innerHTML = lotsStats
    .map(
      (l) => `
      <div class="lot-card" data-lot="${l.num}">
        <div class="lot-card-head">
          <span class="lot-title">${esc(l.name)}</span>
          <span class="lot-range">AJ${l.min} - AJ${l.max}</span>
        </div>
        <div class="lot-stats-row">
          <span>Stock : <strong>${l.stock}</strong></span>
          <span>Vendus : <strong>${l.sold}</strong></span>
          <span>Entrés : <strong>${l.used}</strong></span>
        </div>
        <div class="lot-progress" title="Entrés: ${l.pctUsed}%, Vendus: ${l.pctSold}%, Stock: ${l.pctStock}%">
          <div class="progress-bar-used" style="width: ${l.pctUsed}%"></div>
          <div class="progress-bar-sold" style="width: ${l.pctSold}%"></div>
          <div class="progress-bar-stock" style="width: ${l.pctStock}%"></div>
        </div>
      </div>`
    )
    .join("");

  // Clic sur une carte de Lot -> redirige vers l'Historique filtré sur ce Lot
  container.querySelectorAll(".lot-card").forEach((card) => {
    card.addEventListener("click", () => {
      const lotNum = card.dataset.lot;
      const navHist = document.querySelector('[data-section="section-history"]');
      if (navHist) navHist.click();
      const filterSelect = $("#history-lot-filter");
      if (filterSelect) {
        filterSelect.value = lotNum;
        renderHistory();
      }
    });
  });
}

/* ==========================================================================
   HISTORIQUE COMPLET AVEC FILTRES PAR LOT & RECHERCHE
   ========================================================================== */
async function loadHistory(silent = false) {
  const { data, error } = await sb
    .from("aif_tickets")
    .select("id, serial_number, lot_number, lot_name, status, added_by, seller_email, sold_at, checked_in_at, created_at")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) {
    if (!silent) toast("Erreur historique : " + error.message, "error");
    return;
  }
  historyCache = data;
  renderHistory();
}

function renderHistory() {
  const q = ($("#history-search")?.value || "").trim().toLowerCase();
  const statusFilter = $("#history-filter")?.value;
  const lotFilter = $("#history-lot-filter")?.value;

  const rows = historyCache.filter((t) => {
    const matchStatus = !statusFilter || t.status === statusFilter;
    const matchLot =
      !lotFilter ||
      String(t.lot_number) === String(lotFilter) ||
      (t.lot_name && t.lot_name.includes(`LOT ${lotFilter}`));
    const matchSearch =
      !q ||
      t.serial_number.toLowerCase().includes(q) ||
      (t.seller_email || "").toLowerCase().includes(q) ||
      (t.lot_name || "").toLowerCase().includes(q);
    return matchStatus && matchLot && matchSearch;
  });

  const body = $("#history-body");
  if (!body) return;
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="7" class="empty">Aucun résultat trouvé.</td></tr>`;
    return;
  }

  body.innerHTML = rows
    .map((t) => {
      const canDelete = currentUser && t.status === "stock" && t.added_by === currentUser.id;
      return `<tr>
        <td class="serial">${esc(t.serial_number)}</td>
        <td><strong>${esc(t.lot_name || "—")}</strong></td>
        <td>${statusBadge(t.status)}</td>
        <td>${esc(t.seller_email) || "—"}</td>
        <td>${fmtTime(t.sold_at)}</td>
        <td>${fmtTime(t.checked_in_at)}</td>
        <td>${
          canDelete
            ? `<button class="delete-btn" data-id="${t.id}" title="Supprimer">
                 <svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
               </button>`
            : ""
        }</td>
      </tr>`;
    })
    .join("");
}

$("#history-search")?.addEventListener("input", renderHistory);
$("#history-filter")?.addEventListener("change", renderHistory);
$("#history-lot-filter")?.addEventListener("change", renderHistory);
$("#refresh-history")?.addEventListener("click", () => loadHistory());

$("#history-body")?.addEventListener("click", async (e) => {
  const btn = e.target.closest(".delete-btn");
  if (!btn) return;
  if (!confirm("Voulez-vous vraiment supprimer ce numéro de série ?")) return;
  const { error } = await sb.from("aif_tickets").delete().eq("id", btn.dataset.id);
  if (error) return toast("Erreur : " + error.message, "error");
  toast("Numéro supprimé.", "info");
});
