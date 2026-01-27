// Admin jelszó (szinkronban a bajnoksaggal)
const ADMIN_PASSWORD = 'hunrise123';
const ARCHIVE_KEY = 'hrl_archives';
const APPLICANTS_KEY = 'hrl_applicants';

// Firebase config
const FIREBASE_API_KEY = "AIzaSyDDXdGSp7OiCl-6tQU1Rm2t82xirXH_Icc";
const FIREBASE_PROJECT_ID = "ifi2liga";

// Admin státusz inicializálása
let isAdmin = localStorage.getItem('adminStatus') === 'true';

// DOMContentLoaded - minden inicializálás itt
document.addEventListener('DOMContentLoaded', function() {
    // Hamburger menü kezelés
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const navMenu = document.getElementById('navMenu');

    if (hamburgerBtn && navMenu) {
        hamburgerBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            const isActive = navMenu.style.display === 'flex';
            navMenu.style.display = isActive ? 'none' : 'flex';
            hamburgerBtn.classList.toggle('active');
            console.log('Nav menü megjelenítve:', !isActive);
        });

        // Menü bezárása ha kívülre kattintunk
        document.addEventListener('click', function(e) {
            if (!e.target.closest('.navbar')) {
                navMenu.style.display = 'none';
                hamburgerBtn.classList.remove('active');
            }
        });

        // Menü bezárása ha linket követnek
        navMenu.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', function() {
                navMenu.style.display = 'none';
                hamburgerBtn.classList.remove('active');
            });
        });
    }

    // Admin panel kezelés
    // Játékosok betöltése Firebase-ből
    loadPlayersFromFirebase();
    
    initAdminPanel();
    loadPlayers();
    
    // Join modal kezelés
    const joinBtn = document.getElementById('joinBtn');
    const joinModal = document.getElementById('joinModal');
    const joinForm = document.getElementById('joinForm');
    
    if (joinBtn && joinModal && joinForm) {
        joinBtn.addEventListener('click', function() {
            joinModal.classList.add('show');
        });
        
        joinForm.addEventListener('submit', function(e) {
            e.preventDefault();
            submitJoinForm();
        });
    }
    
    // Archives oldal betöltésének az archives.html-ből kezeljük
});

// Champion csillagok megjelenítése/elrejtése
function toggleChampionStars(mode) {
    const selectId = mode === 'h2h' ? 'joinH2hDivision' : mode === 'vsa' ? 'joinVsaDivision' : 'joinManagerDivision';
    const starsId = mode === 'h2h' ? 'joinH2hStars' : mode === 'vsa' ? 'joinVsaStars' : 'joinManagerStars';
    
    const selectEl = document.getElementById(selectId);
    const starsEl = document.getElementById(starsId);
    
    if (selectEl && starsEl) {
        if (selectEl.value === 'Champion') {
            starsEl.style.display = 'block';
            starsEl.required = true;
        } else {
            starsEl.style.display = 'none';
            starsEl.required = false;
            starsEl.value = '';
        }
    }
}

// Régi mezők átkonvertálása az új struktúrára
function normalizePlayer(p) {
    const copy = { ...p };
    if (!copy.h2hDivision && copy.prevSeasonMode === 'h2h') {
        copy.h2hDivision = copy.prevSeasonValue || '';
    }
    if (!copy.managerDivision && copy.prevSeasonMode === 'manager') {
        copy.managerDivision = copy.prevSeasonValue || '';
    }
    if (!copy.vsaDivision && copy.prevSeasonMode === 'champions') {
        copy.vsaDivision = copy.prevSeasonValue || '';
    }
    // Ha csak prevSeasonValue volt, másoljuk mindkettőre fallbackként
    if (!copy.h2hDivision && copy.prevSeasonValue) copy.h2hDivision = copy.prevSeasonValue;
    if (!copy.managerDivision && copy.prevSeasonValue) copy.managerDivision = copy.prevSeasonValue;
    if (!copy.vsaDivision && copy.prevSeasonValue) copy.vsaDivision = copy.prevSeasonValue;
    // Töröljük a régi mezőket
    delete copy.prevSeasonMode;
    delete copy.prevSeasonValue;
    delete copy.role;
    delete copy.rating;
    delete copy.club;
    delete copy.prevDivision;
    delete copy.rivals;
    delete copy.stars;
    return copy;
}

function initAdminPanel() {
    const adminLoggedOut = document.getElementById('adminLoggedOut');
    const adminLoggedIn = document.getElementById('adminLoggedIn');
    const adminLoginBtn = document.getElementById('adminLoginBtn');
    const adminLogoutBtn = document.getElementById('adminLogoutBtn');
    const adminPassword = document.getElementById('adminPassword');

    if (!adminLoginBtn) return; // Ha nincs admin panel az oldalon

    // Kezdeti státusz beállítása
    if (isAdmin) {
        adminLoggedOut.style.display = 'none';
        adminLoggedIn.style.display = 'inline-block';
    } else {
        adminLoggedOut.style.display = 'inline-block';
        adminLoggedIn.style.display = 'none';
    }

    // Bejelentkezés
    if (adminLoginBtn) {
        adminLoginBtn.addEventListener('click', function() {
            if (adminPassword.value === ADMIN_PASSWORD) {
                isAdmin = true;
                localStorage.setItem('adminStatus', 'true');
                adminLoggedOut.style.display = 'none';
                adminLoggedIn.style.display = 'inline-block';
                adminPassword.value = '';
                updateAdminUI();
            } else {
                alert('Helytelen jelszó!');
                adminPassword.value = '';
            }
        });
    }

    // Kilépés
    if (adminLogoutBtn) {
        adminLogoutBtn.addEventListener('click', function() {
            isAdmin = false;
            localStorage.setItem('adminStatus', 'false');
            adminLoggedOut.style.display = 'inline-block';
            adminLoggedIn.style.display = 'none';
            updateAdminUI();
        });
    }
}

function updateAdminUI() {
    // Ha van add gomb és edit gomb, frissítjük azok láthatóságát
    const editBtns = document.querySelectorAll('.edit-player-btn');
    const addBtn = document.getElementById('addPlayerBtn');
    
    editBtns.forEach(btn => {
        btn.style.display = isAdmin ? 'inline-block' : 'none';
    });
    
    if (addBtn) {
        addBtn.style.display = isAdmin ? 'inline-block' : 'none';
        addBtn.onclick = addNewPlayer;
    }
}

// ===== JÁTÉKOSOK FIREBASE KEZELÉS =====
// Játékosok betöltése Firebase-ből
async function loadPlayersFromFirebase() {
    try {
        const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/roster?pageSize=500`;
        const response = await fetch(url);
        
        if (!response.ok) {
            console.log('Firebase nem elérhető, helyi játékosokat használunk');
            loadPlayersLocally();
            return;
        }

        const data = await response.json();
        const documents = data.documents || [];

        players.length = 0;
        documents.forEach(doc => {
            const fields = doc.fields || {};
            const player = {
                id: fields.id?.integerValue || Date.now(),
                name: fields.name?.stringValue || '',
                inGameName: fields.inGameName?.stringValue || '',
                ovr: parseInt(fields.ovr?.integerValue || 80),
                image: fields.image?.stringValue || '',
                h2hDivision: fields.h2hDivision?.stringValue || '',
                managerDivision: fields.managerDivision?.stringValue || '',
                vsaDivision: fields.vsaDivision?.stringValue || '',
                actPoints: parseInt(fields.actPoints?.integerValue || 0),
                bio: fields.bio?.stringValue || ''
            };
            players.push(player);
        });

        initAdminPanel();
        loadPlayers();
    } catch (error) {
        console.error('Firebase hiba:', error);
        loadPlayersLocally();
        initAdminPanel();
        loadPlayers();
        renderArchiveList();
    }
}

// Helyi játékosok betöltése fallback-ként
function loadPlayersLocally() {
    const savedPlayers = localStorage.getItem('players');
    if (savedPlayers) {
        try {
            const parsed = JSON.parse(savedPlayers);
            if (Array.isArray(parsed) && parsed.length > 0) {
                players.length = 0;
                players.push(...parsed.map(normalizePlayer));
            }
        } catch (e) {
            console.log('Nem sikerült betölteni a játékosokat');
        }
    }
}

// Játékos mentése Firebase-be
async function savePlayerToFirebase(player) {
    try {
        const docId = `player_${player.id}`;
        const docPath = `projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/roster/${docId}`;
        
        const body = {
            fields: {
                id: { integerValue: player.id },
                name: { stringValue: player.name },
                inGameName: { stringValue: player.inGameName },
                ovr: { integerValue: player.ovr.toString() },
                image: { stringValue: player.image },
                h2hDivision: { stringValue: player.h2hDivision },
                managerDivision: { stringValue: player.managerDivision },
                vsaDivision: { stringValue: player.vsaDivision },
                actPoints: { integerValue: player.actPoints.toString() },
                bio: { stringValue: player.bio }
            }
        };

        const response = await fetch(
            `https://firestore.googleapis.com/v1/${docPath}?key=${FIREBASE_API_KEY}`,
            {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            }
        );

        if (!response.ok) {
            console.log('Firebase mentés sikertelen, helyi mentésre váltunk');
        }
    } catch (error) {
        console.error('Firebase mentési hiba:', error);
    }
}

// Játékos törlése Firebase-ből
async function deletePlayerFromFirebase(playerId) {
    try {
        const docId = `player_${playerId}`;
        const docPath = `projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/roster/${docId}`;

        await fetch(
            `https://firestore.googleapis.com/v1/${docPath}?key=${FIREBASE_API_KEY}`,
            { method: 'DELETE' }
        );
    } catch (error) {
        console.error('Firebase törlés hiba:', error);
    }
}

// Archív lista renderelése a főoldalon - Firebase-ből olvassa

// Játékosok adatbázisa
const players = [
    {
        id: 1,
        name: 'Kovács János',
        inGameName: 'KJ_Beast_09',
        ovr: 88,
        image: 'player1.jpg',
        h2hDivision: 'Elite',
        managerDivision: 'Legendary',
        vsaDivision: 'Elite',
        actPoints: 1850,
        bio: 'Kovács János a csapat egyik legtehetségesebb csatára. Kiváló lövésével és gyorsaságával sok gólt szerzett már.'
    },
    {
        id: 2,
        name: 'Nagy Péter',
        inGameName: 'NagyP_Def',
        ovr: 85,
        image: 'player2.jpg',
        h2hDivision: 'Pro',
        managerDivision: 'World Class',
        vsaDivision: '4⭐',
        actPoints: 1650,
        bio: 'Nagy Péter, a csapat alapembere a védelem kapuját őrzi. Megbízható és erős szereplésével sok mérkőzést nyert meg.'
    }
];

// Játékosok listájának feltöltése
function loadPlayers() {
    const grid = document.getElementById('playersGrid');
    if (!grid) {
        console.log('playersGrid nem található');
        return;
    }
    
    console.log('loadPlayers: ' + players.length + ' játékos');
    
    grid.innerHTML = players.map(player => `
        <div class="player-card">
            <div class="player-image">
                <img src="${player.image}" alt="${player.name}">
            </div>
            <div class="player-info">
                <h3>${player.name}</h3>
                <p class="player-role">${player.inGameName}</p>
                <p class="player-rating">OVR: ${player.ovr}</p>
                <p class="player-rating" style="margin-top: 6px;">VSA: ${player.vsaDivision || '-'} | H2H: ${player.h2hDivision || '-'} | Manager: ${player.managerDivision || '-'}</p>
                <div style="display: flex; gap: 10px; margin-top: 10px;">
                    <button class="btn-small btn-profil">Profil</button>
                    ${isAdmin ? `<button class="btn-small btn-szerkesztes" style="background-color: #ff9800;">Szerkesztés</button>` : ''}
                </div>
            </div>
        </div>
    `).join('');
    
    // Delegated event listeners a gombokon
    const playersGrid = document.getElementById('playersGrid');
    if (playersGrid) {
        playersGrid.addEventListener('click', function(e) {
            const btn = e.target.closest('button');
            if (!btn) return;
            
            if (btn.textContent === 'Profil') {
                const card = btn.closest('.player-card');
                const playerName = card.querySelector('h3').textContent;
                const player = players.find(p => p.name === playerName);
                if (player) window.openModal(player.id);
            } else if (btn.textContent === 'Szerkesztés') {
                const card = btn.closest('.player-card');
                const playerName = card.querySelector('h3').textContent;
                const player = players.find(p => p.name === playerName);
                if (player) window.editPlayer(player.id);
            }
        });
    }
    
    // Add gomb kezelése
    const addBtn = document.getElementById('addPlayerBtn');
    if (addBtn) {
        addBtn.style.display = isAdmin ? 'inline-block' : 'none';
        // Eltávolítjuk az összes régi listener-t
        addBtn.onclick = null;
        addBtn.onclick = addNewPlayer;
    }
}

function editPlayer(playerId) {
    const player = players.find(p => p.id === playerId);
    if (!player) return;
    
    showPlayerForm(player);
}

function addNewPlayer() {
    const newPlayer = {
        id: Math.max(...players.map(p => p.id), 0) + 1,
        name: '',
        inGameName: '',
        ovr: 75,
        image: 'player' + (players.length + 1) + '.jpg',
        h2hDivision: 'Elite',
        managerDivision: 'Pro',
        vsaDivision: 'Pro',
        actPoints: 1000,
        bio: ''
    };
    
    showPlayerForm(newPlayer);
}

function showPlayerForm(player) {
    const isNewPlayer = !players.find(p => p.id === player.id);
    
    const formHTML = `
        <div style="background: #1a1a1a; padding: 20px; border-radius: 8px; max-width: 500px; margin: 0 auto;">
            <h2>${isNewPlayer ? 'Új játékos hozzáadása' : 'Játékos szerkesztése'}</h2>
            <form id="playerForm" style="display: flex; flex-direction: column; gap: 15px;">
                <div>
                    <label style="color: #00d4ff; font-weight: 700;">Név:</label>
                    <input type="text" id="playerName" value="${player.name}" placeholder="Játékos neve" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #00d4ff; background: #0a0a0a; color: #fff;">
                </div>
                <div>
                    <label style="color: #00d4ff; font-weight: 700;">In-Game Name:</label>
                    <input type="text" id="playerInGameName" value="${player.inGameName}" placeholder="pl. NagyPeter_99" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #00d4ff; background: #0a0a0a; color: #fff;">
                </div>
                <div>
                    <label style="color: #00d4ff; font-weight: 700;">OVR:</label>
                    <input type="number" id="playerOvr" value="${player.ovr}" min="70" max="99" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #00d4ff; background: #0a0a0a; color: #fff;">
                </div>
                <div>
                    <label style="color: #00d4ff; font-weight: 700;">VSA div / csillag:</label>
                    <select id="playerVSA" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #00d4ff; background: #0a0a0a; color: #fff;">
                        <option value="Elite">Elite</option>
                        <option value="World Class">World Class</option>
                        <option value="Pro">Pro</option>
                        <option value="Legendary">Legendary</option>
                        <option value="Top 100">Top 100</option>
                        <option value="Champion">Champion</option>
                        <option value="5⭐">5⭐</option>
                        <option value="4⭐">4⭐</option>
                        <option value="3⭐">3⭐</option>
                        <option value="">- Egyedi / Nincs -</option>
                    </select>
                    <input type="text" id="playerVSAChampionStars" placeholder="pl. 5⭐" style="display: none; margin-top: 6px; width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #00d4ff; background: #0a0a0a; color: #fff;">
                </div>
                <div>
                    <label style="color: #00d4ff; font-weight: 700;">H2H div / csillag:</label>
                    <select id="playerH2H" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #00d4ff; background: #0a0a0a; color: #fff;">
                        <option value="Elite">Elite</option>
                        <option value="World Class">World Class</option>
                        <option value="Pro">Pro</option>
                        <option value="Legendary">Legendary</option>
                        <option value="Top 100">Top 100</option>
                        <option value="Champion">Champion</option>
                        <option value="5⭐">5⭐</option>
                        <option value="4⭐">4⭐</option>
                        <option value="3⭐">3⭐</option>
                        <option value="">- Egyedi / Nincs -</option>
                    </select>
                    <input type="text" id="playerH2HChampionStars" placeholder="pl. 5⭐" style="display: none; margin-top: 6px; width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #00d4ff; background: #0a0a0a; color: #fff;">
                </div>
                <div>
                    <label style="color: #00d4ff; font-weight: 700;">Manager Mode div / csillag:</label>
                    <select id="playerManager" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #00d4ff; background: #0a0a0a; color: #fff;">
                        <option value="Elite">Elite</option>
                        <option value="World Class">World Class</option>
                        <option value="Pro">Pro</option>
                        <option value="Legendary">Legendary</option>
                        <option value="Top 100">Top 100</option>
                        <option value="Champion">Champion</option>
                        <option value="5⭐">5⭐</option>
                        <option value="4⭐">4⭐</option>
                        <option value="3⭐">3⭐</option>
                        <option value="">- Egyedi / Nincs -</option>
                    </select>
                    <input type="text" id="playerManagerChampionStars" placeholder="pl. 5⭐" style="display: none; margin-top: 6px; width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #00d4ff; background: #0a0a0a; color: #fff;">
                </div>
                <div>
                    <label style="color: #00d4ff; font-weight: 700;">Act pontok előző seasonban:</label>
                    <input type="number" id="playerActPoints" value="${player.actPoints}" min="0" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #00d4ff; background: #0a0a0a; color: #fff;">
                </div>
                <div>
                    <label style="color: #00d4ff; font-weight: 700;">Biográfia:</label>
                    <textarea id="playerBio" placeholder="Rövid leírás" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #00d4ff; background: #0a0a0a; color: #fff; min-height: 80px;">${player.bio}</textarea>
                </div>
                <div style="display: flex; gap: 10px;">
                    <button type="button" id="savePlayerBtn" class="btn-small" style="flex: 1; background: #28a745;">Mentés</button>
                    <button type="button" id="cancelPlayerBtn" class="btn-small" style="flex: 1; background: #666;">Mégse</button>
                    ${!isNewPlayer ? `<button type="button" id="deletePlayerBtn" class="btn-small" style="flex: 1; background: #d32f2f;">Törlés</button>` : ''}
                </div>
            </form>
        </div>
    `;
    
    // Nyiss egy modalt az űrlappal
    const modal = document.getElementById('playerModal');
    const content = document.getElementById('playerDetailContent');
    
    if (!modal || !content) return;
    
    content.innerHTML = formHTML;
    modal.classList.add('show');
    
    // Dropdownok beállítása + Champion esetén kézi csillag
    const h2hSelect = document.getElementById('playerH2H');
    const managerSelect = document.getElementById('playerManager');
    const vsaSelect = document.getElementById('playerVSA');
    const h2hStarInput = document.getElementById('playerH2HChampionStars');
    const managerStarInput = document.getElementById('playerManagerChampionStars');
    const vsaStarInput = document.getElementById('playerVSAChampionStars');

    function parseChampion(val) {
        if (!val || !val.startsWith('Champion')) return { base: val || '', star: '' };
        const parts = val.split(' ');
        return { base: 'Champion', star: parts.slice(1).join(' ') };
    }

    const h2hParsed = parseChampion(player.h2hDivision);
    const managerParsed = parseChampion(player.managerDivision);
    const vsaParsed = parseChampion(player.vsaDivision);

    h2hSelect.value = h2hParsed.base;
    managerSelect.value = managerParsed.base;
    vsaSelect.value = vsaParsed.base;
    h2hStarInput.value = h2hParsed.star;
    managerStarInput.value = managerParsed.star;
    vsaStarInput.value = vsaParsed.star;

    function toggleStar(selectEl, inputEl) {
        if (selectEl.value === 'Champion') {
            inputEl.style.display = 'block';
        } else {
            inputEl.style.display = 'none';
            inputEl.value = '';
        }
    }

    [
        [h2hSelect, h2hStarInput, h2hParsed.star],
        [managerSelect, managerStarInput, managerParsed.star],
        [vsaSelect, vsaStarInput, vsaParsed.star]
    ].forEach(([sel, inp, star]) => {
        toggleStar(sel, inp);
        sel.addEventListener('change', () => toggleStar(sel, inp));
        if (sel.value === 'Champion' && star) inp.value = star;
    });
    
    // Event listenerek
    document.getElementById('savePlayerBtn').addEventListener('click', function() {
        function resolveDivision(selectId, inputId) {
            const selVal = document.getElementById(selectId).value;
            const starVal = document.getElementById(inputId).value.trim();
            if (selVal === 'Champion' && starVal) return `${selVal} ${starVal}`;
            return selVal;
        }

        const updatedPlayer = {
            ...player,
            name: document.getElementById('playerName').value,
            inGameName: document.getElementById('playerInGameName').value,
            ovr: parseInt(document.getElementById('playerOvr').value),
            h2hDivision: resolveDivision('playerH2H', 'playerH2HChampionStars'),
            managerDivision: resolveDivision('playerManager', 'playerManagerChampionStars'),
            vsaDivision: resolveDivision('playerVSA', 'playerVSAChampionStars'),
            actPoints: parseInt(document.getElementById('playerActPoints').value),
            bio: document.getElementById('playerBio').value
        };
        
        if (!updatedPlayer.name || !updatedPlayer.inGameName) {
            alert('Kérjük, töltsd ki a név és In-Game Name mezőket!');
            return;
        }
        
        if (isNewPlayer) {
            players.push(updatedPlayer);
        } else {
            const index = players.findIndex(p => p.id === player.id);
            if (index !== -1) {
                players[index] = updatedPlayer;
            }
        }
        
        // Mentés LocalStorage-ba és Firebase-be
        localStorage.setItem('players', JSON.stringify(players));
        savePlayerToFirebase(updatedPlayer);
        
        closeModal();
        loadPlayers();
        alert('Sikeres mentés!');
    });
    
    document.getElementById('cancelPlayerBtn').addEventListener('click', function() {
        closeModal();
    });
    
    if (!isNewPlayer) {
        document.getElementById('deletePlayerBtn').addEventListener('click', function() {
            if (confirm('Biztos vagy? Ezt nem lehet visszavonni!')) {
                const playerId = player.id;
                players.splice(players.findIndex(p => p.id === playerId), 1);
                localStorage.setItem('players', JSON.stringify(players));
                deletePlayerFromFirebase(playerId);
                closeModal();
                loadPlayers();
                alert('Játékos törölve!');
            }
        });
    }
}

// Modal megnyitása
function openModal(playerId) {
    const player = players.find(p => p.id === playerId);
    const modal = document.getElementById('playerModal');
    const content = document.getElementById('playerDetailContent');

    if (!modal || !content) return;

    content.innerHTML = `
        <button class="btn-back-modal" onclick="closeModal()">← Vissza a játékosokhoz</button>
        <div class="player-detail-image">
            <img src="${player.image}" alt="${player.name}">
        </div>
        <h2>${player.name}</h2>
        <p class="detail-role">${player.inGameName}</p>
        
        <div class="player-info-grid">
            <div class="info-item">
                <span class="info-label">OVR</span>
                <span class="info-value">${player.ovr}</span>
            </div>
            <div class="info-item">
                <span class="info-label">VSA div / csillag</span>
                <span class="info-value">${player.vsaDivision || '-'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">H2H div / csillag</span>
                <span class="info-value">${player.h2hDivision || '-'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Manager Mode div / csillag</span>
                <span class="info-value">${player.managerDivision || '-'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Act pontok</span>
                <span class="info-value">${player.actPoints}</span>
            </div>
        </div>
        
        <p class="detail-bio">${player.bio}</p>
        ${isAdmin ? `<button class="btn-small" onclick="editPlayer(${player.id})" style="margin-top: 20px; background-color: #ff9800;">Szerkesztés</button>` : ''}
    `;

    modal.classList.add('show');
}

// Modal bezárása
function closeModal() {
    const modal = document.getElementById('playerModal');
    if (modal) {
        modal.classList.remove('show');
    }
}

// Tegyük globálissá a gombok által hívott függvényeket, hogy inline onclick működjön
window.openModal = openModal;
window.editPlayer = editPlayer;
window.addNewPlayer = addNewPlayer;
window.closeModal = closeModal;
window.closeJoinModal = closeJoinModal;

// Join modal függvények
function closeJoinModal() {
    const joinModal = document.getElementById('joinModal');
    if (joinModal) {
        joinModal.classList.remove('show');
    }
}

function submitJoinForm() {
    const name = document.getElementById('joinName').value.trim();
    const gameName = document.getElementById('joinGameName').value.trim();
    const ovr = document.getElementById('joinOvr').value;
    const h2hDivisionSelect = document.getElementById('joinH2hDivision').value;
    const vsaDivisionSelect = document.getElementById('joinVsaDivision').value;
    const managerDivisionSelect = document.getElementById('joinManagerDivision').value;
    const contact = document.getElementById('joinContact').value.trim();
    const messageEl = document.getElementById('joinMessage');
    
    // Champion ellenőrzés és csillagok hozzáadása
    let h2hDivision = h2hDivisionSelect;
    let vsaDivision = vsaDivisionSelect;
    let managerDivision = managerDivisionSelect;
    
    if (h2hDivisionSelect === 'Champion') {
        const stars = document.getElementById('joinH2hStars').value;
        if (!stars) {
            messageEl.textContent = 'Add meg a H2H Champion csillagok számát!';
            messageEl.style.color = '#ef4444';
            return;
        }
        h2hDivision = `${stars}⭐`;
    }
    
    if (vsaDivisionSelect === 'Champion') {
        const stars = document.getElementById('joinVsaStars').value;
        if (!stars) {
            messageEl.textContent = 'Add meg a VSA Champion csillagok számát!';
            messageEl.style.color = '#ef4444';
            return;
        }
        vsaDivision = `${stars}⭐`;
    }
    
    if (managerDivisionSelect === 'Champion') {
        const stars = document.getElementById('joinManagerStars').value;
        if (!stars) {
            messageEl.textContent = 'Add meg a Manager Champion csillagok számát!';
            messageEl.style.color = '#ef4444';
            return;
        }
        managerDivision = `${stars}⭐`;
    }
    
    if (!name || !gameName || !ovr || !h2hDivisionSelect || !vsaDivisionSelect || !managerDivisionSelect || !contact) {
        messageEl.textContent = 'Kérjük, töltsd ki az összes mezőt!';
        messageEl.style.color = '#ef4444';
        return;
    }
    
    const applicant = {
        id: Date.now(),
        name: name,
        gameName: gameName,
        ovr: parseInt(ovr),
        h2hDivision: h2hDivision,
        vsaDivision: vsaDivision,
        managerDivision: managerDivision,
        contact: contact,
        appliedAt: new Date().toLocaleString('hu-HU')
    };
    
    // LocalStorage mentés
    let applicants = JSON.parse(localStorage.getItem(APPLICANTS_KEY) || '[]');
    applicants.push(applicant);
    localStorage.setItem(APPLICANTS_KEY, JSON.stringify(applicants));
    
    // Firebase mentés
    saveApplicantToFirebase(applicant);
    
    // Email küldés Formsubmit-en keresztül
    sendEmailViaFormsubmit(applicant, messageEl);
}

async function sendEmailViaFormsubmit(applicant, messageEl) {
    try {
        // Web3Forms API használata FormData-val
        const formData = new FormData();
        formData.append("access_key", "92793734-483e-4b53-9d0a-10d35716fb84");
        formData.append("subject", "HunRise Legacy - Új jelentkezés");
        formData.append("from_name", "HunRise Legacy Rendszer");
        formData.append("name", applicant.name);
        formData.append("email", applicant.contact);
        formData.append("message", 
            `Új jelentkezés érkezett!\n\n` +
            `Név: ${applicant.name}\n` +
            `In-Game név: ${applicant.gameName}\n` +
            `OVR: ${applicant.ovr}\n` +
            `H2H Division: ${applicant.h2hDivision}\n` +
            `VSA Division: ${applicant.vsaDivision}\n` +
            `Manager Division: ${applicant.managerDivision}\n` +
            `Elérhetőség: ${applicant.contact}\n\n` +
            `Jelentkezés időpontja: ${applicant.appliedAt}`
        );
        
        const response = await fetch("https://api.web3forms.com/submit", {
            method: "POST",
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            messageEl.textContent = '✓ Sikeresen beküldted a jelentkezést! Email értesítés elküldve.';
            messageEl.style.color = '#28a745';
        } else {
            throw new Error(data.message || 'Email küldés sikertelen');
        }
        
        document.getElementById('joinForm').reset();
        setTimeout(() => {
            closeJoinModal();
            messageEl.textContent = '';
        }, 2500);
    } catch (error) {
        console.error('Email küldési hiba:', error);
        messageEl.textContent = '✓ Jelentkezés mentve Firebase-be!';
        messageEl.style.color = '#28a745';
        
        document.getElementById('joinForm').reset();
        setTimeout(() => {
            closeJoinModal();
            messageEl.textContent = '';
        }, 2500);
    }
}

async function saveApplicantToFirebase(applicant) {
    try {
        const docId = `applicant_${applicant.id}`;
        const docPath = `projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/applicants/${docId}`;
        
        const body = {
            fields: {
                id: { integerValue: applicant.id.toString() },
                name: { stringValue: applicant.name },
                gameName: { stringValue: applicant.gameName },
                ovr: { integerValue: applicant.ovr.toString() },
                h2hDivision: { stringValue: applicant.h2hDivision },
                vsaDivision: { stringValue: applicant.vsaDivision },
                managerDivision: { stringValue: applicant.managerDivision },
                contact: { stringValue: applicant.contact },
                appliedAt: { stringValue: applicant.appliedAt }
            }
        };

        const response = await fetch(
            `https://firestore.googleapis.com/v1/${docPath}?key=${FIREBASE_API_KEY}`,
            {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            }
        );

        if (response.ok) {
            console.log('Jelentkezés sikeresen mentve Firebase-be');
        }
    } catch (error) {
        console.error('Firebase mentési hiba:', error);
    }
}

// Modal bezárása kívülre kattintás
window.onclick = function(event) {
    const modal = document.getElementById('playerModal');
    if (modal && event.target == modal) {
        modal.classList.remove('show');
    }
}

// Oldal betöltésekor
document.addEventListener('DOMContentLoaded', loadPlayers);


