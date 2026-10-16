/* ===== AI INFLUENCE — Tableau de bord des billets =====
 * Cycle de vie d'un billet : stock -> sold -> used
 *   stock : numéro de série imprimé, enregistré dans le système
 *   sold  : l'acheteur a payé ses 10 HTG
 *   used  : billet contrôlé et accepté à l'entrée (une seule fois)
 */

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ---------- Helpers ---------- */
const $ = (sel) => document.querySelector(sel);

let currentUser = null;
let historyCache = [];

const STATUS_LABELS = { stock: "En stock", sold: "Vendu", used: "Entré" };

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
    day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit",
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

/* ---------- Vues ---------- */
function showView(name) {
  $("#login-view").classList.toggle("hidden", name !== "login");
  $("#dash-view").classList.toggle("hidden", name !== "dash");
}

const SECTION_TITLES = {
  "section-stock": "Stock des billets",
  "section-sell": "Vendre un billet",
  "section-checkin": "Contrôle à l'entrée",
  "section-history": "Historique des billets",
};

document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".section").forEach((s) => s.classList.add("hidden"));
    $("#" + btn.dataset.section).classList.remove("hidden");
    $("#page-title").textContent = SECTION_TITLES[btn.dataset.section];
    if (btn.dataset.section === "section-history") loadHistory();
  });
});

/* ---------- Authentification ---------- */
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

/* ---------- Initialisation du dashboard ---------- */
let dashboardReady = false;
function initDashboard() {
  refreshStats();
  loadRecentStock();
  loadRecentSales();
  if (!dashboardReady) {
    dashboardReady = true;
    $("#today-label").textContent = new Date().toLocaleDateString("fr-HT", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    });
    // Temps réel : quand un autre membre agit, le dashboard se met à jour
    sb.channel("aif-tickets-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "aif_tickets" }, () => {
        refreshStats();
        loadRecentStock();
        loadRecentSales();
        loadHistory(true);
      })
      .subscribe();
    $("#stock-input").focus();
  }
}

/* ---------- Statistiques ---------- */
async function refreshStats() {
  const { data, error } = await sb
    .from("aif_tickets")
    .select("status, price");
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

/* ---------- Lecture d'un billet ---------- */
async function findTicket(serial) {
  const { data, error } = await sb
    .from("aif_tickets")
    .select("id, serial_number, status, seller_email, sold_at, checked_in_by_email, checked_in_at")
    .eq("serial_number", serial)
    .maybeSingle();
  return { ticket: data, error };
}

/* ---------- STOCK : ajouter un numéro ---------- */
$("#stock-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("#stock-input");
  const serial = input.value.trim().toUpperCase();
  if (!serial) return;

  const btn = $("#stock-btn");
  setLoading(btn, true);

  const { error } = await sb.from("aif_tickets").insert({
    serial_number: serial,
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

  toast(`« ${serial} » ajouté au stock.`, "success");
  input.value = "";
  input.focus();
});

async function loadRecentStock() {
  const { data, error } = await sb
    .from("aif_tickets")
    .select("serial_number, status, added_by_email, created_at")
    .order("created_at", { ascending: false })
    .limit(12);

  const body = $("#stock-body");
  if (error) {
    body.innerHTML = `<tr><td colspan="4" class="empty">Erreur : ${esc(error.message)}</td></tr>`;
    return;
  }
  if (!data.length) {
    body.innerHTML = `<tr><td colspan="4" class="empty">Aucun billet en stock.</td></tr>`;
    return;
  }
  body.innerHTML = data
    .map(
      (t) => `<tr>
        <td class="serial">${esc(t.serial_number)}</td>
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

/* ---------- VENDRE : stock -> sold ---------- */
$("#sell-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("#sell-input");
  const serial = input.value.trim().toUpperCase();
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
    showResult(box, "invalid",
      "NUMÉRO INTROUVABLE",
      `« ${serial} » n'est pas dans le stock. Vérifiez le numéro sur le billet papier.`);
    setLoading(btn, false);
    input.select();
    return;
  }
  if (ticket.status === "sold") {
    showResult(box, "warning",
      "DÉJÀ VENDU",
      `« ${serial} » a déjà été vendu par ${ticket.seller_email} le ${fmtTime(ticket.sold_at)}.`);
    setLoading(btn, false);
    input.select();
    return;
  }
  if (ticket.status === "used") {
    showResult(box, "invalid",
      "DÉJÀ UTILISÉ",
      `« ${serial} » a déjà servi à entrer le ${fmtTime(ticket.checked_in_at)}.`);
    setLoading(btn, false);
    input.select();
    return;
  }

  // Mise à jour protégée : seulement si le billet est encore "stock"
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
    showResult(box, "warning", "DÉJÀ VENDU",
      "Un autre membre vient de vendre ce billet à l'instant.");
    input.select();
    return;
  }

  showResult(box, "valid",
    `VENTE ENREGISTRÉE — ${serial}`,
    `Encaissez les ${TICKET_PRICE} HTG. Vendeur : ${currentUser.email}`);
  toast(`Billet ${serial} vendu — ${TICKET_PRICE} HTG`, "success");
  input.value = "";
  input.focus();
});

async function loadRecentSales() {
  const { data, error } = await sb
    .from("aif_tickets")
    .select("serial_number, seller_email, sold_at")
    .in("status", ["sold", "used"])
    .order("sold_at", { ascending: false })
    .limit(12);

  const body = $("#sales-body");
  if (error) {
    body.innerHTML = `<tr><td colspan="3" class="empty">Erreur : ${esc(error.message)}</td></tr>`;
    return;
  }
  if (!data.length) {
    body.innerHTML = `<tr><td colspan="3" class="empty">Aucune vente pour le moment.</td></tr>`;
    return;
  }
  body.innerHTML = data
    .map(
      (t) => `<tr>
        <td class="serial">${esc(t.serial_number)}</td>
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

/* ---------- ENTRÉE : sold -> used ---------- */
$("#checkin-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("#checkin-input");
  const serial = input.value.trim().toUpperCase();
  if (!serial) return;

  const btn = $("#checkin-btn");
  const box = $("#checkin-result");
  setLoading(btn, true);
  box.classList.add("hidden");

  const { ticket, error } = await findTicket(serial);

  if (error) {
    setLoading(btn, false);
    toast("Erreur : " + error.message, "error");
    return;
  }

  if (!ticket) {
    showResult(box, "invalid",
      "FAUX BILLET",
      `« ${serial} » n'existe pas dans le système. Ce billet ne vient pas de nous.`);
    setLoading(btn, false);
    input.select();
    return;
  }
  if (ticket.status === "stock") {
    showResult(box, "warning",
      "BILLET JAMAIS VENDU",
      `« ${serial} » est un vrai numéro, mais ce billet n'a jamais été payé. À vérifier avec l'équipe.`);
    setLoading(btn, false);
    input.select();
    return;
  }
  if (ticket.status === "used") {
    showResult(box, "invalid",
      "DÉJÀ ENTRÉ",
      `« ${serial} » a déjà servi à entrer le ${fmtTime(ticket.checked_in_at)} (contrôlé par ${ticket.checked_in_by_email}). Possible photocopie.`);
    setLoading(btn, false);
    input.select();
    return;
  }

  // Mise à jour protégée : seulement si le billet est encore "sold"
  const { data: updated, error: updErr } = await sb
    .from("aif_tickets")
    .update({
      status: "used",
      checked_in_by: currentUser.id,
      checked_in_by_email: currentUser.email,
      checked_in_at: new Date().toISOString(),
    })
    .eq("serial_number", serial)
    .eq("status", "sold")
    .select();

  setLoading(btn, false);

  if (updErr) {
    toast("Erreur : " + updErr.message, "error");
    return;
  }
  if (!updated.length) {
    showResult(box, "invalid", "DÉJÀ ENTRÉ",
      "Quelqu'un vient de faire entrer ce billet à l'instant. Possible photocopie.");
    input.select();
    return;
  }

  showResult(box, "valid",
    `ENTRÉE AUTORISÉE — ${serial}`,
    `Billet vendu par ${ticket.seller_email} le ${fmtTime(ticket.sold_at)}.`);
  toast(`Entrée validée : ${serial}`, "success");
  input.value = "";
  input.focus();
});

function showResult(box, cls, verdict, detail) {
  box.className = `verify-result ${cls}`;
  box.innerHTML = `
    <span class="verdict">${verdict}</span>
    <span class="detail">${detail}</span>`;
}

/* ---------- HISTORIQUE ---------- */
async function loadHistory(silent = false) {
  const { data, error } = await sb
    .from("aif_tickets")
    .select("id, serial_number, status, added_by, seller_email, sold_at, checked_in_at, created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    if (!silent) toast("Erreur : " + error.message, "error");
    return;
  }
  historyCache = data;
  renderHistory();
}

function renderHistory() {
  const q = $("#history-search").value.trim().toLowerCase();
  const statusFilter = $("#history-filter").value;
  const rows = historyCache.filter(
    (t) =>
      (!statusFilter || t.status === statusFilter) &&
      (t.serial_number.toLowerCase().includes(q) ||
        (t.seller_email || "").toLowerCase().includes(q))
  );
  const body = $("#history-body");
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="6" class="empty">Aucun résultat.</td></tr>`;
    return;
  }
  body.innerHTML = rows
    .map((t) => {
      const canDelete =
        currentUser && t.status === "stock" && t.added_by === currentUser.id;
      return `<tr>
        <td class="serial">${esc(t.serial_number)}</td>
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

$("#history-search").addEventListener("input", renderHistory);
$("#history-filter").addEventListener("change", renderHistory);
$("#refresh-history").addEventListener("click", () => loadHistory());

$("#history-body").addEventListener("click", async (e) => {
  const btn = e.target.closest(".delete-btn");
  if (!btn) return;
  if (!confirm("Voulez-vous vraiment supprimer ce numéro de série ?")) return;
  const { error } = await sb.from("aif_tickets").delete().eq("id", btn.dataset.id);
  if (error) return toast("Erreur : " + error.message, "error");
  toast("Numéro supprimé.", "info");
});
