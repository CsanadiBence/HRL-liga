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

const groupsCol = collection(db, "groups");
const playersCol = collection(db, "players");
const matchesCol = collection(db, "matches");
const playoffMatchesCol = collection(db, "playoff_matches");
const playinPairsCol = collection(db, "playin_pairs");
const archivesCol = collection(db, "archives");

const ARCHIVE_KEY = "hrl_archives";

let state = { groups: [], players: [], matches: [], playoffMatches: [], playinPairs: [], archives: [] };
let unsub = [];

const ADMIN_HASH = "4e47b24610ae57629ee12de107d43f42eb9d4530c0d20d993363a13d2c334e9b";
let isAdmin = localStorage.getItem("ifi2_isAdmin") === "1";

// --- ADMIN LOGIN LOGIC ---
const adminPasswordInput = document.getElementById("adminPasswordInput");
const adminLoginBtn = document.getElementById("adminLoginBtn");
const adminLogoutBtn = document.getElementById("adminLogoutBtn");
const adminLoginMsg = document.getElementById("adminLoginMsg");
const adminLoggedOut = document.getElementById("adminLoggedOut");
const adminLoggedIn = document.getElementById("adminLoggedIn");

async function hashString(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

adminLoginBtn.addEventListener("click", async () => {
  const hash = await hashString(adminPasswordInput.value);
  if (hash === ADMIN_HASH) {
    isAdmin = true;
    localStorage.setItem("ifi2_isAdmin", "1");
    updateAdminUI();
    adminLoginMsg.textContent = "Sikeres belépés";
    adminPasswordInput.value = "";
    refreshUI();
  } else {
    adminLoginMsg.textContent = "Hibás jelszó";
  }
});

adminLogoutBtn.addEventListener("click", () => {
  isAdmin = false;
  localStorage.removeItem("ifi2_isAdmin");
  updateAdminUI();
  refreshUI();
});

function updateAdminUI() {
  document.querySelectorAll(".admin-only-view, .admin-only-nav, .admin-only-inline").forEach(el => el.style.display = isAdmin ? "" : "none");
  adminLoggedOut.style.display = isAdmin ? "none" : "";
  adminLoggedIn.style.display = isAdmin ? "" : "none";
}
updateAdminUI();

// --- LISTENERS ---
function startListeners() {
  unsub.push(onSnapshot(groupsCol, snap => { state.groups = snap.docs.map(d => ({id: d.id, ...d.data()})); refreshUIFast(); }));
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
  renderGroupList();
  refreshGroupSelects();
  refreshMatchPlayerSelects();
  renderPlayersTable();
  renderDashboardTables();
  renderMatchesTable();
  renderPlayinResults();
  renderPlayoffBracket();
  
  if (isAdmin) {
    renderAdminPlayoffMatches();
  }
  
  if (document.querySelector("#view-playoff_admin.active")) {
      renderPlayoffAdmin();
  }
}

function refreshUIFast() {
  // Csak a szükséges részeket frissítsd
  renderGroupList();
  refreshGroupSelects();
  refreshMatchPlayerSelects();
}

// --- NAVIGÁCIÓ ---
document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.view;
    if ((target === "groups" || target === "players" || target === "playoff_admin") && !isAdmin) return;
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === `view-${target}`));
    refreshUI();
  });
});

// --- CSOPORT KEZELÉS ---
const groupNameInput = document.getElementById("groupNameInput");
const addGroupBtn = document.getElementById("addGroupBtn");
const groupMessage = document.getElementById("groupMessage");
const groupList = document.getElementById("groupList");

addGroupBtn.addEventListener("click", async () => {
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
    playerCountInfo.textContent = "";
    return;
  }
  const sorted = [...state.players].sort((a,b) => a.name.localeCompare(b.name));
  playerCountInfo.textContent = `Összesen: ${sorted.length}`;
  sorted.forEach(p => {
    const tr = document.createElement("tr");
    const group = getGroupById(p.groupId);
    tr.innerHTML = `
      <td class="left">${p.name}</td>
      <td>${group?.name || "-"}</td>
      <td>
        <input type="number" class="penalty-input" data-id="${p.id}" value="${p.adjustment || 0}" style="width:50px;">
        <button class="save-penalty-btn" data-id="${p.id}" style="padding:4px 8px; font-size:11px;">Mentés</button>
      </td>
      <td><button data-id="${p.id}" class="danger-btn del-player">Törlés</button></td>
    `;
    playersTableBody.appendChild(tr);
  });

  document.querySelectorAll(".save-penalty-btn").forEach(btn => {
    btn.onclick = async () => {
      const pid = btn.dataset.id;
      const val = parseInt(document.querySelector(`.penalty-input[data-id="${pid}"]`).value) || 0;
      await updateDoc(doc(db, "players", pid), { adjustment: val });
      alert("Pontmódosítás mentve!");
    };
  });
  document.querySelectorAll(".del-player").forEach(btn => btn.onclick = () => deletePlayer(btn.dataset.id));
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
  if (!playoffPlayinResults) return;
  playoffPlayinResults.innerHTML = "";
  
  const playinMatches = state.playoffMatches.filter(m => m.round === 'playin');
  
  if (playinMatches.length === 0) {
    playoffPlayinResults.innerHTML = '<div class="playin-no-match">Még nincs Play-in eredmény</div>';
    return;
  }
  
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
    playoffPlayinResults.appendChild(matchDiv);
  });
}

function renderPlayoffBracket() {
  if (!playoffBracketContainer) return;
  playoffBracketContainer.innerHTML = "";
  const bracket = document.createElement("div");
  bracket.className = "bracket-container";
  
  const rounds = [
    {name: "Nyolcaddöntő", key: "round16", cols: 2},
    {name: "Negyeddöntő", key: "quarter", cols: 3},
    {name: "Elődöntő", key: "semi", cols: 4},
    {name: "Döntő", key: "final", cols: 5},
    {name: "Bronzmeccs", key: "bronze", cols: 5}
  ];
  
  rounds.forEach((r, idx) => {
    const roundDiv = document.createElement("div");
    roundDiv.className = "bracket-round";
    roundDiv.setAttribute("data-round", r.key);
    roundDiv.innerHTML = `<div class="round-title">${r.name}</div>`;
    
    let pairs = getAggregatedGoals(r.key);
    
    const matchesDiv = document.createElement("div");
    matchesDiv.className = "matches";

    if (pairs.length === 0) {
      matchesDiv.innerHTML = "<div class='no-match'>Még nincs meccs</div>";
    } else {
      pairs.forEach(p => {
        const homeName = getPlayerById(p.homeId)?.name || "?";
        const awayName = getPlayerById(p.awayId)?.name || "?";
        const winner = p.homeTotal > p.awayTotal ? 'home' : p.awayTotal > p.homeTotal ? 'away' : 'draw';
        
        const matchDiv = document.createElement("div");
        matchDiv.className = "bracket-match";
        matchDiv.innerHTML = `
          <div class="match-box">
            <div class="team ${winner === 'home' ? 'winner' : ''}">
              <span class="team-name">${homeName}</span>
              <span class="score">${p.homeTotal}</span>
            </div>
            <div class="vs">vs</div>
            <div class="team ${winner === 'away' ? 'winner' : ''}">
              <span class="team-name">${awayName}</span>
              <span class="score">${p.awayTotal}</span>
            </div>
          </div>
        `;
        matchesDiv.appendChild(matchDiv);
      });
    }
    
    roundDiv.appendChild(matchesDiv);
    bracket.appendChild(roundDiv);
  });
  
  playoffBracketContainer.appendChild(bracket);
}

// --- ADMIN PLAYOFF KEZELÉS ---

function renderAdminPlayoffMatches() {
    const adminTableBody = document.getElementById("adminPlayoffMatchesTableBody");
    if (!adminTableBody) return;

    adminTableBody.innerHTML = "";
    if (state.playoffMatches.length === 0) {
        adminTableBody.innerHTML = "<tr><td colspan='4' class='muted'>Nincs rögzített playoff meccs</td></tr>";
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

    state.playoffMatches.forEach(m => {
        const h = getPlayerById(m.homeId);
        const a = getPlayerById(m.awayId);
        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td>${roundNames[m.round] || m.round}</td>
            <td class="left">${h?.name || "?"} vs ${a?.name || "?"}</td>
            <td>${m.homeGoals}:${m.awayGoals}</td>
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
      await addDoc(playoffMatchesCol, { round, homeId: home, awayId: away, homeGoals: hg, awayGoals: ag, createdAt: serverTimestamp() });
      playoffHomeGoals.value = playoffAwayGoals.value = "0";
      playoffMatchMessage.textContent = "Meccs mentve";
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
  if (document.querySelector("#view-playoff_admin.active")) {
    renderArchiveList();
  }
}

if (saveArchiveBtn) {
  saveArchiveBtn.onclick = saveArchive;
}

// Kezdés
refreshUI();