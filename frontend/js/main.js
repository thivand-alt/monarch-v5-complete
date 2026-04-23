const cfg = window.MONARCH_CONFIG || {};
const supabaseClient = (cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase)
  ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
  : null;

const el = (id) => document.getElementById(id);
const showNotice = (node, message, type = "success") => {
  if (!node) return;
  node.className = `notice ${type}`;
  node.textContent = message;
  node.classList.remove("hide");
};

function initAudioControl() {
  const audio = el("backgroundMusic");
  const btn = el("soundToggle");
  if (!audio || !btn) return;
  
  const isMuted = localStorage.getItem("monarch_audio_muted") === "true";
  audio.volume = 0.5; // Volume augmenté à 50%
  
  if (!isMuted) {
    audio.play().catch(() => {
      // Autoplay peut être bloqué, on ignore
      console.log("Autoplay audio bloqué par navigateur");
    });
    btn.classList.remove("muted");
  } else {
    btn.classList.add("muted");
    btn.textContent = "🔇";
  }
  
  btn.addEventListener("click", () => {
    if (audio.paused) {
      audio.play().catch(() => {});
      btn.classList.remove("muted");
      btn.textContent = "🔊";
      localStorage.setItem("monarch_audio_muted", "false");
    } else {
      audio.pause();
      btn.classList.add("muted");
      btn.textContent = "🔇";
      localStorage.setItem("monarch_audio_muted", "true");
    }
  });
}

function maybeShowCookieBanner() {
  const choice = localStorage.getItem("monarch_cookie_choice");
  if (!choice && el("cookieBanner")) el("cookieBanner").classList.remove("hide");
}

function populateSelects() {
  const daysSelect = document.querySelector('select[name="days"]');
  if (daysSelect) for (let i=1;i<=30;i++) daysSelect.innerHTML += `<option value="${i}">${i} jour${i>1?'s':''}</option>`;
  const stopsSelect = document.querySelector('select[name="stops_per_day"]');
  if (stopsSelect) for (let i=1;i<=10;i++) stopsSelect.innerHTML += `<option value="${i}">${i}</option>`;
  const peopleSelect = document.querySelector('select[name="people_per_car"]');
  if (peopleSelect) for (let i=1;i<=9;i++) peopleSelect.innerHTML += `<option value="${i}">${i}</option>`;
}

async function uploadIfProvided(bucket, file) {
  if (!supabaseClient || !file) return null;
  const filePath = `${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
  const { error } = await supabaseClient.storage.from(bucket).upload(filePath, file, { upsert: true });
  if (error) throw error;
  const { data } = supabaseClient.storage.from(bucket).getPublicUrl(filePath);
  return data.publicUrl;
}

async function callEdge(fnName, body) {
  const res = await fetch(`${cfg.EDGE_BASE_URL}/${fnName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {})
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${fnName}`);
  return data;
}

async function registerUser() {
  const form = el("registerForm");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!supabaseClient) return showNotice(el("registerResult"), "Supabase non configuré.", "error");
    const fd = new FormData(form);
    const { error } = await supabaseClient.auth.signUp({
      email: fd.get("email"),
      password: fd.get("password"),
      options: { data: { full_name: fd.get("full_name") } }
    });
    if (error) return showNotice(el("registerResult"), error.message, "error");
    showNotice(el("registerResult"), "Compte créé. Vérifie éventuellement ton email de confirmation.");
  });
}

async function loginUser() {
  const form = el("loginForm");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!supabaseClient) return showNotice(el("loginResult"), "Supabase non configuré.", "error");
    const fd = new FormData(form);
    const { error } = await supabaseClient.auth.signInWithPassword({
      email: fd.get("email"),
      password: fd.get("password")
    });
    if (error) return showNotice(el("loginResult"), error.message, "error");
    showNotice(el("loginResult"), "Connexion réussie.");
  });
}

async function loadPartners() {
  const list = el("partnerList");
  if (!list) return;
  if (!supabaseClient) {
    list.innerHTML = `<div class="partner-card"><strong>Mode configuration</strong><p class="muted">Branche Supabase pour afficher les partenaires réels.</p></div>`;
    return;
  }
  const { data, error } = await supabaseClient
    .from("partners")
    .select("*")
    .eq("status", "approved")
    .order("created_at", { ascending: false });
  if (error) {
    list.innerHTML = `<div class="notice error">${error.message}</div>`;
    return;
  }
  list.innerHTML = data.map(p => `
    <div class="partner-card">
      ${p.logo_url ? `<img class="poster" src="${p.logo_url}" alt="${p.company_name}" />` : ""}
      <h3>${p.company_name}</h3>
      <p>${p.description || ""}</p>
      <div class="inline-actions">
        ${p.website_url ? `<a class="btn primary" target="_blank" rel="noreferrer" href="${p.website_url}">Visiter le site</a>` : ""}
        <span class="badge">${p.status}</span>
      </div>
    </div>
  `).join("") || `<div class="notice warning">Aucun partenaire publié.</div>`;
}

function partnerRegistration() {
  const form = el("partnerRegisterForm");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const resultNode = el("partnerRegisterResult");
    try {
      const fd = new FormData(form);
      let logoUrl = null;
      const file = fd.get("logo_file");
      if (file && file.size) logoUrl = await uploadIfProvided("partner-logos", file);
      const payload = {
        company_name: fd.get("company_name"),
        contact_name: fd.get("contact_name"),
        email: fd.get("email"),
        phone: fd.get("phone"),
        website_url: fd.get("website_url"),
        description: fd.get("description"),
        logo_url: logoUrl,
        success_url: `${location.origin}${location.pathname.replace(/\/[^/]*$/, '')}/partners.html?partner=success`,
        cancel_url: location.href
      };
      const data = await callEdge("create-partner-checkout", payload);
      showNotice(resultNode, "Session Stripe créée. Redirection…");
      if (data.checkout_url) location.href = data.checkout_url;
    } catch (err) {
      showNotice(resultNode, err.message, "error");
    }
  });
}

function eventSubmission() {
  const form = el("eventSubmitForm");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const resultNode = el("eventSubmitResult");
    try {
      const fd = new FormData(form);
      let posterUrl = null;
      const file = fd.get("poster_file");
      if (file && file.size) posterUrl = await uploadIfProvided("event-posters", file);
      const payload = {
        title: fd.get("title"),
        country: fd.get("country"),
        department: fd.get("department"),
        venue_name: fd.get("venue_name"),
        address: fd.get("address"),
        event_date: fd.get("event_date"),
        phone: fd.get("phone"),
        contact_email: fd.get("contact_email"),
        description: fd.get("description"),
        poster_url: posterUrl,
        success_url: `${location.origin}${location.pathname.replace(/\/[^/]*$/, '')}/events.html?submission=success`,
        cancel_url: location.href
      };
      const data = await callEdge("create-event-checkout", payload);
      showNotice(resultNode, "Paiement en préparation. Redirection…");
      if (data.checkout_url) location.href = data.checkout_url;
    } catch (err) {
      showNotice(resultNode, err.message, "error");
    }
  });
}

function eventSearch() {
  const form = el("eventSearchForm");
  const results = el("eventsResults");
  if (!form || !results) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    results.innerHTML = `<div class="notice">Recherche en cours…</div>`;
    const fd = new FormData(form);
    try {
      const data = await callEdge("ai-events-search", {
        country: fd.get("country"),
        department: fd.get("department")
      });
      const items = data.events || [];
      results.innerHTML = items.map(ev => {
        const isSearchLink = ev.venue_name && ["Google Search", "Google News", "Facebook Events", "Instagram", "TikTok"].includes(ev.venue_name);
        return `
        <div class="event-card" ${isSearchLink ? 'style="border-left: 4px solid var(--gold); background: rgba(218,165,32,0.05);"' : ''}>
          ${ev.poster_url ? `<img class="poster" src="${ev.poster_url}" alt="${ev.title}" />` : ""}
          <h3>${ev.title}</h3>
          <p>${ev.summary || ""}</p>
          ${!isSearchLink ? `
            <p><strong>Lieu:</strong> ${ev.venue_name || "-"} <a href="roadtrip.html?destination=${encodeURIComponent(ev.address || ev.venue_name || '')}">→ planifier</a></p>
            <p><strong>Département / Région:</strong> ${ev.department || "-"}</p>
            <p><strong>Adresse:</strong> ${ev.address || "-"}</p>
            <p><strong>Téléphone:</strong> ${ev.phone || "-"}</p>
            <p><strong>Email:</strong> ${ev.contact_email || "-"}</p>
          ` : ''}
          <div class="inline-actions">
            ${ev.source_url ? `<a class="btn ${isSearchLink ? 'primary' : 'secondary'}" target="_blank" rel="noreferrer" href="${ev.source_url}">${isSearchLink ? 'Rechercher' : 'Source'}</a>` : ""}
            ${ev.google_maps_url && !isSearchLink ? `<a class="btn primary" target="_blank" rel="noreferrer" href="${ev.google_maps_url}">Google Maps</a>` : ""}
          </div>
        </div>
      `;
      }).join("") || `<div class="notice warning">Aucun événement trouvé.</div>`;
    } catch (err) {
      results.innerHTML = `<div class="notice error">${err.message}</div>`;
    }
  });
}

function roadtripPlanner() {
  const form = el("roadtripForm");
  if (!form) return;
  const summary = el("roadtripSummary");
  const stopsNode = el("roadtripStops");
  const googleBtn = el("openGoogleRouteBtn");
  const wazeBtn = el("openWazeBtn");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    summary.textContent = "Génération du roadbook…";
    stopsNode.innerHTML = "";
    try {
      const fd = new FormData(form);
      const payload = Object.fromEntries(fd.entries());
      const data = await callEdge("ai-roadtrip-plan", payload);
      summary.textContent = data.summary || "Roadbook généré.";
      const stops = data.stops || [];
      stopsNode.innerHTML = stops.map((s, i) => `
        <div class="roadbook-stop">
          <h3>Étape ${i+1} — ${s.name}</h3>
          <p><strong>Type:</strong> ${s.type}</p>
          <p><strong>Adresse:</strong> ${s.address || "-"}</p>
          <p><strong>Pourquoi:</strong> ${s.reason || "-"}</p>
          <p><strong>Note:</strong> ${s.rating || "-"}</p>
        </div>
      `).join("");
      if (googleBtn && data.google_maps_url) googleBtn.onclick = () => window.open(data.google_maps_url, "_blank");
      if (wazeBtn && data.waze_url) wazeBtn.onclick = () => window.open(data.waze_url, "_blank");
    } catch (err) {
      summary.textContent = err.message;
    }
  });

  const params = new URLSearchParams(location.search);
  const destination = params.get("destination");
  if (destination) {
    const prefs = form.querySelector('textarea[name="preferences"]');
    if (prefs) prefs.value = `Destination suggérée depuis un événement: ${destination}`;
  }
}

function contactIntake() {
  const form = el("contactForm");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData(form);
      await callEdge("contact-intake", Object.fromEntries(fd.entries()));
      showNotice(el("contactResult"), "Message enregistré.");
      form.reset();
    } catch (err) {
      showNotice(el("contactResult"), err.message, "error");
    }
  });
}

async function loadAdmin() {
  if (!el("adminKpis")) return;
  try {
    const data = await callEdge("admin-dashboard", {});
    el("kpiPartners").textContent = data.kpis.partners;
    el("kpiEvents").textContent = data.kpis.events;
    el("kpiContacts").textContent = data.kpis.contacts;
    el("kpiRevenue").textContent = data.kpis.revenue;
    el("adminPartners").innerHTML = (data.pendingPartners || []).map(item => adminCard(item, "partner")).join("") || `<div class="notice warning">Aucun partenaire en attente.</div>`;
    el("adminEvents").innerHTML = (data.pendingEvents || []).map(item => adminCard(item, "event")).join("") || `<div class="notice warning">Aucun événement en attente.</div>`;
    el("auditLog").innerHTML = (data.audit || []).map(a => `<div class="event-card"><strong>${a.action}</strong><p>${a.target_type} #${a.target_id || ""}</p><small>${a.created_at}</small></div>`).join("") || `<div class="notice">Pas d’entrée.</div>`;
    bindAdminActions();
  } catch (err) {
    el("adminPartners").innerHTML = `<div class="notice error">${err.message}</div>`;
  }
}

function adminCard(item, type) {
  return `
    <div class="event-card">
      <h4>${item.title || item.company_name}</h4>
      <p>${item.description || ""}</p>
      <p><span class="badge">${item.status}</span></p>
      <div class="inline-actions">
        <button class="btn primary" data-type="${type}" data-id="${item.id}" data-status="approved">Approuver</button>
        <button class="btn danger" data-type="${type}" data-id="${item.id}" data-status="rejected">Refuser</button>
      </div>
    </div>
  `;
}

function bindAdminActions() {
  document.querySelectorAll("[data-status]").forEach(btn => {
    btn.addEventListener("click", async () => {
      try {
        await callEdge("admin-update-status", {
          target_type: btn.dataset.type,
          id: btn.dataset.id,
          status: btn.dataset.status
        });
        loadAdmin();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initAudioControl();
  maybeShowCookieBanner();
  populateSelects();
  registerUser();
  loginUser();
  loadPartners();
  partnerRegistration();
  eventSubmission();
  eventSearch();
  roadtripPlanner();
  contactIntake();
  loadAdmin();
});
