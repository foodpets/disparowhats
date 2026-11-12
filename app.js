/* ============================================================
 * Disparo WhatsApp — API oficial (WhatsApp Business Cloud API)
 * 100% cliente: o navegador fala direto com graph.facebook.com
 * ============================================================ */
"use strict";

const $ = (id) => document.getElementById(id);

const GRAPH_BASE = "https://graph.facebook.com";
const LS_KEY = "disparowhats_settings_v1";

let running = false;      // controle do lote
let results = [];         // [{numero, status, detalhe}]
let lastImageUpload = { fileName: null, mediaId: null }; // cache do upload

/* ---------------- Utilidades ---------------- */

function sleepInterruptible(ms) {
  return new Promise((resolve) => {
    let elapsed = 0;
    const step = 200;
    const timer = setInterval(() => {
      elapsed += step;
      if (!running || elapsed >= ms) {
        clearInterval(timer);
        resolve();
      }
    }, step);
  });
}

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function cleanNumber(raw, fix55) {
  let n = String(raw || "").replace(/\D/g, "");
  if (!n) return null;
  if (fix55 && !n.startsWith("55") && (n.length === 10 || n.length === 11)) {
    n = "55" + n;
  }
  return n;
}

function parseNumbers(text, fix55) {
  const seen = new Set();
  const out = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    const n = cleanNumber(line.trim(), fix55);
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

/* ---------------- Configuração / localStorage ---------------- */

function fieldIds() {
  return ["phoneId", "apiVersion", "msgType", "imageSource", "imageUrl",
    "caption", "textBody", "previewUrl", "tplName", "tplLang", "tplVars",
    "numbers", "fix55", "delay", "remember"];
}

function saveSettings() {
  const data = { token: "" };
  for (const id of fieldIds()) {
    const el = $(id);
    if (!el) continue;
    data[id] = el.type === "checkbox" ? el.checked : el.value;
  }
  if ($("remember").checked) data.token = $("token").value.trim();
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch { /* localStorage indisponível */ }
}

function loadSettings() {
  let data;
  try {
    data = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
  } catch { return; }
  for (const id of fieldIds()) {
    const el = $(id);
    if (el && id in data) {
      if (el.type === "checkbox") el.checked = !!data[id];
      else el.value = data[id];
    }
  }
}

function clearSaved() {
  try { localStorage.removeItem(LS_KEY); } catch { /* noop */ }
  $("connStatus").textContent = "";
  $("connStatus").className = "status-line";
  location.reload();
}

/* ---------------- Chamadas à Graph API ---------------- */

async function graph(path, options = {}) {
  const version = ($("apiVersion").value || "v23.0").trim().replace(/^\/+/, "");
  const token = $("token").value.trim();
  const headers = Object.assign(
    { Authorization: `Bearer ${token}` },
    options.headers || {}
  );
  try {
    const res = await fetch(`${GRAPH_BASE}/${version}/${path}`, { ...options, headers });
    let data = {};
    try { data = await res.json(); } catch { /* resposta sem corpo */ }
    return { ok: res.ok && !data.error, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: { error: { message: `Falha de rede/CORS: ${err.message}` } } };
  }
}

function credentialsMissing() {
  if (!$("phoneId").value.trim()) return "Informe o Phone Number ID.";
  if (!$("token").value.trim()) return "Informe o token de acesso da Cloud API.";
  return null;
}

async function testConnection() {
  const missing = credentialsMissing();
  const st = $("connStatus");
  if (missing) {
    st.textContent = "⚠️ " + missing;
    st.className = "status-line err";
    return;
  }
  st.textContent = "⏳ Testando…";
  st.className = "status-line";
  const { ok, data } = await graph(
    `${$("phoneId").value.trim()}?fields=verified_name,display_phone_number,quality_rating`
  );
  if (ok) {
    st.textContent = `✅ Conectado: ${data.verified_name || "?"} (${data.display_phone_number || "?"})`;
    st.className = "status-line ok";
    saveSettings();
  } else {
    st.textContent = `❌ ${describeError(data)}`;
    st.className = "status-line err";
  }
}

function describeError(data) {
  const e = data && data.error;
  if (!e) return "Erro desconhecido.";
  const extras = [];
  if (e.code === 131047 || e.code === 131026) {
    extras.push("Número fora da janela de 24h → use a opção “Template aprovado” para primeiro contato.");
  }
  if (e.code === 190) extras.push("Token inválido ou expirado.");
  if (e.code === 131030) extras.push("Modo de teste: o destinatário precisa estar na lista de números permitidos (Meta → seu app → WhatsApp → API Setup → campo 'Para' → gerenciar lista de até 5 números).");
  if (e.code === 130429 || e.code === 131048) extras.push("Limite de taxa atingido — aumente o intervalo entre envios.");
  return `${e.message || "erro"}${e.code ? ` (código ${e.code})` : ""}${extras.length ? " — " + extras.join(" ") : ""}`;
}

/* ---------------- Upload de mídia ---------------- */

async function uploadImageIfNeeded() {
  const source = $("imageSource").value;
  if (source !== "upload") return null;

  const file = $("imageFile").files[0];
  if (!file) throw new Error("Escolha um arquivo de imagem (ou mude a origem para “URL pública”).");

  if (lastImageUpload.mediaId && lastImageUpload.fileName === file.name) {
    return lastImageUpload.mediaId; // reaproveita o upload do lote anterior
  }

  const fd = new FormData();
  fd.append("file", file, file.name);
  fd.append("type", file.type || "image/jpeg");
  fd.append("messaging_product", "whatsapp");

  const { ok, data } = await graph(`${$("phoneId").value.trim()}/media`, {
    method: "POST",
    body: fd,
  });
  if (!ok || !data.id) {
    throw new Error("Falha no upload da imagem: " + describeError(data));
  }
  lastImageUpload = { fileName: file.name, mediaId: data.id };
  return data.id;
}

/* ---------------- Montagem da mensagem ---------------- */

function buildPayload(to, mediaId) {
  const type = $("msgType").value;
  const base = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
  };

  if (type === "text") {
    return {
      ...base,
      type: "text",
      text: {
        preview_url: $("previewUrl").checked,
        body: $("textBody").value,
      },
    };
  }

  if (type === "image") {
    const image = mediaId
      ? { id: mediaId, caption: $("caption").value }
      : { link: $("imageUrl").value.trim(), caption: $("caption").value };
    return { ...base, type: "image", image };
  }

  // template
  const components = [];
  if (mediaId) {
    components.push({ type: "header", parameters: [{ type: "image", image: { id: mediaId } }] });
  } else if ($("imageUrl").value.trim()) {
    components.push({ type: "header", parameters: [{ type: "image", image: { link: $("imageUrl").value.trim() } }] });
  }
  const vars = $("tplVars").value
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((t) => ({ type: "text", text: t }));
  if (vars.length) components.push({ type: "body", parameters: vars });

  return {
    ...base,
    type: "template",
    template: {
      name: $("tplName").value.trim(),
      language: { code: $("tplLang").value.trim() || "pt_BR" },
      components,
    },
  };
}

/* ---------------- Validações do formulário ---------------- */

function validate() {
  const type = $("msgType").value;
  const problems = [];
  if (type === "text" && !$("textBody").value.trim()) {
    problems.push("Escreva o texto da mensagem.");
  }
  if (type === "image") {
    if ($("imageSource").value === "url" && !$("imageUrl").value.trim()) {
      problems.push("Informe a URL pública da imagem (ou envie um arquivo).");
    }
    if ($("imageSource").value === "upload" && !$("imageFile").files[0]) {
      problems.push("Escolha o arquivo de imagem.");
    }
    if (!$("caption").value.trim()) problems.push("Escreva a legenda da imagem.");
  }
  if (type === "template") {
    if (!$("tplName").value.trim()) problems.push("Informe o nome do template aprovado.");
    if ($("imageSource").value === "upload" && !$("imageFile").files[0] && !$("imageUrl").value.trim()) {
      problems.push("Template sem imagem no cabeçalho: escolha um arquivo ou informe a URL.");
    }
  }
  if (!parseNumbers($("numbers").value, $("fix55").checked).length) {
    problems.push("Adicione pelo menos um número de destino.");
  }
  return problems;
}

/* ---------------- Log ---------------- */

function clearLog() {
  results = [];
  $("log").innerHTML = "";
  $("summary").textContent = "";
  $("csvBtn").hidden = true;
}

function addLogEntry(to, ok, detail, payload) {
  results.push({ numero: to, status: ok ? "ENVIADO" : "ERRO", detalhe: detail });

  const div = document.createElement("div");
  div.className = "entry " + (ok ? "ok" : "err");
  div.innerHTML = `
    <span class="chip">${ok ? "✓" : "✕"}</span>
    <div style="flex:1">
      <b>${esc(to)}</b>
      <small>${ok ? "Mensagem aceita pela API" : esc(detail)}</small>
      <details><pre>${esc(JSON.stringify(payload, null, 2))}</pre></details>
    </div>`;
  $("log").prepend(div);
}

function updateSummary(sent, failed, total) {
  $("summary").textContent = `✅ ${sent} enviado(s) · ❌ ${failed} falha(s) · ${total} no total`;
}

function downloadCsv() {
  const rows = [["numero", "status", "detalhe"],
    ...results.map((r) => [r.numero, r.status, r.detalhe])];
  const csv = "\uFEFF" + rows
    .map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(";"))
    .join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "log-disparo-whatsapp.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ---------------- Envio em lote ---------------- */

async function sendAll() {
  if (running) return;
  const missing = credentialsMissing();
  if (missing) { alert(missing); return; }

  const problems = validate();
  if (problems.length) { alert("Corrija antes de disparar:\n\n• " + problems.join("\n• ")); return; }

  const numbers = parseNumbers($("numbers").value, $("fix55").checked);
  const delaySec = Math.max(1, parseInt($("delay").value, 10) || 4);

  $("sendBtn").disabled = true;
  $("stopBtn").disabled = false;
  running = true;
  clearLog();

  let mediaId = null;
  try {
    mediaId = await uploadImageIfNeeded();
  } catch (err) {
    alert(err.message);
    $("sendBtn").disabled = false;
    $("stopBtn").disabled = true;
    running = false;
    return;
  }

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < numbers.length; i++) {
    if (!running) break;
    const to = numbers[i];
    const payload = buildPayload(to, mediaId);
    const { ok, data } = await graph(`${$("phoneId").value.trim()}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const detail = ok
      ? (data.messages && data.messages[0] && data.messages[0].id) || "ok"
      : describeError(data);
    addLogEntry(to, ok, detail, payload);
    if (ok) sent++; else failed++;
    updateSummary(sent, failed, numbers.length);

    if (i < numbers.length - 1 && running) {
      await sleepInterruptible(delaySec * 1000);
    }
  }

  if (!running) {
    $("summary").textContent += " · ⏹ interrompido";
  }
  running = false;
  $("sendBtn").disabled = false;
  $("stopBtn").disabled = true;
  $("csvBtn").hidden = results.length === 0;
  saveSettings();
}

/* ---------------- Visibilidade dos campos ---------------- */

function syncFieldVisibility() {
  const type = $("msgType").value;
  const source = $("imageSource").value;

  $("imageFields").hidden = type === "text";
  $("textFields").hidden = type !== "text";
  $("templateFields").hidden = type !== "template";

  $("imageUrlLabel").hidden = source !== "url";
  $("imageFileLabel").hidden = source !== "upload";
  $("captionLabel").hidden = type === "template";
}

/* ---------------- Inicialização ---------------- */

function init() {
  loadSettings();
  syncFieldVisibility();

  $("msgType").addEventListener("change", syncFieldVisibility);
  $("imageSource").addEventListener("change", syncFieldVisibility);
  $("testConn").addEventListener("click", testConnection);
  $("sendBtn").addEventListener("click", sendAll);
  $("stopBtn").addEventListener("click", () => { running = false; });
  $("csvBtn").addEventListener("click", downloadCsv);
  $("clearData").addEventListener("click", (e) => { e.preventDefault(); clearSaved(); });

  // não guardar token se o checkbox estiver desmarcado: limpa antes de salvar
  $("remember").addEventListener("change", () => {
    if (!$("remember").checked) {
      try {
        const data = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
        data.token = "";
        localStorage.setItem(LS_KEY, JSON.stringify(data));
      } catch { /* noop */ }
    }
  });
}

document.addEventListener("DOMContentLoaded", init);
