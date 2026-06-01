import { firebaseConfig } from "./firebase-config.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  onSnapshot,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const state = {
  user: null,
  profile: null,
  route: "dashboard",
  search: "",
  unsubs: [],
  cases: [],
  deadlines: [],
  evidence: [],
  tasks: [],
  users: [],
  blueprint: defaultBlueprint()
};

const labels = {
  draft: "Rascunho",
  active: "Ativo",
  waiting: "Aguardando",
  urgent: "Urgente",
  closed: "Encerrado",
  open: "Aberto",
  done: "Concluído",
  todo: "A fazer",
  doing: "Em andamento",
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  critical: "Crítica",
  document: "Documento",
  print: "Print",
  audio: "Áudio",
  medical: "Médico",
  witness: "Testemunha",
  other: "Outro"
};

function defaultBlueprint() {
  return {
    productName: "Painel Jurídico",
    accent: "#335cff",
    heroText: "Portal jurídico configurável com Developer Studio.",
    modules: [
      { id: "cases", label: "Processos", collection: "cases", enabled: true },
      { id: "deadlines", label: "Prazos", collection: "deadlines", enabled: true },
      { id: "evidence", label: "Provas", collection: "evidence", enabled: true },
      { id: "tasks", label: "Tarefas", collection: "tasks", enabled: true }
    ],
    fields: [
      { id: "risk", module: "cases", label: "Risco", type: "select" },
      { id: "status", module: "cases", label: "Status", type: "select" },
      { id: "summary", module: "cases", label: "Resumo estratégico", type: "textarea" }
    ]
  };
}

function uid() {
  return state.user?.uid;
}

function canStudio() {
  return ["developer", "admin"].includes(state.profile?.role);
}

function toast(msg) {
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = msg;
  $("#toastArea").appendChild(node);
  setTimeout(() => node.remove(), 3800);
}

function esc(v = "") {
  return String(v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
}

function norm(v = "") {
  return String(v).toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function daysUntil(date) {
  if (!date) return 99999;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date + "T00:00:00");
  return Math.ceil((d - today) / 86400000);
}

function todayPlus(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function caseById(id) {
  return state.cases.find(c => c.id === id);
}

function filterItems(items, fields) {
  const q = norm(state.search);
  if (!q) return items;
  return items.filter(item => fields.some(field => norm(item[field]).includes(q)));
}

function stopSubscriptions() {
  state.unsubs.forEach(fn => fn && fn());
  state.unsubs = [];
}

async function ensureProfile(user) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data();

  const profile = {
    uid: user.uid,
    email: user.email,
    name: user.displayName || user.email?.split("@")[0] || "Usuário",
    role: "user",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  await setDoc(ref, profile);
  return { ...profile, createdAt: null, updatedAt: null };
}

function scopedQuery(name) {
  const col = collection(db, name);
  return canStudio()
    ? query(col, orderBy("updatedAt", "desc"))
    : query(col, where("ownerId", "==", uid()), orderBy("updatedAt", "desc"));
}

function subscribe() {
  stopSubscriptions();

  ["cases", "deadlines", "evidence", "tasks"].forEach(name => {
    const unsub = onSnapshot(scopedQuery(name), snap => {
      state[name] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      render();
    }, err => toast("Erro em " + name + ": " + err.message));
    state.unsubs.push(unsub);
  });

  state.unsubs.push(onSnapshot(doc(db, "studio", "blueprint"), snap => {
    state.blueprint = snap.exists() ? { ...defaultBlueprint(), ...snap.data() } : defaultBlueprint();
    applyBlueprintTheme();
    renderStudio();
  }));

  if (canStudio()) {
    state.unsubs.push(onSnapshot(query(collection(db, "users"), orderBy("createdAt", "desc")), snap => {
      state.users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderStudio();
    }));
  }
}

function finishBoot() {
  window.PJ_APP_READY = true;
  if (window.PJ_BOOT_TIMEOUT) clearTimeout(window.PJ_BOOT_TIMEOUT);

  const boot = $("#boot");
  if (boot) boot.hidden = true;
}

function showAuth() {
  finishBoot();
  $("#authScreen").hidden = false;
  $("#appScreen").hidden = true;
}

function showApp() {
  finishBoot();
  $("#authScreen").hidden = true;
  $("#appScreen").hidden = false;
}

function setRoute(route) {
  state.route = route;
  $$(".page").forEach(p => p.classList.toggle("active", p.id === route));
  $$(".menu-item").forEach(b => b.classList.toggle("active", b.dataset.view === route));
  $("#sidebar").classList.remove("open");
  render();
}

function applyBlueprintTheme() {
  document.documentElement.style.setProperty("--primary", state.blueprint.accent || "#335cff");
  $("#brandName").textContent = state.blueprint.productName || "Painel Jurídico";
  $("#studioProductName").value = state.blueprint.productName || "";
  $("#studioAccent").value = state.blueprint.accent || "#335cff";
  $("#studioHeroText").value = state.blueprint.heroText || "";
  $("#themePreviewTitle").textContent = state.blueprint.productName || "Painel Jurídico";
  $("#themePreviewText").textContent = state.blueprint.heroText || "Portal jurídico configurável.";
}

function render() {
  if (!state.user) return;
  renderShell();
  renderDashboard();
  renderCases();
  renderDeadlines();
  renderEvidence();
  renderTasks();
  renderStudio();
  populateCaseSelects();
}

function renderShell() {
  const studio = canStudio();
  $("#roleBadge").textContent = studio ? "developer studio" : "usuário";
  $$(".studio-only").forEach(el => el.hidden = !studio);
  if (!studio && state.route.startsWith("studio")) setRoute("dashboard");
}

function renderDashboard() {
  $("#statCases").textContent = state.cases.length;
  $("#statDeadlines").textContent = state.deadlines.filter(d => d.status !== "done" && daysUntil(d.dueDate) <= 7).length;
  $("#statTasks").textContent = state.tasks.filter(t => t.status !== "done").length;
  $("#statEvidence").textContent = state.evidence.length;

  const status = ["draft", "active", "waiting", "urgent", "closed"];
  $("#statusPipeline").innerHTML = status.map(s => {
    const items = state.cases.filter(c => c.status === s).slice(0, 5);
    return `<div class="lane"><h3>${labels[s]}</h3>${items.map(i => `<span class="lane-item">${esc(i.title)}</span>`).join("") || `<div class="empty">Vazio</div>`}</div>`;
  }).join("");

  const deadlines = [...state.deadlines]
    .filter(d => d.status !== "done")
    .sort((a, b) => daysUntil(a.dueDate) - daysUntil(b.dueDate))
    .slice(0, 7);

  $("#deadlineDigest").innerHTML = deadlines.map(d => `
    <div class="list-item">
      <strong>${esc(d.title)}</strong>
      <small>${esc(caseById(d.caseId)?.title || "Sem processo")} · ${esc(d.dueDate)} · ${daysUntil(d.dueDate)} dias</small>
    </div>
  `).join("") || `<div class="empty">Nenhum prazo próximo.</div>`;
}

function renderCases() {
  let items = filterItems(state.cases, ["title", "number", "opponent", "court", "summary"]);
  const status = $("#caseFilterStatus").value;
  if (status !== "all") items = items.filter(i => i.status === status);

  $("#caseGrid").innerHTML = items.map(c => `
    <article class="card">
      <div class="card-head"><h3>${esc(c.title)}</h3><span class="badge ${c.status}">${labels[c.status] || c.status}</span></div>
      <div class="meta"><span class="badge">${esc(c.number || "sem número")}</span><span class="badge ${c.risk}">Risco ${labels[c.risk] || c.risk}</span></div>
      <p>${esc(c.summary || "Sem resumo estratégico.")}</p>
      <small>${esc(c.court || "Órgão não informado")} · ${esc(c.opponent || "Parte contrária não informada")}</small>
      <div class="card-actions">
        <button class="btn secondary" data-edit-case="${c.id}" type="button">Editar</button>
        <button class="btn danger" data-delete="cases:${c.id}" type="button">Excluir</button>
      </div>
    </article>
  `).join("") || `<div class="empty">Nenhum processo encontrado.</div>`;

  $$("[data-edit-case]").forEach(btn => btn.onclick = () => openCaseModal(btn.dataset.editCase));
  wireDeletes();
}

function renderDeadlines() {
  const items = filterItems(state.deadlines, ["title", "dueDate", "priority", "status"]).sort((a, b) => daysUntil(a.dueDate) - daysUntil(b.dueDate));
  if (!items.length) {
    $("#deadlineTable").innerHTML = `<div class="empty">Nenhum prazo cadastrado.</div>`;
    return;
  }

  $("#deadlineTable").innerHTML = `<table class="data-table"><thead><tr><th>Prazo</th><th>Processo</th><th>Data</th><th>Dias</th><th>Prioridade</th><th>Status</th><th></th></tr></thead><tbody>
    ${items.map(d => `<tr>
      <td><strong>${esc(d.title)}</strong></td>
      <td>${esc(caseById(d.caseId)?.title || "Sem vínculo")}</td>
      <td>${esc(d.dueDate || "-")}</td>
      <td>${daysUntil(d.dueDate)}</td>
      <td><span class="badge ${d.priority}">${labels[d.priority] || d.priority}</span></td>
      <td><span class="badge ${d.status}">${labels[d.status] || d.status}</span></td>
      <td><button class="btn danger" data-delete="deadlines:${d.id}" type="button">Excluir</button></td>
    </tr>`).join("")}
  </tbody></table>`;
  wireDeletes();
}

function renderEvidence() {
  const items = filterItems(state.evidence, ["title", "type", "url", "notes"]);
  $("#evidenceGrid").innerHTML = items.map(e => `
    <article class="card">
      <div class="card-head"><h3>${esc(e.title)}</h3><span class="badge">${labels[e.type] || e.type}</span></div>
      <p>${esc(e.notes || "Sem observações.")}</p>
      <div class="meta"><span class="badge">${esc(caseById(e.caseId)?.title || "Sem processo")}</span></div>
      ${e.url ? `<p><a href="${esc(e.url)}" target="_blank" rel="noreferrer">${esc(e.url)}</a></p>` : ""}
      <div class="card-actions"><button class="btn danger" data-delete="evidence:${e.id}" type="button">Excluir</button></div>
    </article>
  `).join("") || `<div class="empty">Nenhuma prova cadastrada.</div>`;
  wireDeletes();
}

function renderTasks() {
  const columns = [["todo", "A fazer"], ["doing", "Em andamento"], ["done", "Concluídas"]];
  const items = filterItems(state.tasks, ["title", "priority", "status", "dueDate"]);

  $("#taskBoard").innerHTML = columns.map(([status, title]) => `
    <div class="kanban-col">
      <h2>${title}</h2>
      ${items.filter(t => t.status === status).map(t => `
        <article class="kanban-card">
          <strong>${esc(t.title)}</strong>
          <div class="meta"><span class="badge ${t.priority}">${labels[t.priority] || t.priority}</span>${t.dueDate ? `<span class="badge">${esc(t.dueDate)}</span>` : ""}</div>
          <small>${esc(caseById(t.caseId)?.title || "Sem processo")}</small>
          <div class="card-actions">
            ${status !== "todo" ? `<button class="btn secondary" data-move-task="${t.id}:todo" type="button">A fazer</button>` : ""}
            ${status !== "doing" ? `<button class="btn secondary" data-move-task="${t.id}:doing" type="button">Andamento</button>` : ""}
            ${status !== "done" ? `<button class="btn secondary" data-move-task="${t.id}:done" type="button">Concluir</button>` : ""}
            <button class="btn danger" data-delete="tasks:${t.id}" type="button">Excluir</button>
          </div>
        </article>
      `).join("") || `<div class="empty">Vazio</div>`}
    </div>
  `).join("");

  $$("[data-move-task]").forEach(btn => btn.onclick = async () => {
    const [id, status] = btn.dataset.moveTask.split(":");
    await updateDoc(doc(db, "tasks", id), { status, updatedAt: serverTimestamp() });
  });
  wireDeletes();
}

function renderStudio() {
  if (!canStudio()) return;

  $("#metricModules").textContent = state.blueprint.modules?.length || 0;
  $("#metricFields").textContent = state.blueprint.fields?.length || 0;
  $("#metricUsers").textContent = state.users.length || 0;
  $("#blueprintPreview").textContent = JSON.stringify(state.blueprint, null, 2);

  renderModuleBuilder();
  renderFieldBuilder();
  renderExplorers();
}

function renderModuleBuilder() {
  $("#moduleBuilder").innerHTML = (state.blueprint.modules || []).map((m, i) => `
    <div class="builder-row" data-module-row="${i}">
      <label>Nome <input data-k="label" value="${esc(m.label)}"></label>
      <label>ID <input data-k="id" value="${esc(m.id)}"></label>
      <label>Coleção <input data-k="collection" value="${esc(m.collection)}"></label>
      <button class="btn danger" data-remove-module="${i}" type="button">Remover</button>
    </div>
  `).join("") || `<div class="empty">Nenhum módulo.</div>`;

  $$("[data-module-row]").forEach(row => {
    const i = Number(row.dataset.moduleRow);
    $$("input", row).forEach(input => input.oninput = () => {
      state.blueprint.modules[i][input.dataset.k] = input.value.trim();
      renderStudioLight();
    });
  });
  $$("[data-remove-module]").forEach(btn => btn.onclick = () => {
    state.blueprint.modules.splice(Number(btn.dataset.removeModule), 1);
    renderStudio();
  });
}

function renderFieldBuilder() {
  $("#fieldBuilder").innerHTML = (state.blueprint.fields || []).map((f, i) => `
    <div class="builder-row" data-field-row="${i}">
      <label>Nome <input data-k="label" value="${esc(f.label)}"></label>
      <label>Módulo <input data-k="module" value="${esc(f.module)}"></label>
      <label>Tipo <select data-k="type">
        ${["text", "textarea", "select", "date", "number", "url"].map(t => `<option ${f.type === t ? "selected" : ""}>${t}</option>`).join("")}
      </select></label>
      <button class="btn danger" data-remove-field="${i}" type="button">Remover</button>
    </div>
  `).join("") || `<div class="empty">Nenhum campo.</div>`;

  $$("[data-field-row]").forEach(row => {
    const i = Number(row.dataset.fieldRow);
    $$("input,select", row).forEach(input => input.oninput = () => {
      state.blueprint.fields[i][input.dataset.k] = input.value.trim();
      renderStudioLight();
    });
  });
  $$("[data-remove-field]").forEach(btn => btn.onclick = () => {
    state.blueprint.fields.splice(Number(btn.dataset.removeField), 1);
    renderStudio();
  });
}

function renderStudioLight() {
  $("#metricModules").textContent = state.blueprint.modules?.length || 0;
  $("#metricFields").textContent = state.blueprint.fields?.length || 0;
  $("#blueprintPreview").textContent = JSON.stringify(state.blueprint, null, 2);
}

function renderExplorers() {
  const data = [
    ["cases", state.cases.length],
    ["deadlines", state.deadlines.length],
    ["evidence", state.evidence.length],
    ["tasks", state.tasks.length],
    ["users", state.users.length]
  ];

  $("#collectionExplorer").innerHTML = data.map(([name, count]) => `
    <div class="list-item"><strong>${name}</strong><small>${count} documento(s) visíveis para este perfil</small></div>
  `).join("");

  $("#userExplorer").innerHTML = state.users.map(u => `
    <div class="list-item"><strong>${esc(u.name || u.email)}</strong><small>${esc(u.email)} · role: ${esc(u.role || "user")}</small></div>
  `).join("") || `<div class="empty">Nenhum usuário carregado.</div>`;
}

function populateCaseSelects() {
  const options = state.cases.map(c => `<option value="${c.id}">${esc(c.title)}</option>`).join("");
  $$('select[name="caseId"]').forEach(select => {
    const current = select.value;
    select.innerHTML = options || `<option value="">Crie um processo primeiro</option>`;
    if (current) select.value = current;
  });
}

function openCaseModal(id = null) {
  const form = $("#caseForm");
  form.reset();
  form.elements.id.value = "";
  if (id) {
    const c = state.cases.find(item => item.id === id);
    if (c) {
      Object.entries(c).forEach(([k, v]) => {
        if (form.elements[k]) form.elements[k].value = v || "";
      });
      form.elements.id.value = id;
    }
  }
  $("#caseModal").showModal();
}

function wireModals() {
  $$("[data-open]").forEach(btn => btn.onclick = () => $("#" + btn.dataset.open).showModal());
  $("#newCaseTop").onclick = () => openCaseModal();

  $("#caseForm").addEventListener("submit", async e => {
    if (e.submitter?.value === "cancel") return;
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const id = f.get("id");
    const payload = {
      title: f.get("title"),
      number: f.get("number"),
      opponent: f.get("opponent"),
      court: f.get("court"),
      status: f.get("status"),
      risk: f.get("risk"),
      summary: f.get("summary"),
      ownerId: uid(),
      updatedAt: serverTimestamp()
    };
    try {
      if (id) await updateDoc(doc(db, "cases", id), payload);
      else await addDoc(collection(db, "cases"), { ...payload, createdAt: serverTimestamp() });
      $("#caseModal").close();
      toast("Processo salvo.");
    } catch (err) { toast("Erro: " + err.message); }
  });

  $("#deadlineForm").addEventListener("submit", async e => {
    if (e.submitter?.value === "cancel") return;
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await addDoc(collection(db, "deadlines"), {
        caseId: f.get("caseId"), title: f.get("title"), dueDate: f.get("dueDate"),
        priority: f.get("priority"), status: f.get("status"), ownerId: uid(),
        createdAt: serverTimestamp(), updatedAt: serverTimestamp()
      });
      e.currentTarget.reset();
      $("#deadlineModal").close();
      toast("Prazo salvo.");
    } catch (err) { toast("Erro: " + err.message); }
  });

  $("#evidenceForm").addEventListener("submit", async e => {
    if (e.submitter?.value === "cancel") return;
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await addDoc(collection(db, "evidence"), {
        caseId: f.get("caseId"), type: f.get("type"), title: f.get("title"),
        url: f.get("url"), notes: f.get("notes"), ownerId: uid(),
        createdAt: serverTimestamp(), updatedAt: serverTimestamp()
      });
      e.currentTarget.reset();
      $("#evidenceModal").close();
      toast("Prova salva.");
    } catch (err) { toast("Erro: " + err.message); }
  });

  $("#taskForm").addEventListener("submit", async e => {
    if (e.submitter?.value === "cancel") return;
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await addDoc(collection(db, "tasks"), {
        caseId: f.get("caseId"), priority: f.get("priority"), title: f.get("title"),
        status: f.get("status"), dueDate: f.get("dueDate"), ownerId: uid(),
        createdAt: serverTimestamp(), updatedAt: serverTimestamp()
      });
      e.currentTarget.reset();
      $("#taskModal").close();
      toast("Tarefa salva.");
    } catch (err) { toast("Erro: " + err.message); }
  });
}

function wireDeletes() {
  $$("[data-delete]").forEach(btn => btn.onclick = async () => {
    const [name, id] = btn.dataset.delete.split(":");
    if (!confirm("Excluir este item?")) return;
    try {
      await deleteDoc(doc(db, name, id));
      toast("Item excluído.");
    } catch (err) { toast("Erro: " + err.message); }
  });
}

function wireAuth() {
  $("#showLogin").onclick = () => {
    $("#showLogin").classList.add("active");
    $("#showRegister").classList.remove("active");
    $("#loginForm").hidden = false;
    $("#registerForm").hidden = true;
  };
  $("#showRegister").onclick = () => {
    $("#showRegister").classList.add("active");
    $("#showLogin").classList.remove("active");
    $("#registerForm").hidden = false;
    $("#loginForm").hidden = true;
  };

  $("#loginForm").onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try { await signInWithEmailAndPassword(auth, f.get("email"), f.get("password")); }
    catch (err) { toast("Login falhou: " + err.message); }
  };

  $("#registerForm").onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      const cred = await createUserWithEmailAndPassword(auth, f.get("email"), f.get("password"));
      await updateProfile(cred.user, { displayName: f.get("name") });
      toast("Conta criada.");
    } catch (err) { toast("Cadastro falhou: " + err.message); }
  };

  $("#resetPassword").onclick = async () => {
    const email = $("#loginForm [name=email]").value.trim();
    if (!email) return toast("Digite seu e-mail primeiro.");
    try {
      await sendPasswordResetEmail(auth, email);
      toast("E-mail de recuperação enviado.");
    } catch (err) { toast("Erro: " + err.message); }
  };

  $("#logout").onclick = () => signOut(auth);
}

function wireUI() {
  $$(".menu-item").forEach(btn => btn.onclick = () => setRoute(btn.dataset.view));
  $("#openSidebar").onclick = () => $("#sidebar").classList.toggle("open");
  $("#globalSearch").oninput = debounce(e => { state.search = e.target.value.trim(); render(); }, 170);
  $("#caseFilterStatus").onchange = renderCases;

  $("#toggleTheme").onclick = () => {
    document.body.classList.toggle("dark");
    localStorage.setItem("pj-theme", document.body.classList.contains("dark") ? "dark" : "light");
  };

  $("#exportData").onclick = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      profile: state.profile,
      cases: state.cases,
      deadlines: state.deadlines,
      evidence: state.evidence,
      tasks: state.tasks,
      blueprint: state.blueprint
    };
    download("painel-juridico-export.json", JSON.stringify(payload, null, 2));
  };

  $("#seedUserData").onclick = seedUserData;
  $("#addModule").onclick = () => {
    state.blueprint.modules.push({ id: "novo_modulo", label: "Novo módulo", collection: "custom", enabled: true });
    renderStudio();
  };
  $("#addField").onclick = () => {
    state.blueprint.fields.push({ id: "novo_campo", module: "cases", label: "Novo campo", type: "text" });
    renderStudio();
  };
  $("#saveBlueprint").onclick = saveBlueprint;
  $("#applyStudioTheme").onclick = () => {
    state.blueprint.productName = $("#studioProductName").value.trim() || "Painel Jurídico";
    state.blueprint.accent = $("#studioAccent").value || "#335cff";
    state.blueprint.heroText = $("#studioHeroText").value.trim() || "Portal jurídico configurável.";
    applyBlueprintTheme();
    renderStudioLight();
  };
  $("#seedBlueprint").onclick = async () => {
    state.blueprint = defaultBlueprint();
    await saveBlueprint();
  };

  wireCommandPalette();
}

function wireCommandPalette() {
  const commands = [
    ["Novo processo", () => openCaseModal()],
    ["Novo prazo", () => $("#deadlineModal").showModal()],
    ["Nova prova", () => $("#evidenceModal").showModal()],
    ["Nova tarefa", () => $("#taskModal").showModal()],
    ["Ir para Studio", () => canStudio() ? setRoute("studioHome") : toast("Acesso apenas developer.")],
    ["Ir para Processos", () => setRoute("cases")],
    ["Alternar tema", () => $("#toggleTheme").click()]
  ];

  const palette = $("#commandPalette");
  const input = $("#commandInput");
  const results = $("#commandResults");

  function open() {
    palette.hidden = false;
    input.value = "";
    renderCommands("");
    setTimeout(() => input.focus(), 30);
  }
  function close() { palette.hidden = true; }
  function renderCommands(q) {
    const n = norm(q);
    const visible = commands.filter(([label]) => norm(label).includes(n));
    results.innerHTML = visible.map(([label], i) => `<button class="command-result" data-command="${i}" type="button">${esc(label)}</button>`).join("");
    $$("[data-command]", results).forEach(btn => btn.onclick = () => {
      visible[Number(btn.dataset.command)][1]();
      close();
    });
  }

  input.oninput = () => renderCommands(input.value);
  palette.onclick = e => { if (e.target === palette) close(); };
  document.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      open();
    }
    if (e.key === "Escape") close();
  });
}

function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function download(name, content) {
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

async function saveBlueprint() {
  if (!canStudio()) return toast("Acesso negado.");
  try {
    await setDoc(doc(db, "studio", "blueprint"), { ...state.blueprint, updatedAt: serverTimestamp() }, { merge: true });
    toast("Blueprint salvo no Firestore.");
  } catch (err) { toast("Erro ao salvar blueprint: " + err.message); }
}

async function seedUserData() {
  try {
    const batch = writeBatch(db);
    const c1 = doc(collection(db, "cases"));
    const c2 = doc(collection(db, "cases"));
    batch.set(c1, {
      ownerId: uid(), title: "Ação de medicamento — tutela e prova técnica", number: "5000000-00.2026.8.24.0000",
      opponent: "Estado / Município", court: "TJSC", status: "active", risk: "medium",
      summary: "Organizar histórico terapêutico, notas técnicas, falha de alternativas e indispensabilidade.",
      createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
    batch.set(c2, {
      ownerId: uid(), title: "Tarifa Social — recálculo e dano moral acessório", number: "0000000-00.2026.8.24.0000",
      opponent: "Autarquia municipal", court: "Juizado Especial", status: "urgent", risk: "high",
      summary: "Foco em requerimento administrativo, retroação, recálculo, afastamento de encargos e provas documentais.",
      createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
    batch.set(doc(collection(db, "deadlines")), { ownerId: uid(), caseId: c1.id, title: "Juntar complementação médica", dueDate: todayPlus(4), priority: "critical", status: "open", createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    batch.set(doc(collection(db, "deadlines")), { ownerId: uid(), caseId: c2.id, title: "Preparar réplica", dueDate: todayPlus(9), priority: "high", status: "open", createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    batch.set(doc(collection(db, "evidence")), { ownerId: uid(), caseId: c1.id, type: "medical", title: "Histórico terapêutico", url: "", notes: "Demonstra uso, dose, falhas e necessidade.", createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    batch.set(doc(collection(db, "tasks")), { ownerId: uid(), caseId: c2.id, title: "Separar requerimento administrativo", priority: "high", status: "todo", dueDate: todayPlus(2), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    await batch.commit();
    toast("Dados demo criados.");
  } catch (err) { toast("Erro ao gerar demo: " + err.message); }
}

function initTheme() {
  if (localStorage.getItem("pj-theme") === "dark") document.body.classList.add("dark");
}

function init() {
  initTheme();
  wireAuth();
  wireUI();
  wireModals();

  onAuthStateChanged(auth, async user => {
    stopSubscriptions();
    state.user = user;

    if (!user) {
      state.profile = null;
      showAuth();
      return;
    }

    try {
      state.profile = await ensureProfile(user);
      showApp();
      subscribe();
      render();
    } catch (err) {
      showAuth();
      toast("Erro ao preparar perfil: " + err.message);
    }
  });
}

try {
  init();

  setTimeout(() => {
    if (!window.PJ_APP_READY) {
      console.warn("Firebase/Auth demorou demais. Exibindo tela de login em modo recuperação.");
      showAuth();
      toast("Modo recuperação: o Firebase demorou para responder.");
    }
  }, 6500);
} catch (err) {
  console.error("Falha fatal ao inicializar app:", err);

  const boot = document.getElementById("boot");
  const auth = document.getElementById("authScreen");

  if (boot) boot.hidden = true;
  if (auth) auth.hidden = false;

  try {
    toast("Erro ao iniciar app: " + (err.message || err));
  } catch (_) {}
}

