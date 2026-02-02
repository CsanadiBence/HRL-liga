import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
  getFirestore, collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp, getDocs, updateDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDDXdGSp7OiCl-6tQU1Rm2t82xirXH_Icc",
  authDomain: "ifi2liga.firebaseapp.com",
  projectId: "ifi2liga",
  storageBucket: "ifi2liga.firebasestorage.app",
  messagingSenderId: "477042161462",
  appId: "1:477042161462:web:21de0203d56a618021e597",
  measurementId: "G-WYZMFDED0Z"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const leaguesCol = collection(db, "leagues");
const playersCol = collection(db, "players");
const matchesCol = collection(db, "matches");
const playoffMatchesCol = collection(db, "playoff_matches");
const archivesCol = collection(db, "archives");

const ARCHIVE_KEY = "hrl_archives";

let state = { 
  leagues: [],        // 4 liga (Liga A, B, C, D)
  players: [],        // játékosok leagueId-val
  matches: [],        // liga meccsek
  playoffMatches: [], // top 16 playoff meccsek
  archives: []
};
let unsub = [];

// --- ADMIN JELSZAVAK (5 darab: 4 liga + 1 master) ---
const MASTER_ADMIN_HASH = "8cbdb209dd8370504907b667a5b7ab273038f75212fa75703c99bdf623860457"; // hunrise123
const LEAGUE_A_HASH = "d3d5e0629668e3d71c636e9325b946a4161f522fe1c47375a19f5d4ce1adb346"; // leagueA123
const LEAGUE_B_HASH = "7bd515d036b4af1a0242515dbc6a77cabfef725372c38b9401b3d09ef9fe3453"; // leagueB123
const LEAGUE_C_HASH = "6fdd31c5853ef4ecb5062393c0d43c0c6a4df0ef660073b43799d3dd0f7c98cc"; // leagueC123
const LEAGUE_D_HASH = "df2ceca7cd4383d467854adccee21c27170a69a5024a649fff7a2bcda27459ce"; // leagueD123

let adminStatus = {
  isMaster: false,
  leagueAAdmin: false,
  leagueBAdmin: false,
  leagueCAdmin: false,
  leagueDAdmin: false
};

// localStorage-ból visszatöltjük az admin státuszt
function loadAdminStatus() {
  adminStatus.isMaster = localStorage.getItem("ifi2_master") === "1";
  adminStatus.leagueAAdmin = localStorage.getItem("ifi2_leagueA") === "1";
  adminStatus.leagueBAdmin = localStorage.getItem("ifi2_leagueB") === "1";
  adminStatus.leagueCAdmin = localStorage.getItem("ifi2_leagueC") === "1";
  adminStatus.leagueDAdmin = localStorage.getItem("ifi2_leagueD") === "1";
}
loadAdminStatus();

let isAdmin = adminStatus.isMaster || adminStatus.leagueAAdmin || adminStatus.leagueBAdmin || adminStatus.leagueCAdmin || adminStatus.leagueDAdmin;

// --- INIT FUNCTION (DOM betöltése után) ---
function initApp() {
  console.log('App initialized');
  
// --- ADMIN LOGIN LOGIC (5 jelszó: master + 4 liga) ---
const adminPasswordInput = document.getElementById("adminPasswordInput");
const adminLoginBtn = document.getElementById("adminLoginBtn");
const adminLogoutBtn = document.getElementById("adminLogoutBtn");
const adminLoginMsg = document.getElementById("adminLoginMsg");
const adminLoggedOut = document.getElementById("adminLoggedOut");
const adminLoggedIn = document.getElementById("adminLoggedIn");
const adminStatusText = document.getElementById("adminStatusText");

async function hashString(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

adminLoginBtn.addEventListener("click", async () => {
  const hash = await hashString(adminPasswordInput.value);
  let loggedIn = false;
  
  if (hash === MASTER_ADMIN_HASH) {
    adminStatus.isMaster = true;
    localStorage.setItem("ifi2_master", "1");
    adminLoginMsg.textContent = "Master Admin belépve";
    loggedIn = true;
  } else if (hash === LEAGUE_A_HASH) {
    adminStatus.leagueAAdmin = true;
    localStorage.setItem("ifi2_leagueA", "1");
    adminLoginMsg.textContent = "Liga A Admin belépve";
    loggedIn = true;
  } else if (hash === LEAGUE_B_HASH) {
    adminStatus.leagueBAdmin = true;
    localStorage.setItem("ifi2_leagueB", "1");
    adminLoginMsg.textContent = "Liga B Admin belépve";
    loggedIn = true;
  } else if (hash === LEAGUE_C_HASH) {
    adminStatus.leagueCAdmin = true;
    localStorage.setItem("ifi2_leagueC", "1");
    adminLoginMsg.textContent = "Liga C Admin belépve";
    loggedIn = true;
  } else if (hash === LEAGUE_D_HASH) {
    adminStatus.leagueDAdmin = true;
    localStorage.setItem("ifi2_leagueD", "1");
    adminLoginMsg.textContent = "Liga D Admin belépve";
    loggedIn = true;
  } else {
    adminLoginMsg.textContent = "Hibás jelszó";
  }
  
  if (loggedIn) {
    isAdmin = true;
    adminPasswordInput.value = "";
    updateAdminUI();
    refreshUI();
  }
});

adminLogoutBtn.addEventListener("click", () => {
  adminStatus = { isMaster: false, leagueAAdmin: false, leagueBAdmin: false, leagueCAdmin: false, leagueDAdmin: false };
  localStorage.removeItem("ifi2_master");
  localStorage.removeItem("ifi2_leagueA");
  localStorage.removeItem("ifi2_leagueB");
  localStorage.removeItem("ifi2_leagueC");
  localStorage.removeItem("ifi2_leagueD");
  isAdmin = false;
  updateAdminUI();
  refreshUI();
});

function updateAdminUI() {
  const anyAdmin = adminStatus.isMaster || adminStatus.leagueAAdmin || adminStatus.leagueBAdmin || adminStatus.leagueCAdmin || adminStatus.leagueDAdmin;
  
  document.querySelectorAll(".admin-only-view, .admin-only-nav, .admin-only-inline").forEach(el => el.style.display = anyAdmin ? "" : "none");
  document.querySelectorAll(".master-only").forEach(el => el.style.display = adminStatus.isMaster ? "" : "none");
  
  adminLoggedOut.style.display = anyAdmin ? "none" : "";
  adminLoggedIn.style.display = anyAdmin ? "" : "none";
  
  // Admin státusz szöveg
  if (adminStatusText) {
    let statusParts = [];
    if (adminStatus.isMaster) statusParts.push("Master Admin");
    if (adminStatus.leagueAAdmin) statusParts.push("Liga A");
    if (adminStatus.leagueBAdmin) statusParts.push("Liga B");
    if (adminStatus.leagueCAdmin) statusParts.push("Liga C");
    if (adminStatus.leagueDAdmin) statusParts.push("Liga D");
    adminStatusText.textContent = statusParts.length > 0 ? `✓ ${statusParts.join(", ")}` : "";
  }
}
updateAdminUI();

// --- HAMBURGER MENÜ KEZELÉS ---
const hamburgerBtn = document.getElementById('hamburgerBtnBaj');
const navMenu = document.getElementById('navMenuBaj');

if (hamburgerBtn && navMenu) {
  hamburgerBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    const isActive = navMenu.style.display === 'flex';
    navMenu.style.display = isActive ? 'none' : 'flex';
    hamburgerBtn.classList.toggle('active');
  });

  document.addEventListener('click', function(e) {
    if (!e.target.closest('.main-header')) {
      navMenu.style.display = 'none';
      hamburgerBtn.classList.remove('active');
    }
  });
}

// --- NAVIGÁCIÓ ---
document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    console.log('Nav button clicked:', btn.dataset.view);
    const target = btn.dataset.view;
    const anyAdmin = adminStatus.isMaster || adminStatus.leagueAAdmin || adminStatus.leagueBAdmin || adminStatus.leagueCAdmin || adminStatus.leagueDAdmin;
    
    // Admin-only nézetek ellenőrzése
    if ((target === "league_admin" || target === "matches" || target === "playoff") && !anyAdmin) return;
    if ((target === "league_admin" || target === "playoff") && !adminStatus.isMaster) return;
    
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === `view-${target}`));
    console.log('View changed to:', target);
  });
});

// --- LISTENERS ---
function startListeners() {
  unsub.push(onSnapshot(leaguesCol, snap => { state.leagues = snap.docs.map(d => ({id: d.id, ...d.data()})); refreshUIFast(); }));
  unsub.push(onSnapshot(playersCol, snap => { state.players = snap.docs.map(d => ({id: d.id, ...d.data()})); refreshUI(); }));
  unsub.push(onSnapshot(query(matchesCol, orderBy("createdAt", "desc")), snap => { state.matches = snap.docs.map(d => ({id: d.id, ...d.data()})); refreshUI(); }));
  unsub.push(onSnapshot(query(playoffMatchesCol, orderBy("createdAt", "desc")), snap => { state.playoffMatches = snap.docs.map(d => ({id: d.id, ...d.data()})); refreshUI(); }));
  unsub.push(onSnapshot(playinPairsCol, snap => { state.playinPairs = snap.docs.map(d => ({id: d.id, ...d.data()})); refreshUI(); }));
  unsub.push(onSnapshot(query(archivesCol, orderBy("finishedAt", "desc")), snap => { state.archives = snap.docs.map(d => ({id: d.id, ...d.data()})); updateArchiveDisplay(); }));
}
startListeners();

// --- HELPERS ---
function getGroupById(id) { return state.groups.find(g => g.id === id); }
function getPlayerById(id) { return state.players.find(p => p.id === id); }
function getPlayersByGroup(gid) { return state.players.filter(p => p.groupId === gid); }

function getSortedGroups() {
  return [...state.groups].sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
}

// --- UI REFRESH ---
function refreshUI() {
  // TODO: Itt lesznek a liga táblák renderelése
  console.log('refreshUI called');
}

function refreshUIFast() {
  console.log('refreshUIFast called');
}

// --- CSOPORT KEZELÉS --- (RÉGI KÓD - KOMMENTEZVE)
const groupNameInput = document.getElementById("groupNameInput");
const addGroupBtn = document.getElementById("addGroupBtn");
const groupMessage = document.getElementById("groupMessage");
const groupList = document.getElementById("groupList");

if (addGroupBtn) addGroupBtn.addEventListener("click", async () => {
  if (!isAdmin) {
    groupMessage.textContent = "Csak admin mód engedélyez!";
    return;
  }
  const name = groupNameInput.value.trim().toUpperCase();
  if (!name || state.groups.some(g => g.name.toLowerCase() === name.toLowerCase())) {
    groupMessage.textContent = "Hibás vagy létező név";
    return;
  }
  try {
    const maxOrder = state.groups.length > 0 ? Math.max(...state.groups.map(g => g.order || 0)) : 0;
    const docRef = await addDoc(groupsCol, { name, order: maxOrder + 1, createdAt: serverTimestamp() });
    console.log("Csoport létrehozva:", docRef.id);
    groupNameInput.value = "";
    groupMessage.textContent = `Csoport létrehozva: ${name}`;
  } catch (error) {
    console.error("Hiba a csoport létrehozásakor:", error);
    groupMessage.textContent = `Hiba: ${error.message}`;
  }
});

function renderGroupList() {
  if (!groupList) return;
  groupList.innerHTML = state.groups.length === 0 ? "<li class='muted'>Nincs csoport</li>" : "";
  getSortedGroups().forEach(g => {
    const li = document.createElement("li");
    li.textContent = `${g.name} – ${getPlayersByGroup(g.id).length} játékos`;
    groupList.appendChild(li);
  });
}

function refreshGroupSelects() {
  const selects = [document.getElementById("matchGroupSelect"), document.getElementById("playerGroupSelect")];
  selects.forEach(sel => {
    if (sel) {
      sel.innerHTML = "<option value=''>-- Válassz --</option>";
      getSortedGroups().forEach(g => {
        const opt = document.createElement("option");
        opt.value = g.id;
        opt.textContent = g.name;
        sel.appendChild(opt);
      });
    }
  });
}

// --- MECCS RÖGZÍTÉS ---
const matchGroupSelect = document.getElementById("matchGroupSelect");
const homePlayerSelect = document.getElementById("homePlayerSelect");
const awayPlayerSelect = document.getElementById("awayPlayerSelect");
const homeGoalsInput = document.getElementById("homeGoalsInput");
const awayGoalsInput = document.getElementById("awayGoalsInput");
const addMatchBtn = document.getElementById("addMatchBtn");
const matchMessage = document.getElementById("matchMessage");

function refreshMatchPlayerSelects() {
  const gid = matchGroupSelect?.value;
  [homePlayerSelect, awayPlayerSelect].forEach(sel => {
      if(sel) sel.innerHTML = "<option value=''>-- Válassz --</option>";
  });
  if (!gid) return;
  getPlayersByGroup(gid).sort((a,b) => a.name.localeCompare(b.name)).forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    if(homePlayerSelect) homePlayerSelect.appendChild(opt.cloneNode(true));
    if(awayPlayerSelect) awayPlayerSelect.appendChild(opt);
  });
}
if (matchGroupSelect) matchGroupSelect.addEventListener("change", refreshMatchPlayerSelects);

if (addMatchBtn) {
    addMatchBtn.onclick = async () => {
      if (!isAdmin) return;
      const gid = matchGroupSelect.value;
      const home = homePlayerSelect.value;
      const away = awayPlayerSelect.value;
      const hg = parseInt(homeGoalsInput.value) || 0;
      const ag = parseInt(awayGoalsInput.value) || 0;
      if (!gid || !home || !away || home === away || hg < 0 || ag < 0) {
        matchMessage.textContent = "Hibás adatok";
        return;
      }
      await addDoc(matchesCol, { groupId: gid, homeId: home, awayId: away, homeGoals: hg, awayGoals: ag, createdAt: serverTimestamp() });
      homeGoalsInput.value = awayGoalsInput.value = "0";
      matchMessage.textContent = "Meccs mentve";
    };
}

// --- JÁTÉKOSOK ÉS PONTMÓDOSÍTÁSOK ---
const playerNameInput = document.getElementById("playerNameInput");
const playerGroupSelect = document.getElementById("playerGroupSelect");
const addPlayerBtn = document.getElementById("addPlayerBtn");
const playerMessage = document.getElementById("playerMessage");
const playersTableBody = document.getElementById("playersTableBody");
const playerCountInfo = document.getElementById("playerCountInfo");

if (addPlayerBtn) {
    addPlayerBtn.onclick = async () => {
      if (!isAdmin) return;
      const name = playerNameInput.value.trim();
      const gid = playerGroupSelect.value;
      if (!name || !gid || state.players.some(p => p.groupId === gid && p.name.toLowerCase() === name.toLowerCase())) {
        playerMessage.textContent = "Hibás vagy létező név";
        return;
      }
      await addDoc(playersCol, { name, groupId: gid, adjustment: 0, createdAt: serverTimestamp() });
      playerNameInput.value = "";
    };
}

function renderPlayersTable() {
  if (!playersTableBody) return;
  playersTableBody.innerHTML = "";
  if (state.players.length === 0) {
    playersTableBody.innerHTML = "<tr><td colspan='4' class='muted'>Nincs játékos</td></tr>";
    if (playerCountInfo) playerCountInfo.textContent = "";
    return;
  }
  const sorted = [...state.players].sort((a,b) => a.name.localeCompare(b.name));
  if (playerCountInfo) playerCountInfo.textContent = `Összesen: ${sorted.length}`;
  sorted.forEach(p => {
    const tr = document.createElement("tr");
    const group = getGroupById(p.groupId);
    const groupOptions = getSortedGroups();
    tr.innerHTML = `
      <td class="left">
        <span class="player-name" data-id="${p.id}">${p.name}</span>
        <input type="text" class="player-name-input" data-id="${p.id}" value="${p.name}" style="display:none; width:140px;">
      </td>
      <td>
        <span class="player-group-label" data-id="${p.id}">${group?.name || "-"}</span>
        <select class="player-group-select" data-id="${p.id}" style="display:none; min-width:90px;">
          <option value="">--</option>
          ${groupOptions.map(g => `<option value="${g.id}" ${g.id === p.groupId ? 'selected' : ''}>${g.name}</option>`).join("")}
        </select>
      </td>
      <td>
        <input type="number" class="penalty-input" data-id="${p.id}" value="${p.adjustment || 0}" style="width:50px;">
        <button class="save-penalty-btn" data-id="${p.id}" style="padding:4px 8px; font-size:11px;">Mentés</button>
      </td>
      <td>
        <button class="edit-player-btn" data-id="${p.id}">Szerkeszt</button>
        <button class="save-player-btn" data-id="${p.id}" style="display:none;">Mentés</button>
        <button class="cancel-player-btn" data-id="${p.id}" style="display:none;">Mégse</button>
        <button data-id="${p.id}" class="danger-btn del-player">Törlés</button>
      </td>
    `;
    playersTableBody.appendChild(tr);
  });

}

function enterPlayerEdit(pid) {
  if (!isAdmin) return;
  togglePlayerEditUI(pid, true);
}

function exitPlayerEdit(pid) {
  togglePlayerEditUI(pid, false);
}

function togglePlayerEditUI(pid, editing) {
  const nameSpan = document.querySelector(`.player-name[data-id="${pid}"]`);
  const nameInput = document.querySelector(`.player-name-input[data-id="${pid}"]`);
  const groupSpan = document.querySelector(`.player-group-label[data-id="${pid}"]`);
  const groupSelect = document.querySelector(`.player-group-select[data-id="${pid}"]`);
  const editBtn = document.querySelector(`.edit-player-btn[data-id="${pid}"]`);
  const saveBtn = document.querySelector(`.save-player-btn[data-id="${pid}"]`);
  const cancelBtn = document.querySelector(`.cancel-player-btn[data-id="${pid}"]`);
  if (nameSpan && nameInput) { nameSpan.style.display = editing ? "none" : ""; nameInput.style.display = editing ? "inline-block" : "none"; }
  if (groupSpan && groupSelect) { groupSpan.style.display = editing ? "none" : ""; groupSelect.style.display = editing ? "inline-block" : "none"; }
  if (editBtn) editBtn.style.display = editing ? "none" : "";
  if (saveBtn) saveBtn.style.display = editing ? "" : "none";
  if (cancelBtn) cancelBtn.style.display = editing ? "" : "none";
}

async function savePlayerEdit(pid) {
  if (!isAdmin) return;
  const player = getPlayerById(pid);
  const nameInput = document.querySelector(`.player-name-input[data-id="${pid}"]`);
  const groupSelect = document.querySelector(`.player-group-select[data-id="${pid}"]`);
  if (!player || !nameInput || !groupSelect) return;
  const newName = nameInput.value.trim();
  const newGroupId = groupSelect.value;
  if (!newName || !newGroupId) {
    alert("Adj meg nevet és csoportot.");
    return;
  }
  if (state.players.some(p => p.id !== pid && p.groupId === newGroupId && p.name.toLowerCase() === newName.toLowerCase())) {
    alert("Ilyen nevű játékos már van ebben a csoportban.");
    return;
  }
  await updateDoc(doc(db, "players", pid), { name: newName, groupId: newGroupId });
  exitPlayerEdit(pid);
}

if (playersTableBody) {
  playersTableBody.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const pid = btn.dataset.id;
    if (btn.classList.contains("save-penalty-btn")) {
      const val = parseInt(document.querySelector(`.penalty-input[data-id="${pid}"]`)?.value) || 0;
      await updateDoc(doc(db, "players", pid), { adjustment: val });
      alert("Pontmódosítás mentve!");
      return;
    }
    if (btn.classList.contains("del-player")) {
      deletePlayer(pid);
      return;
    }
    if (btn.classList.contains("edit-player-btn")) {
      enterPlayerEdit(pid);
      return;
    }
    if (btn.classList.contains("cancel-player-btn")) {
      exitPlayerEdit(pid);
      return;
    }
    if (btn.classList.contains("save-player-btn")) {
      savePlayerEdit(pid);
      return;
    }
  });
}

async function deletePlayer(pid) {
  if (!isAdmin || !confirm("Törlöd a játékost és minden kapcsolódó meccset?")) return;
  const related = state.matches.filter(m => m.homeId === pid || m.awayId === pid);
  for (const m of related) await deleteDoc(doc(db, "matches", m.id));
  await deleteDoc(doc(db, "players", pid));
}

// --- TABELLA SZÁMOLÁS ---
function computeStandingsForGroup(gid) {
  const players = getPlayersByGroup(gid);
  const stats = new Map();
  players.forEach(p => stats.set(p.id, {player: p, played: 0, win: 0, draw: 0, loss: 0, goalsFor: 0, goalsAgainst: 0, adjustment: p.adjustment || 0}));
  
  state.matches.filter(m => m.groupId === gid).forEach(m => {
    const h = stats.get(m.homeId); const a = stats.get(m.awayId);
    if (!h || !a) return;
    h.played++; a.played++;
    h.goalsFor += m.homeGoals; h.goalsAgainst += m.awayGoals;
    a.goalsFor += m.awayGoals; a.goalsAgainst += m.homeGoals;
    if (m.homeGoals > m.awayGoals) { h.win++; a.loss++; }
    else if (m.homeGoals < m.awayGoals) { a.win++; h.loss++; }
    else { h.draw++; a.draw++; }
  });

  const rows = Array.from(stats.values());
  rows.sort((a,b) => {
    const pa = (a.win*3 + a.draw) + a.adjustment;
    const pb = (b.win*3 + b.draw) + b.adjustment;
    if (pa !== pb) return pb - pa;
    const ga = a.goalsFor - a.goalsAgainst, gb = b.goalsFor - b.goalsAgainst;
    if (ga !== gb) return gb - ga;
    return b.goalsFor - a.goalsFor || a.player.name.localeCompare(b.player.name);
  });
  return rows;
}

const tablesContainer = document.getElementById("tables-container");
function renderDashboardTables() {
  if (!tablesContainer) return;
  tablesContainer.innerHTML = "";
  if (state.groups.length === 0) {
    tablesContainer.innerHTML = "<div class='card'><p class='muted'>Nincs adat</p></div>";
    return;
  }
  getSortedGroups().forEach(g => {
    const stats = computeStandingsForGroup(g.id);
    const card = document.createElement("div");
    card.className = "group-table-card";
    card.innerHTML = `<div class="group-table-header"><h3>${g.name}</h3><span>${stats.length} játékos | ${state.matches.filter(m=>m.groupId===g.id).length} meccs</span></div>`;
    if (stats.length) {
      const table = document.createElement("table");
      table.className = "data-table";
      table.innerHTML = `<thead><tr><th>#</th><th>Játékos</th><th>M</th><th>Gy</th><th>D</th><th>V</th><th>LG</th><th>KG</th><th>GK</th><th>P</th></tr></thead><tbody></tbody>`;
      stats.forEach((s,i) => {
        const pts = (s.win*3 + s.draw) + s.adjustment;
        const gd = s.goalsFor - s.goalsAgainst;
        let adjustmentInfo = "";
        if (s.adjustment > 0) {
          adjustmentInfo = ` <small class="pts-plus">(+${s.adjustment} BP)</small>`;
        } else if (s.adjustment < 0) {
          adjustmentInfo = ` <small class="pts-minus">(${s.adjustment} BP)</small>`;
        }
        const tr = document.createElement("tr");
        if (i===0 && s.played>0) tr.classList.add("highlight");
        tr.innerHTML = `<td>${i+1}</td><td class="left">${s.player.name}${adjustmentInfo}</td><td>${s.played}</td><td>${s.win}</td><td>${s.draw}</td><td>${s.loss}</td><td>${s.goalsFor}</td><td>${s.goalsAgainst}</td><td>${gd}</td><td style="${s.adjustment !== 0 ? (s.adjustment > 0 ? 'color:var(--accent-gold)' : 'color:#ef4444') : ''}">${pts}</td>`;
        table.querySelector("tbody").appendChild(tr);
      });
      card.appendChild(table);
    }
    tablesContainer.appendChild(card);
  });
}

const matchesTableBody = document.getElementById("matchesTableBody");
function renderMatchesTable() {
  if (!matchesTableBody) return;
  matchesTableBody.innerHTML = "";
  if (state.matches.length === 0) {
    matchesTableBody.innerHTML = "<tr><td colspan='7' class='muted'>Nincs meccs</td></tr>";
    return;
  }
  state.matches.forEach((m,i) => {
    const tr = document.createElement("tr");
    const g = getGroupById(m.groupId);
    const h = getPlayerById(m.homeId);
    const a = getPlayerById(m.awayId);
    const date = m.createdAt ? new Date(m.createdAt.toDate()).toLocaleString("hu-HU") : "";
    tr.innerHTML = `<td>${i+1}</td><td>${g?.name || "-"}</td><td class="left">${h?.name || "?"}</td><td>${m.homeGoals}:${m.awayGoals}</td><td class="left">${a?.name || "?"}</td><td>${date}</td><td class="admin-only-inline"><button data-id="${m.id}" class="danger-btn del-group-match">Törlés</button></td>`;
    matchesTableBody.appendChild(tr);
  });
  
  document.querySelectorAll(".del-group-match").forEach(btn => {
    btn.onclick = async () => {
      if (!isAdmin || !confirm("Biztosan törlöd ezt a meccset?")) return;
      await deleteDoc(doc(db, "matches", btn.dataset.id));
    };
  });
}

const clearAllBtn = document.getElementById("clearAllBtn");
if (clearAllBtn) {
    clearAllBtn.onclick = async () => {
      if (!isAdmin || !confirm("Minden adat törlése?")) return;
      for (const col of [groupsCol, playersCol, matchesCol, playoffMatchesCol, playinPairsCol]) {
        const snap = await getDocs(col);
        for (const d of snap.docs) await deleteDoc(doc(db, col.path, d.id));
      }
    };
}

// --- PLAYOFF LOGIKA ---
const playoffBracketContainer = document.getElementById("playoff-bracket-container");
const playoffPlayinResults = document.getElementById("playoff-playin-results");

function getQualified() {
  const direct = [];
  const playin = [];
  state.groups.forEach(g => {
    const standing = computeStandingsForGroup(g.id);
    if (standing[0]) direct.push(standing[0].player.id);
    if (standing[1]) playin.push(standing[1].player.id);
    if (standing[2]) playin.push(standing[2].player.id);
  });
  return { direct, playin };
}

function getAggregatedGoals(round) {
  const agg = new Map();
  state.playoffMatches.filter(m => m.round === round).forEach(m => {
    const key = [m.homeId, m.awayId].sort().join('-');
    if (!agg.has(key)) agg.set(key, {homeId: m.homeId, awayId: m.awayId, homeTotal: 0, awayTotal: 0});
    const data = agg.get(key);
    data.homeTotal += m.homeGoals;
    data.awayTotal += m.awayGoals;
  });
  return Array.from(agg.values());
}

function getWinners(round) {
  const winners = [];
  getAggregatedGoals(round).forEach(p => {
    if (p.homeTotal > p.awayTotal) winners.push(p.homeId);
    else if (p.awayTotal > p.homeTotal) winners.push(p.awayId);
  });
  return winners;
}

function getLosers(round) {
  const losers = [];
  getAggregatedGoals(round).forEach(p => {
    if (p.homeTotal < p.awayTotal) losers.push(p.homeId);
    else if (p.awayTotal < p.homeTotal) losers.push(p.awayId);
  });
  return losers;
}

function renderPlayinResults() {
  const playinResultsContainer = document.getElementById("playoff-playin-results");
  if (!playinResultsContainer) return;
  
  const playinMatches = state.playoffMatches.filter(m => m.round === 'playin');
  
  // Mentsd el a jelenlegi display állapotot
  const currentDisplay = playinResultsContainer.style.display;
  
  if (playinMatches.length === 0) {
    playinResultsContainer.innerHTML = '<div class="playin-no-match">Még nincs Play-in eredmény</div>';
    return;
  }
  
  playinResultsContainer.innerHTML = "";
  
  playinMatches.sort((a,b) => (a.createdAt?.seconds||0) - (b.createdAt?.seconds||0)).forEach(m => {
    const h = getPlayerById(m.homeId);
    const a = getPlayerById(m.awayId);
    const winner = m.homeGoals > m.awayGoals ? 'home' : m.awayGoals > m.homeGoals ? 'away' : 'draw';
    
    const matchDiv = document.createElement("div");
    matchDiv.className = "playin-result-match";
    matchDiv.innerHTML = `
      <div class="playin-match-left">
        <div class="playin-team-name ${winner === 'home' ? 'winner' : ''}">${h?.name || "?"}</div>
      </div>
      <div class="playin-match-center">
        <div class="playin-score">${m.homeGoals}:${m.awayGoals}</div>
      </div>
      <div class="playin-match-right">
        <div class="playin-team-name ${winner === 'away' ? 'winner' : ''}">${a?.name || "?"}</div>
      </div>
    `;
    playinResultsContainer.appendChild(matchDiv);
  });
  
  // Állítsd vissza a display állapotot
  if (currentDisplay) {
    playinResultsContainer.style.display = currentDisplay;
  }
}

function renderPlayoffBracket() {
  // Top 16 lista feltöltése
  const top16List = document.getElementById('top16-list');
  if (!top16List) return;
  
  const {direct, playin} = getQualified();
  const playinWinners = getWinners('playin');
  const top16 = [...direct, ...playinWinners];
  
  top16List.innerHTML = '';
  if (top16.length === 0) {
    top16List.innerHTML = '<p class="muted">A csoportkör után jelenik meg</p>';
  } else {
    top16.forEach((playerId, index) => {
      const player = getPlayerById(playerId);
      const playerDiv = document.createElement('div');
      playerDiv.style.cssText = 'padding: 10px; background: linear-gradient(135deg, rgba(0,212,255,0.1), rgba(212,175,55,0.1)); border: 1px solid rgba(0,212,255,0.3); border-radius: 6px;';
      playerDiv.innerHTML = `<strong style="color: #00d4ff;">${index + 1}.</strong> ${player?.name || 'Ismeretlen'}`;
      top16List.appendChild(playerDiv);
    });
  }
  
  // Bracket adatok feltöltése
  const bracketData = buildBracketStructure();
  
  // Nyolcaddöntő feltöltése
  bracketData.round16.forEach((match, idx) => {
    fillMatchData(`r16-${idx + 1}`, match);
  });
  
  // Negyeddöntő feltöltése
  bracketData.quarter.forEach((match, idx) => {
    fillMatchData(`q-${idx + 1}`, match);
  });
  
  // Elődöntő feltöltése
  bracketData.semi.forEach((match, idx) => {
    fillMatchData(`s-${idx + 1}`, match);
  });
  
  // Döntő feltöltése
  if (bracketData.final.length > 0) {
    fillMatchData('f-1', bracketData.final[0]);
  }
  
  // Bronzmeccs feltöltése
  if (bracketData.bronze.length > 0) {
    fillMatchData('b-1', bracketData.bronze[0]);
  }
}

// Meccs adatok kitöltése a HTML struktúrában
function fillMatchData(matchId, matchData) {
  const matchEl = document.querySelector(`[data-match="${matchId}"]`);
  if (!matchEl) return;
  
  const homeName = matchData ? getPlayerById(matchData.homeId)?.name || "?" : "-";
  const awayName = matchData ? getPlayerById(matchData.awayId)?.name || "?" : "-";
  const homeScore = matchData ? matchData.homeTotal : 0;
  const awayScore = matchData ? matchData.awayTotal : 0;
  
  const winner = homeScore > awayScore ? 'home' : awayScore > homeScore ? 'away' : '';
  
  const teams = matchEl.querySelectorAll('.team');
  if (teams[0]) {
    teams[0].className = `team ${winner === 'home' ? 'winner' : ''}`;
    teams[0].querySelector('.name').textContent = homeName;
    teams[0].querySelector('.score').textContent = homeScore;
  }
  if (teams[1]) {
    teams[1].className = `team ${winner === 'away' ? 'winner' : ''}`;
    teams[1].querySelector('.name').textContent = awayName;
    teams[1].querySelector('.score').textContent = awayScore;
  }
}

// Bracket struktúra építése automatikus továbbjutással
function buildBracketStructure() {
  const structure = {
    round16: [],
    quarter: [],
    semi: [],
    final: [],
    bronze: []
  };
  
  // Nyolcaddöntő: Valós meccsek
  const round16Pairs = getAggregatedGoals('round16');
  structure.round16 = round16Pairs;
  
  // Negyeddöntő: Round16 győzteseiből
  const round16Winners = [];
  round16Pairs.forEach(p => {
    if (p.homeTotal > p.awayTotal) round16Winners.push(p.homeId);
    else if (p.awayTotal > p.homeTotal) round16Winners.push(p.awayId);
  });
  
  // Ha van valós negyeddöntő meccs, használjuk azt, különben generáljuk
  const quarterPairs = getAggregatedGoals('quarter');
  if (quarterPairs.length > 0) {
    structure.quarter = quarterPairs;
  } else if (round16Winners.length >= 2) {
    // Automatikus párosítás: 1v8, 2v7, 3v6, 4v5 alapon
    for (let i = 0; i < round16Winners.length; i += 2) {
      if (round16Winners[i + 1]) {
        structure.quarter.push({
          homeId: round16Winners[i],
          awayId: round16Winners[i + 1],
          homeTotal: 0,
          awayTotal: 0
        });
      }
    }
  }
  
  // Elődöntő: Quarter győzteseiből
  const quarterWinners = [];
  structure.quarter.forEach(p => {
    if (p.homeTotal > p.awayTotal) quarterWinners.push(p.homeId);
    else if (p.awayTotal > p.homeTotal) quarterWinners.push(p.awayId);
  });
  
  const semiPairs = getAggregatedGoals('semi');
  if (semiPairs.length > 0) {
    structure.semi = semiPairs;
  } else if (quarterWinners.length >= 2) {
    for (let i = 0; i < quarterWinners.length; i += 2) {
      if (quarterWinners[i + 1]) {
        structure.semi.push({
          homeId: quarterWinners[i],
          awayId: quarterWinners[i + 1],
          homeTotal: 0,
          awayTotal: 0
        });
      }
    }
  }
  
  // Döntő és Bronzmeccs
  const semiWinners = [];
  const semiLosers = [];
  structure.semi.forEach(p => {
    if (p.homeTotal > p.awayTotal) {
      semiWinners.push(p.homeId);
      semiLosers.push(p.awayId);
    } else if (p.awayTotal > p.homeTotal) {
      semiWinners.push(p.awayId);
      semiLosers.push(p.homeId);
    }
  });
  
  const finalPairs = getAggregatedGoals('final');
  if (finalPairs.length > 0) {
    structure.final = finalPairs;
  } else if (semiWinners.length >= 2) {
    structure.final.push({
      homeId: semiWinners[0],
      awayId: semiWinners[1],
      homeTotal: 0,
      awayTotal: 0
    });
  }
  
  const bronzePairs = getAggregatedGoals('bronze');
  if (bronzePairs.length > 0) {
    structure.bronze = bronzePairs;
  } else if (semiLosers.length >= 2) {
    structure.bronze.push({
      homeId: semiLosers[0],
      awayId: semiLosers[1],
      homeTotal: 0,
      awayTotal: 0
    });
  }
  
  return structure;
}

// --- ADMIN PLAYOFF KEZELÉS ---

function renderAdminPlayoffMatches() {
    const adminTableBody = document.getElementById("adminPlayoffMatchesTableBody");
    if (!adminTableBody) return;

    adminTableBody.innerHTML = "";
    if (state.playoffMatches.length === 0) {
        adminTableBody.innerHTML = "<tr><td colspan='5' class='muted'>Nincs rögzített playoff meccs</td></tr>";
        return;
    }

    const roundNames = {
        playin: "Play-in",
        round16: "Nyolcaddöntő",
        quarter: "Negyeddöntő",
        semi: "Elődöntő",
        final: "Döntő",
        bronze: "Bronzmeccs"
    };

    // Duplikáció ellenőrzés - csak akkor hiba, ha túl sok meccs van
    const duplicates = new Set();
    const pairKeys = new Map();
    
    state.playoffMatches.forEach(m => {
        const key = `${m.round}-${[m.homeId, m.awayId].sort().join('-')}`;
        pairKeys.set(key, (pairKeys.get(key) || 0) + 1);
    });
    
    // Jelöljük duplikáltnak, ha túl sok meccs van (final/bronze: >1, többi: >2)
    pairKeys.forEach((count, key) => {
        const round = key.split('-')[0];
        const maxAllowed = (round === 'final' || round === 'bronze') ? 1 : 2;
        if (count > maxAllowed) {
            duplicates.add(key);
        }
    });

    state.playoffMatches.forEach(m => {
        const h = getPlayerById(m.homeId);
        const a = getPlayerById(m.awayId);
        const key = `${m.round}-${[m.homeId, m.awayId].sort().join('-')}`;
        const isDuplicate = duplicates.has(key);
        const tr = document.createElement("tr");
        
        if (isDuplicate) {
            tr.style.backgroundColor = "rgba(255, 68, 68, 0.2)";
            tr.style.borderLeft = "3px solid #ff4444";
        }

        tr.innerHTML = `
            <td>${roundNames[m.round] || m.round}</td>
            <td class="left">${h?.name || "?"} vs ${a?.name || "?"} ${isDuplicate ? '<span style="color: #ff4444; font-weight: bold;">⚠️ DUPLIKÁLT</span>' : ''}</td>
            <td>${m.homeGoals}:${m.awayGoals}</td>
            <td>${new Date(m.createdAt?.seconds * 1000 || Date.now()).toLocaleString('hu-HU', {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'})}</td>
            <td><button data-id="${m.id}" class="danger-btn del-playoff-match">Törlés</button></td>
        `;
        adminTableBody.appendChild(tr);
    });

    document.querySelectorAll(".del-playoff-match").forEach(btn => {
        btn.onclick = async () => {
            if (confirm("Biztosan törlöd ezt a playoff meccset?")) {
                await deleteDoc(doc(db, "playoff_matches", btn.dataset.id));
            }
        };
    });
}

// --- PLAYOFF ADMIN NÉZET ---
const playinPairSetup = document.getElementById("playin-pair-setup");
const playoffRoundSelect = document.getElementById("playoffRoundSelect");
const playoffHomeSelect = document.getElementById("playoffHomeSelect");
const playoffAwaySelect = document.getElementById("playoffAwaySelect");
const playoffHomeGoals = document.getElementById("playoffHomeGoals");
const playoffAwayGoals = document.getElementById("playoffAwayGoals");
const addPlayoffMatchBtn = document.getElementById("addPlayoffMatchBtn");
const playoffMatchMessage = document.getElementById("playoffMatchMessage");
const archiveNameInput = document.getElementById("archiveNameInput");
const saveArchiveBtn = document.getElementById("saveArchiveBtn");
const archiveMessage = document.getElementById("archiveMessage");

function renderPlayoffAdmin() {
  if (!playinPairSetup) return;
  const { playin } = getQualified();
  playinPairSetup.innerHTML = "<h5>Play-in párosítások (8 meccs hely)</h5>";
  for (let i = 0; i < 8; i++) {
    const row = document.createElement("div");
    row.className = "playin-pair-row";
    row.style = "margin-bottom: 5px;";
    row.innerHTML = `<select class="playin-h-${i}"></select> <span>vs</span> <select class="playin-a-${i}"></select>`;
    playinPairSetup.appendChild(row);
    const hs = row.querySelector(`.playin-h-${i}`);
    const as = row.querySelector(`.playin-a-${i}`);
    [hs, as].forEach(s => {
        s.innerHTML = "<option value=''>--</option>";
        playin.forEach(id => {
          const name = getPlayerById(id)?.name || "?";
          const opt = document.createElement("option");
          opt.value = id; opt.textContent = name;
          s.appendChild(opt);
        });
    });
  }
  
  // Betöltés ha van mentett
  state.playinPairs.forEach((p, i) => {
    if (i < 8) {
      document.querySelector(`.playin-h-${i}`).value = p.homeId;
      document.querySelector(`.playin-a-${i}`).value = p.awayId;
    }
  });
  
  // Mentés gomb
  const saveBtn = document.createElement("button");
  saveBtn.textContent = state.playinPairs.length > 0 ? "Párok módosítása és mentése" : "Párok mentése";
  saveBtn.onclick = async () => {
    if (!isAdmin) return;
    const pairs = [];
    for (let i = 0; i < 8; i++) {
      const h = document.querySelector(`.playin-h-${i}`).value;
      const a = document.querySelector(`.playin-a-${i}`).value;
      if (h && a && h !== a) pairs.push({homeId: h, awayId: a});
    }
    if (pairs.length < 8) { alert("Tölts ki minden párt!"); return; }
    // Töröld a régieket
    const snap = await getDocs(playinPairsCol);
    for (const d of snap.docs) await deleteDoc(d.ref);
    // Mentsd az újakat
    for (const p of pairs) await addDoc(playinPairsCol, p);
    alert("Play-in párok mentve!");
  };
  playinPairSetup.appendChild(saveBtn);
  
  refreshPlayoffSelects();
}

function refreshPlayoffSelects() {
  const round = playoffRoundSelect?.value || "";
  let available = [];
  const q = getQualified();
  if (round === "playin") {
    if (state.playinPairs.length > 0) {
      [playoffHomeSelect, playoffAwaySelect].forEach(sel => {
        sel.innerHTML = "<option value=''>-- Válassz --</option>";
      });
      state.playinPairs.forEach(p => {
        const optH = document.createElement("option");
        optH.value = p.homeId;
        optH.textContent = getPlayerById(p.homeId)?.name;
        playoffHomeSelect.appendChild(optH);
        const optA = document.createElement("option");
        optA.value = p.awayId;
        optA.textContent = getPlayerById(p.awayId)?.name;
        playoffAwaySelect.appendChild(optA);
      });
      return;
    } else {
      available = q.playin;
    }
  } else if (round === "round16") available = q.direct.concat(getWinners("playin"));
  else if (round === "quarter") available = getWinners("round16");
  else if (round === "semi") available = getWinners("quarter");
  else if (round === "final") available = getWinners("semi");
  else if (round === "bronze") available = getLosers("semi");
  
  [playoffHomeSelect, playoffAwaySelect].forEach(sel => {
    if (sel) {
        sel.innerHTML = "<option value=''>-- Válassz --</option>";
        available.forEach(id => {
          const opt = document.createElement("option");
          opt.value = id;
          opt.textContent = getPlayerById(id)?.name || "?";
          sel.appendChild(opt);
        });
    }
  });
}
if (playoffRoundSelect) playoffRoundSelect.addEventListener("change", refreshPlayoffSelects);

if (addPlayoffMatchBtn) {
    addPlayoffMatchBtn.onclick = async () => {
      if (!isAdmin) return;
      const round = playoffRoundSelect.value;
      const home = playoffHomeSelect.value;
      const away = playoffAwaySelect.value;
      const hg = parseInt(playoffHomeGoals.value) || 0;
      const ag = parseInt(playoffAwayGoals.value) || 0;
      if (!round || !home || !away || home === away || hg < 0 || ag < 0) {
        playoffMatchMessage.textContent = "Hibás adatok";
        return;
      }
      if (round === "playin" && state.playinPairs.length > 0) {
        const isValidPair = state.playinPairs.some(p => 
          (p.homeId === home && p.awayId === away) || (p.homeId === away && p.awayId === home)
        );
        if (!isValidPair) {
          playoffMatchMessage.textContent = "Nem érvényes play-in pár!";
          return;
        }
      }
      
      // Ellenőrizzük a meccsek számát ugyanazzal a párossal ugyanabban a körben
      const existingMatches = state.playoffMatches.filter(m => 
        m.round === round && 
        ((m.homeId === home && m.awayId === away) || (m.homeId === away && m.awayId === home))
      );
      
      // Döntő és bronzmeccs: max 1 meccs, többi: max 2 meccs (oda-visszavágó)
      const maxMatches = (round === 'final' || round === 'bronze') ? 1 : 2;
      
      if (existingMatches.length >= maxMatches) {
        const msg = maxMatches === 1 
          ? "⚠️ Már van meccs ezzel a párossal! (Döntő/Bronz - nincs visszavágó)"
          : "⚠️ Már 2 meccs van ezzel a párossal! (oda-visszavágó teljes)";
        playoffMatchMessage.textContent = msg;
        playoffMatchMessage.style.color = "#ff4444";
        setTimeout(() => {
          playoffMatchMessage.style.color = "";
        }, 3000);
        return;
      }
      
      await addDoc(playoffMatchesCol, { round, homeId: home, awayId: away, homeGoals: hg, awayGoals: ag, createdAt: serverTimestamp() });
      playoffHomeGoals.value = playoffAwayGoals.value = "0";
      playoffMatchMessage.textContent = "Meccs mentve";
      playoffMatchMessage.style.color = "#00d4ff";
      setTimeout(() => {
        playoffMatchMessage.textContent = "";
      }, 2000);
    };
}

// --- BAJNOKSÁG ARCHÍV MENTÉS ---
function deriveChampion() {
  const final = state.playoffMatches.find(m => m.round === "final");
  if (!final) return null;
  const home = getPlayerById(final.homeId);
  const away = getPlayerById(final.awayId);
  if (final.homeGoals === final.awayGoals) return null;
  const winner = final.homeGoals > final.awayGoals ? home : away;
  const loser = final.homeGoals > final.awayGoals ? away : home;
  return {
    winnerId: winner?.id,
    winnerName: winner?.name || "-",
    runnerUpName: loser?.name || "-",
    finalScore: `${final.homeGoals}:${final.awayGoals}`,
    pairing: `${home?.name || "?"} vs ${away?.name || "?"}`
  };
}

async function saveArchive() {
  if (!isAdmin) {
    if (archiveMessage) archiveMessage.textContent = "Csak admin menthet";
    return;
  }
  if (archiveMessage) archiveMessage.textContent = "Mentés...";

  const name = (archiveNameInput?.value || "").trim() || `HRL Bajnokság ${new Date().toLocaleDateString('hu-HU')}`;
  const champion = deriveChampion();
  const payload = {
    name,
    finishedAt: serverTimestamp(),
    champion,
    groups: state.groups,
    players: state.players,
    matches: state.matches,
    playoffMatches: state.playoffMatches,
    playinPairs: state.playinPairs
  };

  try {
    await addDoc(archivesCol, payload);
    if (archiveNameInput) archiveNameInput.value = "";
    if (archiveMessage) archiveMessage.textContent = "Bajnokság elmentve az archívumba (Firebase)";
    alert("Bajnokság elmentve! Az archívot a főoldalon tudod megnézni.");
  } catch (error) {
    console.error("Archív mentési hiba:", error);
    if (archiveMessage) archiveMessage.textContent = `Hiba: ${error.message}`;
  }
}

function updateArchiveDisplay() {
  renderArchiveList(); // Mindig frissítse, nem csak ha aktív a view
}

function renderArchiveList() {
  const container = document.getElementById("archiveListContainer");
  if (!container) return;
  
  if (state.archives.length === 0) {
    container.innerHTML = "<p class='muted'>Még nincs mentett bajnokság.</p>";
    return;
  }
  
  let html = "<div class='archive-list'>";
  state.archives.forEach(archive => {
    const date = archive.finishedAt?.toDate ? archive.finishedAt.toDate().toLocaleDateString('hu-HU') : "Ismeretlen dátum";
    const championName = archive.champion?.winnerName || "Nincs adat";
    const finalScore = archive.champion?.finalScore || "-";
    
    html += `
      <div class="archive-card">
        <h3>${archive.name}</h3>
        <p><strong>Befejezve:</strong> ${date}</p>
        <p><strong>Bajnok:</strong> ${championName}</p>
        <p><strong>Döntő:</strong> ${finalScore}</p>
        <button class="view-archive-btn" data-id="${archive.id}">Megtekintés</button>
        ${isAdmin ? `<button class="delete-archive-btn" data-id="${archive.id}">Törlés</button>` : ''}
      </div>
    `;
  });
  html += "</div>";
  
  container.innerHTML = html;
  
  // Event listener a gombokhoz
  container.querySelectorAll('.delete-archive-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.getAttribute('data-id');
      if (confirm('Biztos törlöd ezt a bajnokságot?')) {
        await deleteDoc(doc(db, 'archives', id));
        alert('Bajnokság törölve!');
      }
    });
  });
  
  container.querySelectorAll('.view-archive-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.getAttribute('data-id');
      alert('Megtekintés funkció hamarosan! Archív ID: ' + id);
      // Itt később implementálható a részletes nézet
    });
  });
}

if (saveArchiveBtn) {
  saveArchiveBtn.onclick = saveArchive;
}

// Play-in toggle gomb
const togglePlayinBtn = document.getElementById("togglePlayinBtn");

if (togglePlayinBtn) {
  togglePlayinBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const playinResults = document.getElementById("playoff-playin-results");
    if (!playinResults) return;
    
    const isHidden = playinResults.style.display === "none";
    playinResults.style.display = isHidden ? "grid" : "none";
    
    togglePlayinBtn.innerHTML = `<span id="togglePlayinIcon">${isHidden ? "▲" : "▼"}</span> Play-in meccsek ${isHidden ? "elrejtése" : "megjelenítése"}`;
  });
}

// Kezdés
refreshUI();

} // initApp() vége

// DOM betöltése után indítjuk az appot
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
