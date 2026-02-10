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
  
  // Liga-specifikus láthatóság
  document.querySelectorAll(".league-a-section").forEach(el => el.style.display = (adminStatus.isMaster || adminStatus.leagueAAdmin) ? "" : "none");
  document.querySelectorAll(".league-b-section").forEach(el => el.style.display = (adminStatus.isMaster || adminStatus.leagueBAdmin) ? "" : "none");
  document.querySelectorAll(".league-c-section").forEach(el => el.style.display = (adminStatus.isMaster || adminStatus.leagueCAdmin) ? "" : "none");
  document.querySelectorAll(".league-d-section").forEach(el => el.style.display = (adminStatus.isMaster || adminStatus.leagueDAdmin) ? "" : "none");
  
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
    if ((target === "league_admin" || target === "matches") && !anyAdmin) return;
    
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === `view-${target}`));
    console.log('View changed to:', target);
  });
});

// --- LIGA INICIALIZÁLÁS ---
const initLeaguesBtn = document.getElementById('initLeaguesBtn');
if (initLeaguesBtn) {
  initLeaguesBtn.addEventListener('click', async () => {
    if (!adminStatus.isMaster) {
      alert('Csak a Master Admin inicializálhatja a ligákat!');
      return;
    }
    
    // Ellenőrizzük, hogy már léteznek-e ligák
    if (state.leagues.length > 0) {
      if (!confirm('A ligák már léteznek! Biztosan újra inicializálod? (Ez törli az összes adatot!)')) {
        return;
      }
      // Töröljük az összes meglévő adatot
      const leaguesSnapshot = await getDocs(leaguesCol);
      const playersSnapshot = await getDocs(playersCol);
      const matchesSnapshot = await getDocs(matchesCol);
      
      for (const doc of leaguesSnapshot.docs) await deleteDoc(doc.ref);
      for (const doc of playersSnapshot.docs) await deleteDoc(doc.ref);
      for (const doc of matchesSnapshot.docs) await deleteDoc(doc.ref);
    }
    
    // Létrehozzuk a 4 ligát
    try {
      await addDoc(leaguesCol, { name: 'Liga A', order: 1, createdAt: serverTimestamp() });
      await addDoc(leaguesCol, { name: 'Liga B', order: 2, createdAt: serverTimestamp() });
      await addDoc(leaguesCol, { name: 'Liga C', order: 3, createdAt: serverTimestamp() });
      await addDoc(leaguesCol, { name: 'Liga D', order: 4, createdAt: serverTimestamp() });
      alert('✅ Ligák sikeresen létrehozva!');
    } catch (error) {
      console.error('Hiba a ligák létrehozásakor:', error);
      alert('❌ Hiba történt: ' + error.message);
    }
  });
}

// --- JÁTÉKOS HOZZÁADÁS LIGÁKHOZ ---
['A', 'B', 'C', 'D'].forEach(leagueLetter => {
  const addBtn = document.getElementById(`addPlayerLeague${leagueLetter}`);
  const nameInput = document.getElementById(`playerNameLeague${leagueLetter}`);
  const playersList = document.getElementById(`playersListLeague${leagueLetter}`);
  
  if (addBtn && nameInput) {
    addBtn.addEventListener('click', async () => {
      // Ellenőrizzük, hogy a felhasználó admin-e erre a ligára
      const canManage = adminStatus.isMaster || 
                        (leagueLetter === 'A' && adminStatus.leagueAAdmin) ||
                        (leagueLetter === 'B' && adminStatus.leagueBAdmin) ||
                        (leagueLetter === 'C' && adminStatus.leagueCAdmin) ||
                        (leagueLetter === 'D' && adminStatus.leagueDAdmin);
      
      if (!canManage) {
        alert(`Nincs jogosultságod játékost hozzáadni a Liga ${leagueLetter}-hoz!`);
        return;
      }
      
      const playerName = nameInput.value.trim();
      if (!playerName) {
        alert('Add meg a játékos nevét!');
        return;
      }
      
      // Keressük meg a megfelelő ligát
      const league = state.leagues.find(l => l.name === `Liga ${leagueLetter}`);
      if (!league) {
        alert('A liga még nem létezik! Először inicializáld a ligákat.');
        return;
      }
      
      try {
        await addDoc(playersCol, {
          name: playerName,
          leagueId: league.id,
          adjustment: 0,
          createdAt: serverTimestamp()
        });
        nameInput.value = '';
        alert(`✅ ${playerName} hozzáadva a Liga ${leagueLetter}-hoz!`);
      } catch (error) {
        console.error('Hiba a játékos hozzáadásakor:', error);
        alert('❌ Hiba: ' + error.message);
      }
    });
  }
});

// Játékosok megjelenítése ligánként
function renderLeaguePlayers() {
  ['A', 'B', 'C', 'D'].forEach(leagueLetter => {
    const playersList = document.getElementById(`playersListLeague${leagueLetter}`);
    if (!playersList) return;
    
    // Ellenőrizzük, hogy a felhasználó láthatja-e ezt a ligát
    const canView = adminStatus.isMaster || 
                    (leagueLetter === 'A' && adminStatus.leagueAAdmin) ||
                    (leagueLetter === 'B' && adminStatus.leagueBAdmin) ||
                    (leagueLetter === 'C' && adminStatus.leagueCAdmin) ||
                    (leagueLetter === 'D' && adminStatus.leagueDAdmin);
    
    const league = state.leagues.find(l => l.name === `Liga ${leagueLetter}`);
    if (!league) {
      playersList.innerHTML = '<p class="muted">Liga még nem létezik</p>';
      return;
    }
    
    const players = state.players.filter(p => p.leagueId === league.id);
    
    if (players.length === 0) {
      playersList.innerHTML = '<p class="muted">Nincs játékos</p>';
    } else {
      playersList.innerHTML = `
        <table class="data-table" style="margin-top: 12px;">
          <thead>
            <tr>
              <th>Név</th>
              <th style="width: 120px;">Pontmódosítás</th>
              <th style="width: 100px;">Műveletek</th>
            </tr>
          </thead>
          <tbody>
            ${players.map(p => `
              <tr>
                <td style="text-align: left;">${p.name}</td>
                <td>
                  <input type="number" 
                         class="adjustment-input" 
                         data-player-id="${p.id}" 
                         value="${p.adjustment || 0}" 
                         style="width: 60px; padding: 4px; text-align: center; border: 1px solid rgba(212,175,55,0.3); background: rgba(0,0,0,0.3); color: #fff; border-radius: 4px;"
                         ${canView ? '' : 'disabled'}>
                  ${canView ? `<button onclick="saveAdjustment('${p.id}')" style="margin-left: 4px; padding: 4px 8px; background: rgba(16,185,129,0.2); border: 1px solid rgba(16,185,129,0.4); border-radius: 4px; color: #10b981; cursor: pointer; font-size: 11px;">Mentés</button>` : ''}
                </td>
                <td>
                  ${canView ? `<button onclick="deletePlayer('${p.id}', '${leagueLetter}')" style="padding: 4px 8px; background: rgba(239,68,68,0.2); border: 1px solid rgba(239,68,68,0.4); border-radius: 4px; color: #ef4444; cursor: pointer; font-size: 11px;">Törlés</button>` : '-'}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        ${players.some(p => p.adjustment) ? '<p class="muted" style="margin-top: 8px; font-size: 11px;">ℹ️ Pontmódosítás: + érték bónusz, - érték büntetés</p>' : ''}
      `;
    }
  });
}

// Pontmódosítás mentése
window.saveAdjustment = async (playerId) => {
  const input = document.querySelector(`.adjustment-input[data-player-id="${playerId}"]`);
  if (!input) return;
  
  const player = state.players.find(p => p.id === playerId);
  if (!player) return;
  
  const league = state.leagues.find(l => l.id === player.leagueId);
  const leagueLetter = league?.name?.replace('Liga ', '');
  
  const canManage = adminStatus.isMaster || 
                    (leagueLetter === 'A' && adminStatus.leagueAAdmin) ||
                    (leagueLetter === 'B' && adminStatus.leagueBAdmin) ||
                    (leagueLetter === 'C' && adminStatus.leagueCAdmin) ||
                    (leagueLetter === 'D' && adminStatus.leagueDAdmin);
  
  if (!canManage) {
    alert('Nincs jogosultságod módosítani!');
    return;
  }
  
  const value = parseInt(input.value) || 0;
  
  try {
    await updateDoc(doc(db, 'players', playerId), { adjustment: value });
    alert(`✅ Pontmódosítás mentve: ${value > 0 ? '+' : ''}${value} pont`);
  } catch (error) {
    console.error('Hiba a pontmódosításkor:', error);
    alert('❌ Hiba: ' + error.message);
  }
};

// Játékos törlése
window.deletePlayer = async (playerId, leagueLetter) => {
  const canManage = adminStatus.isMaster || 
                    (leagueLetter === 'A' && adminStatus.leagueAAdmin) ||
                    (leagueLetter === 'B' && adminStatus.leagueBAdmin) ||
                    (leagueLetter === 'C' && adminStatus.leagueCAdmin) ||
                    (leagueLetter === 'D' && adminStatus.leagueDAdmin);
  
  if (!canManage) {
    alert('Nincs jogosultságod törölni játékost!');
    return;
  }
  
  if (!confirm('Biztosan törölni szeretnéd ezt a játékost?')) return;
  
  try {
    await deleteDoc(doc(db, 'players', playerId));
    alert('✅ Játékos törölve!');
  } catch (error) {
    console.error('Hiba a játékos törlésekor:', error);
    alert('❌ Hiba: ' + error.message);
  }
};

// --- MECCS KEZELÉS ---
const matchLeagueSelect = document.getElementById('matchLeagueSelect');
const matchHomePlayerSelect = document.getElementById('matchHomePlayerSelect');
const matchAwayPlayerSelect = document.getElementById('matchAwayPlayerSelect');
const matchHomeGoals = document.getElementById('matchHomeGoals');
const matchAwayGoals = document.getElementById('matchAwayGoals');
const addMatchBtn = document.getElementById('addMatchBtn');
const matchMessage = document.getElementById('matchMessage');

// Liga select feltöltése
function refreshMatchLeagueSelect() {
  if (!matchLeagueSelect) return;
  
  const anyAdmin = adminStatus.isMaster || adminStatus.leagueAAdmin || adminStatus.leagueBAdmin || adminStatus.leagueCAdmin || adminStatus.leagueDAdmin;
  if (!anyAdmin) return;
  
  const sortedLeagues = [...state.leagues].sort((a, b) => (a.order || 0) - (b.order || 0));
  
  // Liga adminok csak a saját ligájukat látják
  const availableLeagues = sortedLeagues.filter(league => {
    if (adminStatus.isMaster) return true;
    if (adminStatus.leagueAAdmin && league.name === 'Liga A') return true;
    if (adminStatus.leagueBAdmin && league.name === 'Liga B') return true;
    if (adminStatus.leagueCAdmin && league.name === 'Liga C') return true;
    if (adminStatus.leagueDAdmin && league.name === 'Liga D') return true;
    return false;
  });
  
  matchLeagueSelect.innerHTML = '<option value="">-- Válassz ligát --</option>' + 
    availableLeagues.map(l => `<option value="${l.id}">${l.name}</option>`).join('');
}

// Liga választáskor frissítsük a játékosok listáját
if (matchLeagueSelect) {
  matchLeagueSelect.addEventListener('change', () => {
    const leagueId = matchLeagueSelect.value;
    if (!leagueId) {
      matchHomePlayerSelect.innerHTML = '<option value="">-- Válassz ligát először --</option>';
      matchAwayPlayerSelect.innerHTML = '<option value="">-- Válassz ligát először --</option>';
      return;
    }
    
    const players = state.players.filter(p => p.leagueId === leagueId);
    const options = '<option value="">-- Válassz játékost --</option>' + 
      players.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    
    matchHomePlayerSelect.innerHTML = options;
    matchAwayPlayerSelect.innerHTML = options;
  });
}

// Meccs mentése
if (addMatchBtn) {
  addMatchBtn.addEventListener('click', async () => {
    const anyAdmin = adminStatus.isMaster || adminStatus.leagueAAdmin || adminStatus.leagueBAdmin || adminStatus.leagueCAdmin || adminStatus.leagueDAdmin;
    if (!anyAdmin) {
      matchMessage.textContent = '❌ Csak adminok rögzíthetnek meccseket!';
      return;
    }
    
    const leagueId = matchLeagueSelect.value;
    const homePlayerId = matchHomePlayerSelect.value;
    const awayPlayerId = matchAwayPlayerSelect.value;
    const homeGoals = parseInt(matchHomeGoals.value) || 0;
    const awayGoals = parseInt(matchAwayGoals.value) || 0;
    
    if (!leagueId || !homePlayerId || !awayPlayerId) {
      matchMessage.textContent = '❌ Töltsd ki az összes mezőt!';
      return;
    }
    
    if (homePlayerId === awayPlayerId) {
      matchMessage.textContent = '❌ Egy játékos nem játszhat saját maga ellen!';
      return;
    }
    
    try {
      await addDoc(matchesCol, {
        leagueId,
        homePlayerId,
        awayPlayerId,
        homeGoals,
        awayGoals,
        createdAt: serverTimestamp()
      });
      
      matchMessage.textContent = `✅ Meccs rögzítve: ${homeGoals}-${awayGoals}`;
      matchHomeGoals.value = 0;
      matchAwayGoals.value = 0;
      matchHomePlayerSelect.value = '';
      matchAwayPlayerSelect.value = '';
    } catch (error) {
      console.error('Hiba a meccs rögzítésekor:', error);
      matchMessage.textContent = '❌ Hiba: ' + error.message;
    }
  });
}

// Meccsek listázása
function renderMatchesList() {
  const container = document.getElementById('matches-list-container');
  if (!container) return;
  
  const anyAdmin = adminStatus.isMaster || adminStatus.leagueAAdmin || adminStatus.leagueBAdmin || adminStatus.leagueCAdmin || adminStatus.leagueDAdmin;
  if (!anyAdmin) {
    container.innerHTML = '<p class="muted">Jelentkezz be adminként!</p>';
    return;
  }
  
  // Liga adminok csak a saját ligájuk meccseit látják
  let matches = state.matches.filter(match => {
    if (adminStatus.isMaster) return true;
    
    const league = state.leagues.find(l => l.id === match.leagueId);
    if (!league) return false;
    
    if (adminStatus.leagueAAdmin && league.name === 'Liga A') return true;
    if (adminStatus.leagueBAdmin && league.name === 'Liga B') return true;
    if (adminStatus.leagueCAdmin && league.name === 'Liga C') return true;
    if (adminStatus.leagueDAdmin && league.name === 'Liga D') return true;
    return false;
  });
  
  if (matches.length === 0) {
    container.innerHTML = '<p class="muted">Még nincs rögzített meccs</p>';
    return;
  }
  
  container.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Liga</th>
          <th>Hazai</th>
          <th style="width: 80px;">Eredmény</th>
          <th>Vendég</th>
          <th style="width: 100px;">Műveletek</th>
        </tr>
      </thead>
      <tbody>
        ${matches.map(match => {
          const league = state.leagues.find(l => l.id === match.leagueId);
          const homePlayer = state.players.find(p => p.id === match.homePlayerId);
          const awayPlayer = state.players.find(p => p.id === match.awayPlayerId);
          
          return `
            <tr>
              <td>${league ? league.name : '-'}</td>
              <td>${homePlayer ? homePlayer.name : '-'}</td>
              <td style="font-weight: 800; font-size: 16px; text-align: center;">${match.homeGoals} - ${match.awayGoals}</td>
              <td>${awayPlayer ? awayPlayer.name : '-'}</td>
              <td>
                <button onclick="deleteMatch('${match.id}')" style="padding: 6px 12px; background: rgba(239,68,68,0.2); border: 1px solid rgba(239,68,68,0.4); border-radius: 6px; color: #ef4444; cursor: pointer; font-size: 12px;">Törlés</button>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

// Meccs törlése
window.deleteMatch = async (matchId) => {
  const anyAdmin = adminStatus.isMaster || adminStatus.leagueAAdmin || adminStatus.leagueBAdmin || adminStatus.leagueCAdmin || adminStatus.leagueDAdmin;
  if (!anyAdmin) {
    alert('❌ Csak adminok törölhetnek meccseket!');
    return;
  }
  
  if (!confirm('Biztosan törölni szeretnéd ezt a meccset?')) return;
  
  try {
    await deleteDoc(doc(db, 'matches', matchId));
    alert('✅ Meccs törölve!');
  } catch (error) {
    console.error('Hiba a meccs törlésekor:', error);
    alert('❌ Hiba: ' + error.message);
  }
};

// Összes meccs megjelenítése mindenki számára (Eredmények fül)
function renderAllMatchesForUsers() {
  const container = document.getElementById('all-matches-list-container');
  if (!container) return;
  
  if (state.matches.length === 0) {
    container.innerHTML = '<p class="muted">Még nincs rögzített meccs</p>';
    return;
  }
  
  // Csoportosítás ligák szerint
  const sortedLeagues = [...state.leagues].sort((a, b) => (a.order || 0) - (b.order || 0));
  
  container.innerHTML = sortedLeagues.map(league => {
    const leagueMatches = state.matches.filter(m => m.leagueId === league.id);
    
    if (leagueMatches.length === 0) return '';
    
    return `
      <div style="margin-bottom: 24px;">
        <h4 style="color: #d4af37; margin-bottom: 12px;">⚽ ${league.name}</h4>
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 100px;">Dátum</th>
              <th>Hazai</th>
              <th style="width: 80px;">Eredmény</th>
              <th>Vendég</th>
            </tr>
          </thead>
          <tbody>
            ${leagueMatches.map(match => {
              const homePlayer = state.players.find(p => p.id === match.homePlayerId);
              const awayPlayer = state.players.find(p => p.id === match.awayPlayerId);
              const date = match.createdAt ? new Date(match.createdAt.seconds * 1000).toLocaleDateString('hu-HU', {month: 'short', day: 'numeric'}) : '-';
              
              return `
                <tr>
                  <td>${date}</td>
                  <td>${homePlayer ? homePlayer.name : '-'}</td>
                  <td style="font-weight: 800; font-size: 16px; text-align: center;">${match.homeGoals} - ${match.awayGoals}</td>
                  <td>${awayPlayer ? awayPlayer.name : '-'}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }).join('');
}

// --- PLAYOFF PÁROSÍTÁSOK ÉS EREDMÉNYEK ---

// Helper funkció: seed párok megjelenítése
function getSeedPair(matchNum) {
  const pairs = {
    1: '1. vs 16.',
    2: '8. vs 9.',
    3: '5. vs 12.',
    4: '4. vs 13.',
    5: '6. vs 11.',
    6: '3. vs 14.',
    7: '7. vs 10.',
    8: '2. vs 15.'
  };
  return pairs[matchNum] || '';
}

// Helper funkció: meccs opciók generálása forduló alapján
function generateMatchOptions(round) {
  let options = '<option value="">-- Válassz meccset --</option>';
  
  if (round === 'r16') {
    for (let i = 1; i <= 8; i++) {
      options += `<option value="r16-${i}">R16 Meccs ${i} (${getSeedPair(i)})</option>`;
    }
  } else if (round === 'quarter') {
    for (let i = 1; i <= 4; i++) {
      options += `<option value="q-${i}">QF Meccs ${i}</option>`;
    }
  } else if (round === 'semi') {
    for (let i = 1; i <= 2; i++) {
      options += `<option value="s-${i}">SF Meccs ${i}</option>`;
    }
  } else if (round === 'final') {
    options += '<option value="final">Döntő</option>';
  } else if (round === 'bronze') {
    options += '<option value="bronze">Bronzmeccs</option>';
  }
  
  return options;
}

// 1. PÁROSÍTÁSOK BEÁLLÍTÁSA
const pairingRoundSelect = document.getElementById('pairingRoundSelect');
const pairingMatchSelect = document.getElementById('pairingMatchSelect');
const pairingHomePlayer = document.getElementById('pairingHomePlayer');
const pairingAwayPlayer = document.getElementById('pairingAwayPlayer');
const addPairingBtn = document.getElementById('addPairingBtn');
const pairingMessage = document.getElementById('pairingMessage');

if (pairingRoundSelect) {
  pairingRoundSelect.addEventListener('change', () => {
    const round = pairingRoundSelect.value;
    if (!round) {
      pairingMatchSelect.innerHTML = '<option value="">-- Először válassz fordulót --</option>';
      return;
    }
    pairingMatchSelect.innerHTML = generateMatchOptions(round);
  });
}

if (addPairingBtn) {
  addPairingBtn.addEventListener('click', async () => {
    if (!adminStatus.isMaster) {
      pairingMessage.textContent = '❌ Csak Master Admin állíthat be párosításokat!';
      return;
    }
    
    const matchId = pairingMatchSelect.value.trim();
    const homePlayer = pairingHomePlayer.value.trim();
    const awayPlayer = pairingAwayPlayer.value.trim();
    
    if (!matchId || !homePlayer || !awayPlayer) {
      pairingMessage.textContent = '❌ Töltsd ki az összes mezőt!';
      return;
    }
    
    try {
      // Ellenőrizzük, létezik-e már ez a meccs
      const existingMatch = state.playoffMatches.find(m => m.matchId === matchId);
      
      if (existingMatch) {
        // Frissítjük a meglévő párosítást
        const matchRef = doc(db, 'playoff_matches', existingMatch.id);
        await updateDoc(matchRef, {
          homePlayer,
          awayPlayer
        });
        pairingMessage.textContent = `✅ Párosítás frissítve: ${homePlayer} vs ${awayPlayer}`;
      } else {
        // Új párosítás létrehozása (eredmény még nincs)
        await addDoc(playoffMatchesCol, {
          matchId,
          homePlayer,
          awayPlayer,
          homeGoals: null,
          awayGoals: null,
          createdAt: serverTimestamp()
        });
        pairingMessage.textContent = `✅ Párosítás mentve: ${homePlayer} vs ${awayPlayer}`;
      }
      
      pairingRoundSelect.value = '';
      pairingMatchSelect.innerHTML = '<option value="">-- Először válassz fordulót --</option>';
      pairingHomePlayer.value = '';
      pairingAwayPlayer.value = '';
      
      renderPlayoffBracket();
    } catch (error) {
      console.error('Hiba a párosítás mentésekor:', error);
      pairingMessage.textContent = '❌ Hiba: ' + error.message;
    }
  });
}

// 2. EREDMÉNYEK RÖGZÍTÉSE
const resultRoundSelect = document.getElementById('resultRoundSelect');
const resultMatchSelect = document.getElementById('resultMatchSelect');
const resultHomeGoals = document.getElementById('resultHomeGoals');
const resultAwayGoals = document.getElementById('resultAwayGoals');
const addResultBtn = document.getElementById('addResultBtn');
const resultMessage = document.getElementById('resultMessage');

if (resultRoundSelect) {
  resultRoundSelect.addEventListener('change', () => {
    const round = resultRoundSelect.value;
    if (!round) {
      resultMatchSelect.innerHTML = '<option value="">-- Először válassz fordulót --</option>';
      return;
    }
    
    // Szűrjük a meccseket a forduló alapján
    const roundMatches = state.playoffMatches.filter(m => {
      if (round === 'r16') return m.matchId.startsWith('r16-');
      if (round === 'quarter') return m.matchId.startsWith('q-');
      if (round === 'semi') return m.matchId.startsWith('s-');
      if (round === 'final') return m.matchId === 'final';
      if (round === 'bronze') return m.matchId === 'bronze';
      return false;
    });
    
    let options = '<option value="">-- Válassz meccset --</option>';
    
    if (roundMatches.length > 0) {
      roundMatches.forEach(match => {
        const hasResult = match.homeGoals !== null && match.awayGoals !== null;
        const resultText = hasResult ? ` (${match.homeGoals}-${match.awayGoals})` : ' (még nincs eredmény)';
        options += `<option value="${match.matchId}">${match.homePlayer} vs ${match.awayPlayer}${resultText}</option>`;
      });
    } else {
      options += '<option value="">Nincs még párosítás ebben a fordulóban</option>';
    }
    
    resultMatchSelect.innerHTML = options;
  });
}

if (addResultBtn) {
  addResultBtn.addEventListener('click', async () => {
    if (!adminStatus.isMaster) {
      resultMessage.textContent = '❌ Csak Master Admin rögzíthet eredményeket!';
      return;
    }
    
    const matchId = resultMatchSelect.value.trim();
    const homeGoals = parseInt(resultHomeGoals.value);
    const awayGoals = parseInt(resultAwayGoals.value);
    
    if (!matchId) {
      resultMessage.textContent = '❌ Válassz meccset!';
      return;
    }
    
    if (isNaN(homeGoals) || isNaN(awayGoals) || homeGoals < 0 || awayGoals < 0) {
      resultMessage.textContent = '❌ Add meg mindkét csapat gólját!';
      return;
    }
    
    try {
      const match = state.playoffMatches.find(m => m.matchId === matchId);
      
      if (!match) {
        resultMessage.textContent = '❌ Nem található ilyen párosítás!';
        return;
      }
      
      const matchRef = doc(db, 'playoff_matches', match.id);
      await updateDoc(matchRef, {
        homeGoals,
        awayGoals
      });
      
      resultMessage.textContent = `✅ Eredmény rögzítve: ${match.homePlayer} ${homeGoals}-${awayGoals} ${match.awayPlayer}`;
      resultRoundSelect.value = '';
      resultMatchSelect.innerHTML = '<option value="">-- Először válassz fordulót --</option>';
      resultHomeGoals.value = 0;
      resultAwayGoals.value = 0;
      
      renderPlayoffBracket();
    } catch (error) {
      console.error('Hiba az eredmény rögzítésekor:', error);
      resultMessage.textContent = '❌ Hiba: ' + error.message;
    }
  });
}

// 3. PÁROSÍTÁSOK LISTÁJA ÉS TÖRLÉSE
function renderPlayoffPairingsList() {
  const container = document.getElementById('playoffPairingsListContainer');
  if (!container) return;
  
  if (state.playoffMatches.length === 0) {
    container.innerHTML = '<p class="muted">Még nincs beállított párosítás</p>';
    return;
  }
  
  const roundNames = {
    'r16': 'Nyolcaddöntő',
    'q': 'Negyeddöntő',
    's': 'Elődöntő',
    'final': 'Döntő',
    'bronze': 'Bronzmeccs'
  };
  
  // Csoportosítás forduló szerint
  const grouped = {};
  state.playoffMatches.forEach(match => {
    let roundKey = 'other';
    if (match.matchId.startsWith('r16-')) roundKey = 'r16';
    else if (match.matchId.startsWith('q-')) roundKey = 'q';
    else if (match.matchId.startsWith('s-')) roundKey = 's';
    else if (match.matchId === 'final') roundKey = 'final';
    else if (match.matchId === 'bronze') roundKey = 'bronze';
    
    if (!grouped[roundKey]) grouped[roundKey] = [];
    grouped[roundKey].push(match);
  });
  
  let html = '';
  const roundOrder = ['r16', 'q', 's', 'final', 'bronze'];
  
  roundOrder.forEach(roundKey => {
    if (!grouped[roundKey]) return;
    
    html += `<div style="margin-bottom: 20px;">
      <h4 style="color: var(--accent-gold); margin-bottom: 10px;">${roundNames[roundKey] || roundKey}</h4>
      <table class="data-table">
        <thead>
          <tr>
            <th>Meccs ID</th>
            <th>Párosítás</th>
            <th>Eredmény</th>
            <th style="width: 100px;">Műveletek</th>
          </tr>
        </thead>
        <tbody>`;
    
    grouped[roundKey].forEach(match => {
      const hasResult = match.homeGoals !== null && match.awayGoals !== null;
      const resultText = hasResult ? `${match.homeGoals} - ${match.awayGoals}` : 'Még nincs eredmény';
      const resultColor = hasResult ? 'color: var(--primary-blue); font-weight: 700;' : 'color: #94a3b8;';
      
      html += `
        <tr>
          <td style="font-family: monospace; color: var(--accent-gold);">${match.matchId}</td>
          <td class="left">${match.homePlayer} <span style="color: #64748b;">vs</span> ${match.awayPlayer}</td>
          <td style="${resultColor}">${resultText}</td>
          <td>
            <button onclick="deletePlayoffPairing('${match.id}')" style="padding: 6px 12px; background: rgba(239,68,68,0.2); border: 1px solid rgba(239,68,68,0.4); border-radius: 6px; color: #ef4444; cursor: pointer; font-size: 12px; font-weight: 600;">Törlés</button>
          </td>
        </tr>`;
    });
    
    html += `</tbody></table></div>`;
  });
  
  container.innerHTML = html;
}

// Párosítás törlése
window.deletePlayoffPairing = async (pairingId) => {
  if (!adminStatus.isMaster) {
    alert('❌ Csak Master Admin törölhet párosításokat!');
    return;
  }
  
  if (!confirm('Biztosan törölni szeretnéd ezt a párosítást? (Az eredmény is törlődik!)')) return;
  
  try {
    await deleteDoc(doc(db, 'playoff_matches', pairingId));
    alert('✅ Párosítás törölve!');
    renderPlayoffBracket();
  } catch (error) {
    console.error('Hiba a párosítás törlésekor:', error);
    alert('❌ Hiba: ' + error.message);
  }
};

// Playoff bracket renderelése (egyszerű, matchId alapú)
function renderPlayoffBracket() {
  // Minden bracket meccset frissítünk
  const allMatchIds = [
    'r16-1', 'r16-2', 'r16-3', 'r16-4', 'r16-5', 'r16-6', 'r16-7', 'r16-8',
    'q-1', 'q-2', 'q-3', 'q-4',
    's-1', 's-2',
    'final',
    'bronze'
  ];
  
  allMatchIds.forEach(matchId => {
    const matchEl = document.querySelector(`[data-id="${matchId}"]`);
    if (!matchEl) return;
    
    // Keresünk rá playoff meccs adatot
    const matchData = state.playoffMatches.find(m => m.matchId === matchId);
    
    const teams = matchEl.querySelectorAll('.team');
    
    if (matchData) {
      // Van párosítás vagy eredmény
      const homeName = matchData.homePlayer || '-';
      const awayName = matchData.awayPlayer || '-';
      const homeScore = matchData.homeGoals !== null && matchData.homeGoals !== undefined ? matchData.homeGoals : '-';
      const awayScore = matchData.awayGoals !== null && matchData.awayGoals !== undefined ? matchData.awayGoals : '-';
      
      const hasResult = matchData.homeGoals !== null && matchData.awayGoals !== null;
      const winner = hasResult && homeScore > awayScore ? 'home' : hasResult && awayScore > homeScore ? 'away' : '';
      
      if (teams[0]) {
        teams[0].className = `team ${winner === 'home' ? 'winner' : ''}`;
        const nameEl = teams[0].querySelector('.name');
        const scoreEl = teams[0].querySelector('.score');
        if (nameEl) nameEl.textContent = homeName;
        if (scoreEl) scoreEl.textContent = homeScore;
      }
      if (teams[1]) {
        teams[1].className = `team ${winner === 'away' ? 'winner' : ''}`;
        const nameEl = teams[1].querySelector('.name');
        const scoreEl = teams[1].querySelector('.score');
        if (nameEl) nameEl.textContent = awayName;
        if (scoreEl) scoreEl.textContent = awayScore;
      }
    } else {
      // Nincs adat, üres mezők
      if (teams[0]) {
        teams[0].className = 'team';
        const nameEl = teams[0].querySelector('.name');
        const scoreEl = teams[0].querySelector('.score');
        if (nameEl) nameEl.textContent = '-';
        if (scoreEl) scoreEl.textContent = '-';
      }
      if (teams[1]) {
        teams[1].className = 'team';
        const nameEl = teams[1].querySelector('.name');
        const scoreEl = teams[1].querySelector('.score');
        if (nameEl) nameEl.textContent = '-';
        if (scoreEl) scoreEl.textContent = '-';
      }
    }
  });
}

// --- LISTENERS ---
function startListeners() {
  unsub.push(onSnapshot(leaguesCol, snap => { state.leagues = snap.docs.map(d => ({id: d.id, ...d.data()})); refreshUIFast(); }));
  unsub.push(onSnapshot(playersCol, snap => { state.players = snap.docs.map(d => ({id: d.id, ...d.data()})); refreshUI(); }));
  unsub.push(onSnapshot(query(matchesCol, orderBy("createdAt", "desc")), snap => { state.matches = snap.docs.map(d => ({id: d.id, ...d.data()})); refreshUI(); }));
  unsub.push(onSnapshot(query(playoffMatchesCol, orderBy("createdAt", "desc")), snap => { state.playoffMatches = snap.docs.map(d => ({id: d.id, ...d.data()})); refreshUI(); }));
  // unsub.push(onSnapshot(playinPairsCol, snap => { state.playinPairs = snap.docs.map(d => ({id: d.id, ...d.data()})); refreshUI(); }));
  unsub.push(onSnapshot(query(archivesCol, orderBy("createdAt", "desc")), snap => { state.archives = snap.docs.map(d => ({id: d.id, ...d.data()})); }));
}

// Indítjuk a listenereket és UI-t az initApp()-on belül
startListeners();
refreshUI();

// --- HELPERS ---
function getGroupById(id) { return state.groups.find(g => g.id === id); }
function getPlayerById(id) { return state.players.find(p => p.id === id); }
function getPlayersByGroup(gid) { return state.players.filter(p => p.groupId === gid); }

function getSortedGroups() {
  return [...state.groups].sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
}

// --- UI REFRESH ---
function refreshUI() {
  renderLeaguePlayers();
  renderLeagueTables();
  refreshMatchLeagueSelect();
  renderMatchesList();
  renderAllMatchesForUsers();
  renderPlayoffBracket();
  renderPlayoffPairingsList();
  console.log('refreshUI called');
}

function refreshUIFast() {
  renderLeagueTables();
  renderAllMatchesForUsers();
  console.log('refreshUIFast called');
}

// Liga táblázatok renderelése a főoldalon
function renderLeagueTables() {
  const container = document.getElementById('leagues-tables-container');
  if (!container) return;
  
  if (state.leagues.length === 0) {
    container.innerHTML = '<div class="card"><p class="muted">A ligák még nincsenek inicializálva. Jelentkezz be Master Adminként és inicializáld őket.</p></div>';
    return;
  }
  
  const sortedLeagues = [...state.leagues].sort((a, b) => (a.order || 0) - (b.order || 0));
  
  container.innerHTML = sortedLeagues.map(league => {
    const players = state.players.filter(p => p.leagueId === league.id);
    
    // Számítsuk ki az állást (egyelőre csak játékosok száma, később meccsek alapján)
    const standings = players.map(player => {
      const playerMatches = state.matches.filter(m => 
        m.leagueId === league.id && (m.homePlayerId === player.id || m.awayPlayerId === player.id)
      );
      
      let wins = 0, draws = 0, losses = 0, goalsFor = 0, goalsAgainst = 0;
      
      playerMatches.forEach(match => {
        const isHome = match.homePlayerId === player.id;
        const scored = isHome ? (match.homeGoals || 0) : (match.awayGoals || 0);
        const conceded = isHome ? (match.awayGoals || 0) : (match.homeGoals || 0);
        
        goalsFor += scored;
        goalsAgainst += conceded;
        
        if (scored > conceded) wins++;
        else if (scored === conceded) draws++;
        else losses++;
      });
      
      const matchPoints = wins * 3 + draws;
      const adjustment = player.adjustment || 0;
      const points = matchPoints + adjustment;
      const gd = goalsFor - goalsAgainst;
      
      return {
        name: player.name,
        played: playerMatches.length,
        wins,
        draws,
        losses,
        goalsFor,
        goalsAgainst,
        gd,
        matchPoints,
        adjustment,
        points
      };
    }).sort((a, b) => b.points - a.points || b.gd - a.gd || b.goalsFor - a.goalsFor);
    
    return `
      <div class="card" style="margin-top: 20px;">
        <h3 style="color: #d4af37; margin-bottom: 16px;">⚽ ${league.name}</h3>
        ${players.length === 0 ? '<p class="muted">Nincs játékos ebben a ligában</p>' : `
          <table class="data-table">
            <thead>
              <tr>
                <th style="width: 40px;">#</th>
                <th>Név</th>
                <th style="width: 50px;">M</th>
                <th style="width: 50px;">GY</th>
                <th style="width: 50px;">D</th>
                <th style="width: 50px;">V</th>
                <th style="width: 60px;">GF</th>
                <th style="width: 60px;">GA</th>
                <th style="width: 60px;">GD</th>
                <th style="width: 60px;">P</th>
              </tr>
            </thead>
            <tbody>
              ${standings.map((st, idx) => {
                const adjustmentDisplay = st.adjustment !== 0 ? ` <small style="color: ${st.adjustment > 0 ? '#10b981' : '#ef4444'}; font-weight: 600;">(${st.adjustment > 0 ? '+' : ''}${st.adjustment})</small>` : '';
                return `
                <tr style="${idx < 4 ? 'background: rgba(212,175,55,0.1); border-left: 3px solid #d4af37;' : ''}">
                  <td style="font-weight: 700; color: ${idx < 4 ? '#d4af37' : '#9ca3af'};">${idx + 1}</td>
                  <td style="font-weight: 600;">${st.name}</td>
                  <td>${st.played}</td>
                  <td>${st.wins}</td>
                  <td>${st.draws}</td>
                  <td>${st.losses}</td>
                  <td>${st.goalsFor}</td>
                  <td>${st.goalsAgainst}</td>
                  <td style="font-weight: 600;">${st.gd > 0 ? '+' : ''}${st.gd}</td>
                  <td style="font-weight: 800; font-size: 16px;">${st.points}${adjustmentDisplay}</td>
                </tr>
              `}).join('')}
            </tbody>
          </table>
          ${standings.length >= 4 ? '<p class="muted" style="margin-top: 12px; font-size: 12px;">🏆 Az első 4 helyezett továbbjut a Top 16 playoffba</p>' : ''}
        `}
      </div>
    `;
  }).join('');
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
      if (!adminStatus.isMaster) {
        alert('❌ Csak Master Admin törölhet minden adatot!');
        return;
      }
      
      if (!confirm("⚠️ FIGYELEM! Ez véglegesen törli:\n- Összes ligát\n- Összes játékost\n- Összes meccset\n- Összes playoff eredményt\n\nBiztosan folytatod?")) return;
      
      if (!confirm("🚨 UTOLSÓ FIGYELMEZTETÉS! Ez NEM VISSZAVONHATÓ!\n\nMentsd el archívba előtte, ha szükséges!\n\nBiztosan törlöd az összes adatot?")) return;
      
      try {
        // Töröljük az összes kollekciót
        const collections = [
          { col: leaguesCol, name: 'leagues' },
          { col: playersCol, name: 'players' },
          { col: matchesCol, name: 'matches' },
          { col: playoffMatchesCol, name: 'playoff_matches' }
        ];
        
        for (const { col, name } of collections) {
          const snap = await getDocs(col);
          for (const d of snap.docs) {
            await deleteDoc(doc(db, name, d.id));
          }
        }
        
        alert('✅ Összes adat törölve! Az oldal újratöltődik.');
        location.reload();
      } catch (error) {
        console.error('Hiba a törlés során:', error);
        alert('❌ Hiba történt a törlés során: ' + error.message);
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
  if (!adminStatus.isMaster) {
    if (archiveMessage) archiveMessage.textContent = "Csak Master Admin menthet archívumot";
    return;
  }
  if (archiveMessage) archiveMessage.textContent = "Mentés...";

  const name = (archiveNameInput?.value || "").trim() || `HRL Bajnokság ${new Date().toLocaleDateString('hu-HU')}`;
  const champion = deriveChampion();
  const payload = {
    name,
    finishedAt: serverTimestamp(),
    champion,
    leagues: state.leagues,
    players: state.players,
    matches: state.matches,
    playoffMatches: state.playoffMatches
  };

  try {
    await addDoc(archivesCol, payload);
    if (archiveNameInput) archiveNameInput.value = "";
    if (archiveMessage) {
      archiveMessage.textContent = "✅ Bajnokság elmentve az archívumba!";
      archiveMessage.style.color = "#10b981";
    }
    alert("✅ Bajnokság sikeresen elmentve az archívumba!");
  } catch (error) {
    console.error("Archív mentési hiba:", error);
    if (archiveMessage) {
      archiveMessage.textContent = `❌ Hiba: ${error.message}`;
      archiveMessage.style.color = "#ef4444";
    }
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

} // initApp() vége

// DOM betöltése után indítjuk az appot
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
