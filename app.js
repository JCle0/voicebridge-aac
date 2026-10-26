const DB_NAME = 'VoiceBridgeDB';
const DB_VERSION = 2;

const DEFAULT_BOARDS = [
  { id: 'b1', name: 'Core Needs', order: 1 },
  { id: 'b2', name: 'Mealtime', order: 2 },
  { id: 'b3', name: 'Play & Fun', order: 3 },
  { id: 'b4', name: 'Comfort & Body', order: 4 },
  { id: 'b5', name: 'My Room & TV', order: 5 }
];

const DEFAULT_TILES = [
  { id: '1', category: 'Core Needs', label: 'Yes / Please', emoji: '✅', color: '#22c55e' },
  { id: '2', category: 'Core Needs', label: 'No / All Done', emoji: '🛑', color: '#ef4444' },
  { id: '3', category: 'Core Needs', label: 'Help Me', emoji: '🤝', color: '#eab308', sendPage: true, iotAction: { type: 'pager_urgent' } },
  { id: '4', category: 'Core Needs', label: 'Drink / Thirsty', emoji: '🥤', color: '#38bdf8', targetBoard: 'Mealtime', sendPage: true },
  { id: '5', category: 'Core Needs', label: 'Hungry', emoji: '🍎', color: '#eab308', targetBoard: 'Mealtime', sendPage: true },
  { id: '6', category: 'Core Needs', label: 'Bathroom', emoji: '🚽', color: '#38bdf8', sendPage: true },
  { id: '15', category: 'Core Needs', label: 'My Room & TV', emoji: '📺', color: '#f97316', targetBoard: 'My Room & TV' },
  { id: '20', category: 'Core Needs', label: 'Page Mom & Dad', emoji: '📲', color: '#ec4899', sendPage: true, iotAction: { type: 'pager_urgent' } },
  { id: '7', category: 'Mealtime', label: 'More Please', emoji: '➕', color: '#22c55e' },
  { id: '8', category: 'Mealtime', label: 'Water', emoji: '💧', color: '#38bdf8', sendPage: true },
  { id: '9', category: 'Mealtime', label: 'Favorite Snack', emoji: '🥨', color: '#eab308', sendPage: true },
  { id: '10', category: 'Play & Fun', label: 'Outside', emoji: '🌳', color: '#22c55e' },
  { id: '11', category: 'Play & Fun', label: 'Watch Bluey', emoji: '🐾', color: '#a855f7', iotAction: { type: 'roku_tv', rokuCmd: 'launch/291097', customIp: '' } },
  { id: '12', category: 'Comfort & Body', label: 'Too Loud', emoji: '🙉', color: '#ef4444', sendPage: true },
  { id: '13', category: 'Comfort & Body', label: 'Tired / Rest', emoji: '😴', color: '#a855f7' },
  { id: '14', category: 'Comfort & Body', label: 'Something Hurts', emoji: '🩹', color: '#ef4444', sendPage: true, iotAction: { type: 'pager_urgent' } },
  { id: '16', category: 'My Room & TV', label: 'Room Lights On/Off', emoji: '💡', color: '#eab308', iotAction: { type: 'hue_light', targetId: '1', command: 'toggle', colorPreset: 'warm', bri: 220 } },
  { id: '17', category: 'My Room & TV', label: 'Calm Blue Light', emoji: '🔵', color: '#38bdf8', iotAction: { type: 'hue_light', targetId: '1', command: 'color', colorPreset: 'blue', bri: 180 } },
  { id: '18', category: 'My Room & TV', label: 'Put On Bluey', emoji: '📺', color: '#a855f7', iotAction: { type: 'roku_tv', rokuCmd: 'launch/291097', customIp: '' } },
  { id: '19', category: 'My Room & TV', label: 'Play / Pause TV', emoji: '⏯️', color: '#22c55e', iotAction: { type: 'roku_tv', rokuCmd: 'keypress/Play', customIp: '' } }
];

let db;
let boards = [];
let tiles = [];
let currentCategory = 'Core Needs';
let stripItems = [];
let editMode = false;
let showSentenceBar = localStorage.getItem('vb_show_sentence') === 'true';

// 2-Choice "This or That" Split-Screen State
let twoChoiceMode = localStorage.getItem('vb_two_choice') === 'true';
let twoChoicePairIdx = 0;

// Smart Home & Family Pager Hub Config
let smartHubConfig = {
  pagerTopic: 'vb-authement-' + Math.floor(1000 + Math.random() * 9000),
  hueIp: '',
  hueKey: '',
  rokuIp: ''
};
try {
  const savedHub = localStorage.getItem('vb_smart_hub');
  if (savedHub) {
    const parsed = JSON.parse(savedHub);
    smartHubConfig = { ...smartHubConfig, ...parsed };
  }
  localStorage.setItem('vb_smart_hub', JSON.stringify(smartHubConfig));
} catch (e) {}

const SIZE_PRESETS = [
  { name: 'Standard', min: '160px', height: '154px', emoji: '3.3rem', font: '1.25rem' },
  { name: 'Large',    min: '240px', height: '195px', emoji: '4.3rem', font: '1.55rem' },
  { name: 'Compact',  min: '120px', height: '120px', emoji: '2.4rem', font: '1.0rem' }
];
let currentSizeIdx = 0;

let editingTileId = null;
let currentTileImageDataUrl = null;
let recordedAudioDataUrl = null;
let mediaRecorder = null;
let audioChunks = [];

// Eye Tracking & 1€ Velocity Filter State
let gazeMode = 'off';
let snapStrength = 'medium';
let dwellThresholdMs = 1100;
let filterStabilization = 6;
let gazeSensX = 7;
let gazeSensY = 9;
let invertX = false;
let invertY = false;

let rawGazeX = window.innerWidth / 2;
let rawGazeY = window.innerHeight / 2;
let smoothGazeX = rawGazeX;
let smoothGazeY = rawGazeY;

let calibMagnetActive = false;
let calibMagnetX = 0;
let calibMagnetY = 0;

let activeDwellEl = null;
let dwellProgressMs = 0;
let lastFrameTime = performance.now();
let cooldownEl = null;
let cooldownUntil = 0;

let faceLandmarker = null;
let mpLoading = false;
let camStream = null;
let lastVideoTime = -1;
let latestFeatX = 0;
let latestFeatY = 0;
let smoothFeatX = 0;
let smoothFeatY = 0;
let featVelocity = 0;
let faceDetected = false;
let initialZeroFrames = 0;
let activeCalibTrigger = null;
let calibIntervalId = null;

let calibData = {
  calibrated: false,
  centerX: 0,
  centerY: 0,
  leftDeltaX: -0.055,
  rightDeltaX: 0.055,
  upDeltaY: -0.040,
  downDeltaY: 0.040,
  pts: null
};

try {
  const savedCalib = localStorage.getItem('vb_gaze_calib_v5');
  if (savedCalib) calibData = JSON.parse(savedCalib);
} catch (e) {}

// Built-in Vector Illustrations for Bluey, Bingo, Bandit, Chilli & Muffin
function getBlueyCharacterSVG(charKey) {
  const configs = {
    bluey: {
      base: '#7ec8f8', patch: '#365899', muzzle: '#e8c382', brow: '#b6e3ff',
      innerEar: '#d4a373', mask: 'left', stubble: false
    },
    bingo: {
      base: '#f6a055', patch: '#b34e24', muzzle: '#fde6be', brow: '#ffd1a3',
      innerEar: '#f3c69f', mask: 'right', stubble: false
    },
    bandit: {
      base: '#7ec8f8', patch: '#253659', muzzle: '#e8c382', brow: '#b6e3ff',
      innerEar: '#d4a373', mask: 'both', stubble: true
    },
    chilli: {
      base: '#e57c3c', patch: '#9e3f19', muzzle: '#fde6be', brow: '#f9b98c',
      innerEar: '#eab892', mask: 'right', stubble: false
    },
    muffin: {
      base: '#e2e8f0', patch: '#475569', muzzle: '#ffffff', brow: '#cbd5e1',
      innerEar: '#f4a2b8', mask: 'both', stubble: false
    }
  };

  const c = configs[charKey] || configs.bluey;

  let patchesSVG = '';
  if (c.mask === 'left') {
    patchesSVG = `<ellipse cx="34" cy="46" rx="15" ry="18" fill="${c.patch}" />`;
  } else if (c.mask === 'right') {
    patchesSVG = `<ellipse cx="66" cy="46" rx="15" ry="18" fill="${c.patch}" />`;
  } else {
    patchesSVG = `
      <ellipse cx="35" cy="46" rx="16" ry="19" fill="${c.patch}" />
      <ellipse cx="65" cy="46" rx="16" ry="19" fill="${c.patch}" />
      <rect x="30" y="28" width="40" height="22" rx="8" fill="${c.patch}" />
    `;
  }

  const stubbleSVG = c.stubble
    ? `<circle cx="34" cy="76" r="1.4" fill="#475569"/><circle cx="42" cy="80" r="1.4" fill="#475569"/><circle cx="58" cy="80" r="1.4" fill="#475569"/><circle cx="66" cy="76" r="1.4" fill="#475569"/>`
    : '';

  return `
    <svg viewBox="0 0 100 100" width="80" height="80" xmlns="http://www.w3.org/2000/svg">
      <polygon points="16,34 8,6 38,22" fill="${c.patch}" stroke="#0f172a" stroke-width="2.5" stroke-linejoin="round"/>
      <polygon points="18,30 13,12 33,23" fill="${c.innerEar}"/>
      <polygon points="84,34 92,6 62,22" fill="${c.base}" stroke="#0f172a" stroke-width="2.5" stroke-linejoin="round"/>
      <polygon points="82,30 87,12 67,23" fill="${c.innerEar}"/>
      <rect x="18" y="20" width="64" height="68" rx="26" fill="${c.base}" stroke="#0f172a" stroke-width="2.5"/>
      ${patchesSVG}
      <rect x="25" y="24" width="14" height="6" rx="3" transform="rotate(-10 32 27)" fill="${c.brow}" stroke="#0f172a" stroke-width="1.5"/>
      <rect x="61" y="24" width="14" height="6" rx="3" transform="rotate(10 68 27)" fill="${c.brow}" stroke="#0f172a" stroke-width="1.5"/>
      <ellipse cx="35" cy="46" rx="8.5" ry="10.5" fill="#ffffff" stroke="#0f172a" stroke-width="2"/>
      <ellipse cx="65" cy="46" rx="8.5" ry="10.5" fill="#ffffff" stroke="#0f172a" stroke-width="2"/>
      <circle cx="37" cy="46" r="4.5" fill="#0f172a"/>
      <circle cx="63" cy="46" r="4.5" fill="#0f172a"/>
      <circle cx="38.5" cy="44" r="1.6" fill="#ffffff"/>
      <circle cx="64.5" cy="44" r="1.6" fill="#ffffff"/>
      <ellipse cx="50" cy="69" rx="24" ry="17" fill="${c.muzzle}" stroke="#0f172a" stroke-width="2"/>
      <ellipse cx="50" cy="61" rx="8" ry="5.5" fill="#0f172a"/>
      <ellipse cx="48" cy="59.5" rx="2.5" ry="1.2" fill="#ffffff" opacity="0.65"/>
      <path d="M 39 71 Q 50 80 61 71" fill="none" stroke="#0f172a" stroke-width="2.5" stroke-linecap="round"/>
      ${stubbleSVG}
    </svg>
  `;
}

function playChime(freq = 660) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.14, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.22);
  } catch (e) {}
}

function playBlueyFanfare() {
  const notes = [523.25, 587.33, 659.25, 783.99];
  notes.forEach((n, idx) => {
    setTimeout(() => playChime(n), idx * 90);
  });
}

function showToast(msg, duration = 2400) {
  const t = document.getElementById('iotToast');
  if (!t) return;
  t.textContent = msg;
  t.style.display = 'flex';
  clearTimeout(window._iotToastTimer);
  window._iotToastTimer = setTimeout(() => {
    t.style.display = 'none';
  }, duration);
}

// 1. Database Setup
function initDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains('tiles')) {
        database.createObjectStore('tiles', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('boards')) {
        database.createObjectStore('boards', { keyPath: 'id' });
      }
    };
    req.onsuccess = (e) => {
      db = e.target.result;
      resolve();
    };
    req.onerror = (e) => reject(e);
  });
}

async function loadDataFromDB() {
  await new Promise((resolve) => {
    const tx = db.transaction('boards', 'readonly');
    const req = tx.objectStore('boards').getAll();
    req.onsuccess = () => {
      if (req.result.length === 0) {
        const wTx = db.transaction('boards', 'readwrite');
        DEFAULT_BOARDS.forEach(b => wTx.objectStore('boards').put(b));
        boards = [...DEFAULT_BOARDS];
      } else {
        boards = req.result.sort((a, b) => a.order - b.order);
        if (!boards.some(b => b.name === 'My Room & TV')) {
          const roomBoard = { id: 'b5', name: 'My Room & TV', order: boards.length + 1 };
          boards.push(roomBoard);
          saveBoardToDB(roomBoard);
        }
      }
      currentCategory = boards[0]?.name || 'Core Needs';
      resolve();
    };
  });

  await new Promise((resolve) => {
    const tx = db.transaction('tiles', 'readonly');
    const req = tx.objectStore('tiles').getAll();
    req.onsuccess = () => {
      if (req.result.length === 0) {
        const wTx = db.transaction('tiles', 'readwrite');
        DEFAULT_TILES.forEach(t => wTx.objectStore('tiles').put(t));
        tiles = [...DEFAULT_TILES];
      } else {
        tiles = req.result;
        tiles.forEach(t => {
          let updated = false;
          if ((t.label === 'Hungry' || t.label === 'Drink / Thirsty') && !t.targetBoard) {
            t.targetBoard = 'Mealtime';
            updated = true;
          }
          if ((t.label === 'Help Me' || t.label === 'Something Hurts') && t.sendPage === undefined) {
            t.sendPage = true;
            updated = true;
          }
          if (updated) saveTileToDB(t);
        });
        if (!tiles.some(t => t.category === 'My Room & TV')) {
          DEFAULT_TILES.filter(t => t.category === 'My Room & TV' || t.id === '15').forEach(t => {
            tiles.push(t);
            saveTileToDB(t);
          });
        }
        if (!tiles.some(t => t.id === '20')) {
          const pageTile = DEFAULT_TILES.find(t => t.id === '20');
          if (pageTile) {
            tiles.push(pageTile);
            saveTileToDB(pageTile);
          }
        }
      }
      resolve();
    };
  });
}

function saveBoardToDB(board) {
  return new Promise((resolve) => {
    const tx = db.transaction('boards', 'readwrite');
    tx.objectStore('boards').put(board);
    tx.oncomplete = () => resolve();
  });
}

function renameBoardInDB(board, oldName, newName) {
  return new Promise((resolve) => {
    const tx = db.transaction(['boards', 'tiles'], 'readwrite');
    tx.objectStore('boards').put(board);
    const tileStore = tx.objectStore('tiles');
    tiles.forEach(t => {
      let changed = false;
      if (t.category === oldName) {
        t.category = newName;
        changed = true;
      }
      if (t.targetBoard === oldName) {
        t.targetBoard = newName;
        changed = true;
      }
      if (changed) tileStore.put(t);
    });
    tx.oncomplete = () => resolve();
  });
}

function deleteBoardFromDB(boardId, boardName) {
  return new Promise((resolve) => {
    const tx = db.transaction(['boards', 'tiles'], 'readwrite');
    tx.objectStore('boards').delete(boardId);
    const tileStore = tx.objectStore('tiles');
    tiles.filter(t => t.category === boardName).forEach(t => tileStore.delete(t.id));
    tx.oncomplete = () => resolve();
  });
}

function saveTileToDB(tile) {
  return new Promise((resolve) => {
    const tx = db.transaction('tiles', 'readwrite');
    tx.objectStore('tiles').put(tile);
    tx.oncomplete = () => resolve();
  });
}

function deleteTileFromDB(id) {
  return new Promise((resolve) => {
    const tx = db.transaction('tiles', 'readwrite');
    tx.objectStore('tiles').delete(id);
    tx.oncomplete = () => resolve();
  });
}

// 2-Choice Split-Screen Mode Toggle & Pagination
function applyTwoChoiceState() {
  document.body.classList.toggle('two-choice-mode', twoChoiceMode);
  const btn = document.getElementById('twoChoiceBtn');
  if (btn) {
    btn.textContent = twoChoiceMode ? '⚖️ 2-Choice: ON' : '⚖️ 2-Choice: OFF';
    btn.classList.toggle('active', twoChoiceMode);
  }
}

function toggleTwoChoiceMode() {
  twoChoiceMode = !twoChoiceMode;
  twoChoicePairIdx = 0;
  localStorage.setItem('vb_two_choice', twoChoiceMode);
  applyTwoChoiceState();
  renderBoard();
}

function stepTwoChoicePair(delta) {
  const filtered = tiles.filter(t => t.category === currentCategory);
  const totalPairs = Math.max(1, Math.ceil(filtered.length / 2));
  twoChoicePairIdx = (twoChoicePairIdx + delta + totalPairs) % totalPairs;
  renderBoard();
}

function applySentenceBarState() {
  document.body.classList.toggle('show-sentence', showSentenceBar);
  const btn = document.getElementById('sentenceToggleBtn');
  if (btn) {
    btn.textContent = showSentenceBar ? '💬 Sentence: ON' : '💬 Sentence: OFF';
    btn.classList.toggle('active', showSentenceBar);
  }
}

function toggleSentenceBar() {
  showSentenceBar = !showSentenceBar;
  localStorage.setItem('vb_show_sentence', showSentenceBar);
  applySentenceBarState();
}

function cycleTileSize() {
  currentSizeIdx = (currentSizeIdx + 1) % SIZE_PRESETS.length;
  const p = SIZE_PRESETS[currentSizeIdx];
  document.documentElement.style.setProperty('--tile-min', p.min);
  document.documentElement.style.setProperty('--tile-height', p.height);
  document.documentElement.style.setProperty('--tile-emoji', p.emoji);
  document.documentElement.style.setProperty('--tile-font', p.font);
}

// 2. Render Dynamic Boards & Tiles
function renderCategories() {
  const bar = document.getElementById('categoryBar');
  bar.innerHTML = '';

  const homeBoardName = boards[0]?.name || 'Core Needs';

  if (currentCategory !== homeBoardName) {
    const homeBtn = document.createElement('button');
    homeBtn.className = 'home-jump-btn visible dwell-target';
    homeBtn.innerHTML = '⬅️ 🏠 Core';
    homeBtn.onclick = () => {
      currentCategory = homeBoardName;
      twoChoicePairIdx = 0;
      renderCategories();
      renderBoard();
    };
    bar.appendChild(homeBtn);
  }

  boards.forEach(board => {
    const btn = document.createElement('button');
    btn.className = `cat-tab dwell-target ${board.name === currentCategory ? 'active' : ''}`;

    const titleSpan = document.createElement('span');
    titleSpan.textContent = board.name;
    btn.appendChild(titleSpan);

    const editBtn = document.createElement('span');
    editBtn.className = 'cat-icon-btn cat-edit-btn';
    editBtn.textContent = '✏️';
    editBtn.onclick = async (e) => {
      e.stopPropagation();
      const newName = prompt('Rename Board:', board.name);
      if (!newName || !newName.trim() || newName.trim() === board.name) return;
      const cleanName = newName.trim();
      if (boards.some(b => b.id !== board.id && b.name.toLowerCase() === cleanName.toLowerCase())) {
        return alert('Another board already has that name.');
      }
      const oldName = board.name;
      board.name = cleanName;
      await renameBoardInDB(board, oldName, cleanName);
      if (currentCategory === oldName) currentCategory = cleanName;
      renderCategories();
      renderBoard();
    };
    btn.appendChild(editBtn);

    if (boards.length > 1) {
      const del = document.createElement('span');
      del.className = 'cat-icon-btn cat-del-btn';
      del.textContent = '✕';
      del.onclick = async (e) => {
        e.stopPropagation();
        if (confirm(`Delete board "${board.name}" and all tiles inside it?`)) {
          await deleteBoardFromDB(board.id, board.name);
          boards = boards.filter(b => b.id !== board.id);
          tiles = tiles.filter(t => t.category !== board.name);
          if (currentCategory === board.name) {
            currentCategory = boards[0].name;
          }
          twoChoicePairIdx = 0;
          renderCategories();
          renderBoard();
        }
      };
      btn.appendChild(del);
    }

    btn.onclick = () => {
      currentCategory = board.name;
      twoChoicePairIdx = 0;
      renderCategories();
      renderBoard();
    };
    bar.appendChild(btn);
  });

  const addBoardBtn = document.createElement('button');
  addBoardBtn.className = 'add-board-btn';
  addBoardBtn.textContent = '➕ New Board';
  addBoardBtn.onclick = async () => {
    const name = prompt('Enter a name for the new Board:');
    if (!name || !name.trim()) return;
    const cleanName = name.trim();
    if (boards.some(b => b.name.toLowerCase() === cleanName.toLowerCase())) {
      return alert('A board with that name already exists.');
    }
    const newBoard = {
      id: 'b_' + Date.now(),
      name: cleanName,
      order: boards.length + 1
    };
    boards.push(newBoard);
    await saveBoardToDB(newBoard);
    currentCategory = cleanName;
    twoChoicePairIdx = 0;
    renderCategories();
    renderBoard();
  };
  bar.appendChild(addBoardBtn);
}

function renderBoard() {
  const grid = document.getElementById('boardGrid');
  grid.innerHTML = '';

  const allCategoryTiles = tiles.filter(t => t.category === currentCategory);
  const totalPairs = Math.max(1, Math.ceil(allCategoryTiles.length / 2));
  if (twoChoicePairIdx >= totalPairs) twoChoicePairIdx = 0;

  const pairIndicator = document.getElementById('pairIndicator');
  if (pairIndicator) {
    pairIndicator.textContent = `Pair ${twoChoicePairIdx + 1} of ${totalPairs}`;
  }

  // If 2-Choice Mode is ON (and not in Edit Mode), show only the active pair of giant tiles
  const visibleTiles = (twoChoiceMode && !editMode)
    ? allCategoryTiles.slice(twoChoicePairIdx * 2, twoChoicePairIdx * 2 + 2)
    : allCategoryTiles;

  visibleTiles.forEach(tile => {
    const card = document.createElement('div');
    card.className = 'tile dwell-target';
    card.style.borderColor = tile.color || '#38bdf8';

    const editBtn = document.createElement('button');
    editBtn.className = 'tile-badge edit-badge';
    editBtn.textContent = '✏️';
    editBtn.onclick = (e) => {
      e.stopPropagation();
      openTileModal(tile);
    };
    card.appendChild(editBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'tile-badge delete-badge';
    delBtn.textContent = '✕';
    delBtn.onclick = async (e) => {
      e.stopPropagation();
      if (confirm(`Delete "${tile.label}"?`)) {
        tiles = tiles.filter(item => item.id !== tile.id);
        await deleteTileFromDB(tile.id);
        renderBoard();
      }
    };
    card.appendChild(delBtn);

    if (tile.imageDataUrl) {
      const img = document.createElement('img');
      img.src = tile.imageDataUrl;
      img.className = 'tile-visual';
      card.appendChild(img);
    } else {
      const emoji = document.createElement('div');
      emoji.className = 'tile-visual';
      emoji.textContent = tile.emoji || '⭐';
      card.appendChild(emoji);
    }

    const label = document.createElement('div');
    label.className = 'tile-label';
    label.textContent = tile.label;
    card.appendChild(label);

    // Bottom Indicator Pills for Board Jump, Pager, or Smart Home Action
    const hasJump = tile.targetBoard && tile.targetBoard.trim() !== '';
    const hasIot = tile.iotAction && tile.iotAction.type && tile.iotAction.type !== 'none';
    const hasPage = Boolean(tile.sendPage) || (hasIot && tile.iotAction.type === 'pager_urgent');

    if (hasJump || hasIot || hasPage) {
      const metaRow = document.createElement('div');
      metaRow.className = 'tile-meta-row';
      if (hasJump) {
        const jumpPill = document.createElement('span');
        jumpPill.className = 'tile-pill pill-jump';
        jumpPill.textContent = `📂 ➔ ${tile.targetBoard}`;
        metaRow.appendChild(jumpPill);
      }
      if (hasPage) {
        const pagePill = document.createElement('span');
        pagePill.className = 'tile-pill pill-page';
        pagePill.textContent = '📲 Pager';
        metaRow.appendChild(pagePill);
      }
      if (hasIot && tile.iotAction.type !== 'pager_urgent') {
        const iotPill = document.createElement('span');
        iotPill.className = 'tile-pill pill-iot';
        const iotIcon = tile.iotAction.type.startsWith('hue') ? '💡 Hue' :
                        tile.iotAction.type === 'roku_tv' ? '📺 TV' : '⚡ Smart';
        iotPill.textContent = iotIcon;
        metaRow.appendChild(iotPill);
      }
      card.appendChild(metaRow);
    }

    card.onclick = () => handleTileTap(tile, card);
    grid.appendChild(card);
  });

  if (editMode) {
    const addCard = document.createElement('div');
    addCard.className = 'tile add-tile-card';
    addCard.innerHTML = `<div class="tile-visual">➕</div><div class="tile-label">Add Tile</div>`;
    addCard.onclick = () => openTileModal(null);
    grid.appendChild(addCard);
  }
}

// 3. Speech, Board Jump, Phone Pager & Smart Home Execution Engine
function playTileAudio(tile) {
  if (tile.audioDataUrl) {
    const audio = new Audio(tile.audioDataUrl);
    audio.play();
  } else if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(tile.label);
    utter.rate = 0.95;
    window.speechSynthesis.speak(utter);
  }
}

async function handleTileTap(tile, cardEl) {
  if (cardEl) {
    cardEl.classList.add('dwell-triggered');
    setTimeout(() => cardEl.classList.remove('dwell-triggered'), 240);
  }

  // 1. Speak the Tile
  playTileAudio(tile);

  // 2. Add to Sentence Strip if enabled
  if (showSentenceBar) {
    stripItems.push(tile);
    renderStrip();
  }

  // 3. Send Instant Family Pager Push Notification if enabled on this tile
  const isUrgentPage = tile.iotAction && tile.iotAction.type === 'pager_urgent';
  if (tile.sendPage || isUrgentPage) {
    sendFamilyPagerAlert(tile.label, isUrgentPage);
  }

  // 4. Trigger Smart Home Action (Philips Hue / Smart TV / Webhook) if configured
  if (tile.iotAction && tile.iotAction.type && tile.iotAction.type !== 'none' && tile.iotAction.type !== 'pager_urgent') {
    executeSmartHomeAction(tile.iotAction, tile.label);
  }

  // 5. Switch to Target Board if configured
  if (tile.targetBoard && boards.some(b => b.name === tile.targetBoard)) {
    setTimeout(() => {
      currentCategory = tile.targetBoard;
      twoChoicePairIdx = 0;
      renderCategories();
      renderBoard();
    }, 420);
  }
}

// Instant Push Notification to Mom/Dad's Phone via ntfy.sh (HTTPS, Zero Account Required)
async function sendFamilyPagerAlert(tileLabel, isUrgent = false) {
  const topic = (smartHubConfig.pagerTopic || '').trim();
  if (!topic) {
    showToast('⚠️ Set your Pager Channel in 💡 Smart Home & Pager!', 3000);
    return;
  }

  try {
    await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
      method: 'POST',
      headers: {
        'Title': isUrgent ? `🚨 URGENT: ${tileLabel}` : `📲 VoiceBridge: ${tileLabel}`,
        'Priority': isUrgent ? '5' : '4',
        'Tags': isUrgent ? 'rotating_light,sos' : 'bell,speech_balloon'
      },
      body: `He pressed "${tileLabel}" on the ${currentCategory} board.`
    });
    showToast(`📲 Paged Family: "${tileLabel}"`);
  } catch (err) {
    showToast('⚠️ Pager offline (Check internet connection)', 2800);
  }
}

async function sendTestPage() {
  const inputTopic = document.getElementById('hubPagerTopic').value.trim();
  if (!inputTopic) return alert('Please enter a Pager Channel name first.');
  smartHubConfig.pagerTopic = inputTopic;
  localStorage.setItem('vb_smart_hub', JSON.stringify(smartHubConfig));
  await sendFamilyPagerAlert('Test Alert from VoiceBridge! 🎉', true);
}

// Execute Philips Hue, Roku Smart TV, or Webhook Locally over Home Wi-Fi
async function executeSmartHomeAction(iot, label) {
  try {
    if (iot.type === 'hue_light' || iot.type === 'hue_group') {
      const ip = (smartHubConfig.hueIp || '').trim();
      const key = (smartHubConfig.hueKey || '').trim();
      if (!ip || !key) {
        showToast('⚠️ Pair Philips Hue in 💡 Smart Home first!', 3000);
        return;
      }

      const id = (iot.targetId || '1').trim();
      const isGroup = iot.type === 'hue_group';
      const baseUrl = `http://${ip}/api/${key}/${isGroup ? 'groups' : 'lights'}/${id}`;
      const stateEndpoint = `${baseUrl}/${isGroup ? 'action' : 'state'}`;

      let bodyPayload = { on: true };

      if (iot.command === 'off') {
        bodyPayload = { on: false };
      } else if (iot.command === 'on') {
        bodyPayload = { on: true, bri: 254 };
      } else if (iot.command === 'toggle') {
        try {
          const statusRes = await fetch(baseUrl);
          const statusData = await statusRes.json();
          const currentlyOn = isGroup
            ? (statusData.state && statusData.state.any_on)
            : (statusData.state && statusData.state.on);
          bodyPayload = { on: !currentlyOn };
        } catch (e) {
          bodyPayload = { on: true };
        }
      } else if (iot.command === 'color') {
        const presets = {
          warm:   { ct: 400, sat: 200 },
          blue:   { hue: 45000, sat: 254 },
          purple: { hue: 50000, sat: 254 },
          green:  { hue: 25500, sat: 254 },
          red:    { hue: 0, sat: 254 }
        };
        const chosen = presets[iot.colorPreset] || presets.warm;
        bodyPayload = {
          on: true,
          bri: Math.min(254, Math.max(1, parseInt(iot.bri || 200, 10))),
          ...chosen
        };
      }

      await fetch(stateEndpoint, {
        method: 'PUT',
        body: JSON.stringify(bodyPayload)
      });
      showToast(`💡 Hue: ${label}`);
    } else if (iot.type === 'roku_tv') {
      const tvIp = (iot.customIp || smartHubConfig.rokuIp || '').trim();
      if (!tvIp) {
        showToast('⚠️ Set your Roku TV IP in 💡 Smart Home first!', 3000);
        return;
      }
      const cmd = iot.rokuCmd || 'keypress/Home';
      if (cmd.startsWith('launch/')) {
        fetch(`http://${tvIp}:8060/keypress/PowerOn`, { method: 'POST', mode: 'no-cors' }).catch(() => {});
      }
      await fetch(`http://${tvIp}:8060/${cmd}`, {
        method: 'POST',
        mode: 'no-cors'
      });
      showToast(`📺 TV: ${label}`);
    } else if (iot.type === 'webhook') {
      const url = (iot.url || '').trim();
      if (!url) return;
      const method = iot.method || 'POST';
      const opts = { method };
      if (method !== 'GET' && iot.body && iot.body.trim()) {
        opts.body = iot.body.trim();
      }
      await fetch(url, opts).catch(() => fetch(url, { ...opts, mode: 'no-cors' }));
      showToast(`⚡ Sent: ${label}`);
    }
  } catch (err) {
    showToast(`⚠️ Check Wi-Fi / Hub Settings (${err.message || 'Network Blocked'})`, 3200);
  }
}

// Smart Home Hub Setup & Philips Hue Bridge Pairing Functions
function openSmartHubModal() {
  document.getElementById('hubPagerTopic').value = smartHubConfig.pagerTopic || '';
  document.getElementById('hubHueIp').value = smartHubConfig.hueIp || '';
  document.getElementById('hubHueKey').value = smartHubConfig.hueKey || '';
  document.getElementById('hubRokuIp').value = smartHubConfig.rokuIp || '';
  document.getElementById('huePairStatus').textContent = '';
  document.getElementById('smartHubModal').classList.add('open');
}

function closeSmartHubModal() {
  document.getElementById('smartHubModal').classList.remove('open');
}

function saveSmartHubSettings() {
  smartHubConfig.pagerTopic = document.getElementById('hubPagerTopic').value.trim();
  smartHubConfig.hueIp = document.getElementById('hubHueIp').value.trim();
  smartHubConfig.hueKey = document.getElementById('hubHueKey').value.trim();
  smartHubConfig.rokuIp = document.getElementById('hubRokuIp').value.trim();
  try {
    localStorage.setItem('vb_smart_hub', JSON.stringify(smartHubConfig));
  } catch (e) {}
  closeSmartHubModal();
  showToast('✅ Pager & Smart Home Settings Saved!');
}

async function discoverHueBridge() {
  const statusEl = document.getElementById('huePairStatus');
  statusEl.textContent = '🔍 Searching local network via Hue Discovery...';
  try {
    const res = await fetch('https://discovery.meethue.com/');
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0 && data[0].internalipaddress) {
      document.getElementById('hubHueIp').value = data[0].internalipaddress;
      statusEl.textContent = `✅ Found Hue Bridge at ${data[0].internalipaddress}! Now press the physical button on top of your Hue Bridge and click Pair.`;
    } else {
      statusEl.textContent = '⚠️ Could not auto-detect. Please type your Hue Bridge IP from your router or Hue app.';
    }
  } catch (err) {
    statusEl.textContent = '⚠️ Discovery blocked or offline. Type your Hue Bridge IP manually (e.g., 192.168.1.x).';
  }
}

async function pairHueBridge() {
  const ip = document.getElementById('hubHueIp').value.trim();
  const statusEl = document.getElementById('huePairStatus');
  if (!ip) return alert('Please enter your Philips Hue Bridge IP address first.');

  statusEl.textContent = '⏳ Connecting to Hue Bridge...';
  try {
    const res = await fetch(`http://${ip}/api`, {
      method: 'POST',
      body: JSON.stringify({ devicetype: 'voicebridge_aac#son' })
    });
    const data = await res.json();
    if (Array.isArray(data) && data[0]?.error?.type === 101) {
      statusEl.innerHTML = `<span style="color:#fde047;">👉 Press the physical link button on top of your Philips Hue Bridge right now, then click Pair again within 30 seconds!</span>`;
    } else if (Array.isArray(data) && data[0]?.success?.username) {
      const username = data[0].success.username;
      document.getElementById('hubHueKey').value = username;
      smartHubConfig.hueIp = ip;
      smartHubConfig.hueKey = username;
      localStorage.setItem('vb_smart_hub', JSON.stringify(smartHubConfig));
      statusEl.innerHTML = `<span style="color:#22c55e;">🎉 Paired Successfully! Key saved. Click "📋 View Light IDs" to see your bulb numbers.</span>`;
    } else {
      statusEl.textContent = 'Unexpected response: ' + JSON.stringify(data);
    }
  } catch (err) {
    statusEl.innerHTML = `<span style="color:#f87171;">⚠️ Connection blocked by browser HTTPS rules. Allow Insecure Content in Site Settings for local Wi-Fi, or run from launch_dev.bat.</span>`;
  }
}

async function listHueLights() {
  const ip = document.getElementById('hubHueIp').value.trim();
  const key = document.getElementById('hubHueKey').value.trim();
  const statusEl = document.getElementById('huePairStatus');
  if (!ip || !key) return alert('Pair your Hue Bridge first so IP and Key are filled in.');

  try {
    const res = await fetch(`http://${ip}/api/${key}/lights`);
    const lights = await res.json();
    const lines = Object.keys(lights).map(id => `<b>ID ${id}:</b> ${lights[id].name} (${lights[id].state?.on ? 'ON' : 'OFF'})`);
    statusEl.innerHTML = lines.length ? lines.join('<br/>') : 'No lights found.';
  } catch (err) {
    statusEl.textContent = 'Could not fetch lights: ' + err.message;
  }
}

function renderStrip() {
  const strip = document.getElementById('sentenceStrip');
  strip.innerHTML = '';
  stripItems.forEach((item) => {
    const chip = document.createElement('div');
    chip.className = 'strip-chip';
    chip.style.borderColor = item.color;
    chip.textContent = `${item.emoji || ''} ${item.label}`;
    strip.appendChild(chip);
  });
}

async function speakStrip() {
  for (const item of stripItems) {
    playTileAudio(item);
    await new Promise(r => setTimeout(r, 1100));
  }
}

function clearStrip() {
  stripItems = [];
  renderStrip();
}

// 4. Eye-Gaze Engine (With 2-Choice Left/Right Axis Lock Assist!)
function openGazeModal() {
  document.getElementById('gazeModal').classList.add('open');
}
function closeGazeModal() {
  document.getElementById('gazeModal').classList.remove('open');
}

async function applyGazeSettings() {
  gazeMode = document.getElementById('gazeModeSelect').value;
  snapStrength = document.getElementById('snapSelect').value;
  const camPreview = document.getElementById('camPreviewSelect').value;
  dwellThresholdMs = parseInt(document.getElementById('dwellTimeSlider').value, 10);
  gazeSensX = parseInt(document.getElementById('sensXSlider').value, 10);
  gazeSensY = parseInt(document.getElementById('sensYSlider').value, 10);
  filterStabilization = parseInt(document.getElementById('smoothingSlider').value, 10);
  invertX = document.getElementById('invertXCheck').checked;
  invertY = document.getElementById('invertYCheck').checked;

  document.body.classList.toggle('hide-cam-preview', camPreview === 'hidden');
  const gazeBtn = document.getElementById('gazeBtn');
  const camBox = document.getElementById('camPreviewBox');

  closeGazeModal();

  if (gazeMode === 'off') {
    document.body.classList.remove('gaze-active');
    gazeBtn.textContent = '👁️ Gaze: OFF';
    gazeBtn.classList.remove('active');
    camBox.classList.remove('active');
    stopCameraStream();
    resetAllDwellVisuals();
  } else if (gazeMode === 'cursor') {
    document.body.classList.add('gaze-active');
    gazeBtn.textContent = '👁️ Gaze: Cursor';
    gazeBtn.classList.add('active');
    camBox.classList.remove('active');
    stopCameraStream();
  } else {
    document.body.classList.add('gaze-active');
    const modeLabels = { webcam: '👁️ Gaze: Cam', eyes: '👁️ Gaze: Eyes', head: '👁️ Gaze: Head' };
    gazeBtn.textContent = modeLabels[gazeMode] || '👁️ Gaze: Cam';
    gazeBtn.classList.add('active');
    camBox.classList.add('active');
    initialZeroFrames = 0;
    await initMediaPipeCamera();
  }
}

function quickCenterGaze() {
  if (gazeMode !== 'off' && gazeMode !== 'cursor') {
    calibData.centerX = smoothFeatX;
    calibData.centerY = smoothFeatY;
    try {
      localStorage.setItem('vb_gaze_calib_v5', JSON.stringify(calibData));
    } catch (e) {}
  }
  rawGazeX = window.innerWidth / 2;
  rawGazeY = window.innerHeight / 2;
  smoothGazeX = rawGazeX;
  smoothGazeY = rawGazeY;
  playChime(520);
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && document.activeElement.tagName !== 'INPUT') {
    const calibOpen = document.getElementById('calibrationOverlay').classList.contains('open');
    if (calibOpen && typeof activeCalibTrigger === 'function') {
      e.preventDefault();
      activeCalibTrigger();
    } else if (gazeMode !== 'off') {
      e.preventDefault();
      quickCenterGaze();
    }
  }
});

function stopCameraStream() {
  if (camStream) {
    camStream.getTracks().forEach(t => t.stop());
    camStream = null;
  }
}

async function initMediaPipeCamera() {
  const banner = document.getElementById('calibStatusBanner');
  try {
    if (!camStream) {
      camStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 60 } },
        audio: false
      });
      const videoEl = document.getElementById('camVideo');
      videoEl.srcObject = camStream;
      await videoEl.play();
    }

    if (!faceLandmarker && !mpLoading) {
      mpLoading = true;
      if (banner) banner.textContent = '⏳ Loading Google MediaPipe 3D Gaze AI...';

      const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3');
      const { FaceLandmarker, FilesetResolver } = vision;
      const filesetResolver = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm'
      );

      const opts = {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'GPU'
        },
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
        runningMode: 'VIDEO',
        numFaces: 1
      };

      try {
        faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, opts);
      } catch (gpuErr) {
        opts.baseOptions.delegate = 'CPU';
        faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, opts);
      }
      mpLoading = false;
    }
  } catch (err) {
    mpLoading = false;
    alert('Camera / Eye Tracker Error: ' + err.message);
  }
}

function rotateDeRoll(x, y, cosR, sinR) {
  return {
    x: x * cosR - y * sinR,
    y: x * sinR + y * cosR
  };
}

function processVideoFrame() {
  if ((gazeMode === 'off' || gazeMode === 'cursor') || !faceLandmarker || !camStream) return;

  const videoEl = document.getElementById('camVideo');
  if (videoEl.readyState < 2) return;

  const nowMs = performance.now();
  if (videoEl.currentTime === lastVideoTime) return;
  lastVideoTime = videoEl.currentTime;

  const results = faceLandmarker.detectForVideo(videoEl, nowMs);
  const camBox = document.getElementById('camPreviewBox');

  if (results.faceLandmarks && results.faceLandmarks.length > 0) {
    const L = results.faceLandmarks[0];
    faceDetected = true;
    camBox.classList.add('tracking-ok');

    const dxEye = L[263].x - L[33].x;
    const dyEye = L[263].y - L[33].y;
    const rollAngle = Math.atan2(dyEye, dxEye);
    const cosR = Math.cos(-rollAngle);
    const sinR = Math.sin(-rollAngle);
    const faceScale = Math.hypot(dxEye, dyEye) || 0.15;

    const origin = L[168];
    const rel = (idx) => rotateDeRoll(
      (L[idx].x - origin.x) / faceScale,
      (L[idx].y - origin.y) / faceScale,
      cosR,
      sinR
    );

    const noseTip = rel(1);
    const rightCheek = rel(234);
    const leftCheek = rel(454);

    const rEyeOuter = rel(33);
    const rEyeInner = rel(133);
    const rEyeTop = rel(159);
    const rIris = rel(468);

    const lEyeInner = rel(362);
    const lEyeOuter = rel(263);
    const lEyeTop = rel(386);
    const lIris = rel(473);

    const cheekMidX = (rightCheek.x + leftCheek.x) * 0.5;
    const cheekMidY = (rightCheek.y + leftCheek.y) * 0.5;
    const headYaw = cheekMidX - noseTip.x;
    const headPitch = noseTip.y - cheekMidY;

    const w1 = Math.max(0.05, rEyeInner.x - rEyeOuter.x);
    const w2 = Math.max(0.05, lEyeOuter.x - lEyeInner.x);

    const rMidX = (rEyeOuter.x + rEyeInner.x) * 0.5;
    const lMidX = (lEyeOuter.x + lEyeInner.x) * 0.5;
    const irisX = (((rMidX - rIris.x) / w1) + ((lMidX - lIris.x) / w2)) * 0.5;

    const rCornerY = (rEyeOuter.y + rEyeInner.y) * 0.5;
    const lCornerY = (lEyeOuter.y + lEyeInner.y) * 0.5;
    const irisRigidY = (((rIris.y - rCornerY) / w1) + ((lIris.y - lCornerY) / w2)) * 0.5;
    const lidPitchY = (((rEyeTop.y - rCornerY) / w1) + ((lEyeTop.y - lCornerY) / w2)) * 0.5;

    let lookUp = 0, lookDown = 0, lookRight = 0, lookLeft = 0;
    if (results.faceBlendshapes && results.faceBlendshapes.length > 0) {
      const cats = results.faceBlendshapes[0].categories;
      for (let i = 0; i < cats.length; i++) {
        const n = cats[i].categoryName;
        const s = cats[i].score;
        if (n === 'eyeLookUpLeft' || n === 'eyeLookUpRight') lookUp += s * 0.5;
        else if (n === 'eyeLookDownLeft' || n === 'eyeLookDownRight') lookDown += s * 0.5;
        else if (n === 'eyeLookOutLeft' || n === 'eyeLookInRight') lookRight += s * 0.5;
        else if (n === 'eyeLookOutRight' || n === 'eyeLookInLeft') lookLeft += s * 0.5;
      }
    }

    const blendX = lookRight - lookLeft;
    const blendY = lookDown - lookUp;

    if (gazeMode === 'head') {
      latestFeatX = (headYaw * 1.55) + (blendX * 0.25);
      latestFeatY = (headPitch * 1.65) + (blendY * 0.30);
    } else if (gazeMode === 'eyes') {
      latestFeatX = (blendX * 1.35) + (irisX * 1.75) + (headYaw * 0.35);
      latestFeatY = (blendY * 1.45) + (irisRigidY * 2.20) + (lidPitchY * 1.35) + (headPitch * 0.45);
    } else {
      latestFeatX = (headYaw * 1.05) + (blendX * 0.95) + (irisX * 1.35);
      latestFeatY = (headPitch * 1.10) + (blendY * 1.15) + (irisRigidY * 1.85) + (lidPitchY * 1.15);
    }

    if (invertX) latestFeatX = -latestFeatX;
    if (invertY) latestFeatY = -latestFeatY;

    if (!calibData.calibrated && initialZeroFrames < 12) {
      initialZeroFrames++;
      calibData.centerX = (calibData.centerX * (initialZeroFrames - 1) + latestFeatX) / initialZeroFrames;
      calibData.centerY = (calibData.centerY * (initialZeroFrames - 1) + latestFeatY) / initialZeroFrames;
      smoothFeatX = latestFeatX;
      smoothFeatY = latestFeatY;
    }

    const instVel = Math.hypot(latestFeatX - smoothFeatX, latestFeatY - smoothFeatY);
    featVelocity = (featVelocity * 0.65) + (instVel * 0.35);
    smoothFeatX += (latestFeatX - smoothFeatX) * 0.45;
    smoothFeatY += (latestFeatY - smoothFeatY) * 0.45;

    const sensScaleX = 0.35 + (gazeSensX * 0.13);
    const sensScaleY = 0.35 + (gazeSensY * 0.14);

    const dx = smoothFeatX - calibData.centerX;
    const dy = smoothFeatY - calibData.centerY;

    let du = 0;
    if (dx >= 0) {
      du = (dx / Math.max(0.010, Math.abs(calibData.rightDeltaX))) * 0.36 * sensScaleX;
    } else {
      du = (dx / Math.max(0.010, Math.abs(calibData.leftDeltaX))) * 0.36 * sensScaleX;
    }

    let dv = 0;
    if (dy >= 0) {
      dv = (dy / Math.max(0.008, Math.abs(calibData.downDeltaY))) * 0.36 * sensScaleY;
    } else {
      dv = (dy / Math.max(0.008, Math.abs(calibData.upDeltaY))) * 0.36 * sensScaleY;
    }

    const normX = 0.5 + du;
    // In 2-Choice Mode, stabilize vertical drift toward the center of the two giant Left/Right cards
    const normY = (twoChoiceMode && !editMode) ? (0.52 + dv * 0.35) : (0.5 + dv);

    rawGazeX = Math.max(12, Math.min(window.innerWidth - 12, normX * window.innerWidth));
    rawGazeY = Math.max(12, Math.min(window.innerHeight - 12, normY * window.innerHeight));
  } else {
    faceDetected = false;
    camBox.classList.remove('tracking-ok');
  }
}

window.addEventListener('mousemove', (e) => {
  if (gazeMode === 'cursor') {
    rawGazeX = e.clientX;
    rawGazeY = e.clientY;
  }
});

window.addEventListener('touchmove', (e) => {
  if (gazeMode === 'cursor' && e.touches.length > 0) {
    rawGazeX = e.touches[0].clientX;
    rawGazeY = e.touches[0].clientY;
  }
}, { passive: true });

window.addEventListener('touchstart', (e) => {
  if (gazeMode === 'cursor' && e.touches.length > 0) {
    rawGazeX = e.touches[0].clientX;
    rawGazeY = e.touches[0].clientY;
  }
}, { passive: true });

function resetAllDwellVisuals() {
  document.querySelectorAll('.dwell-target').forEach(el => el.style.setProperty('--dwell', 0));
  activeDwellEl = null;
  dwellProgressMs = 0;
}

function applyMagneticTileSnap(x, y) {
  if (snapStrength === 'off') return { x, y };
  const pull = (twoChoiceMode && !editMode) ? 0.48 : (snapStrength === 'strong' ? 0.42 : 0.25);

  const hitEl = document.elementFromPoint(x, y);
  const targetEl = hitEl ? hitEl.closest('.dwell-target') : null;
  if (!targetEl) return { x, y };

  const rect = targetEl.getBoundingClientRect();
  const cx = rect.left + rect.width * 0.5;
  const cy = rect.top + rect.height * 0.5;

  return {
    x: x + (cx - x) * pull,
    y: y + (cy - y) * pull
  };
}

function computeOneEuroAlpha(dtMs, speedPxPerSec) {
  const minAlpha = Math.max(0.03, (10 - filterStabilization) * 0.015);
  const beta = 0.00055;
  const dynamicAlpha = minAlpha + beta * speedPxPerSec;
  return Math.min(0.65, dynamicAlpha * (dtMs / 16.67));
}

function runGazeDwellLoop(now) {
  const dt = Math.min(50, Math.max(4, now - lastFrameTime));
  lastFrameTime = now;

  if (gazeMode !== 'off' && gazeMode !== 'cursor') {
    processVideoFrame();
  }

  if (gazeMode !== 'off') {
    const modalOpen = document.querySelector('.modal-backdrop.open, #calibrationOverlay.open');

    let targetRawX = rawGazeX;
    let targetRawY = rawGazeY;
    if (calibMagnetActive) {
      targetRawX = rawGazeX * 0.15 + calibMagnetX * 0.85;
      targetRawY = rawGazeY * 0.15 + calibMagnetY * 0.85;
    }

    const distDelta = Math.hypot(targetRawX - smoothGazeX, targetRawY - smoothGazeY);
    const speedPxPerSec = (distDelta / dt) * 1000;
    const alpha = computeOneEuroAlpha(dt, speedPxPerSec);

    smoothGazeX += (targetRawX - smoothGazeX) * alpha;
    smoothGazeY += (targetRawY - smoothGazeY) * alpha;

    const finalPt = !modalOpen
      ? applyMagneticTileSnap(smoothGazeX, smoothGazeY)
      : { x: smoothGazeX, y: smoothGazeY };

    const pointer = document.getElementById('gazePointer');
    pointer.style.left = `${finalPt.x}px`;
    pointer.style.top = `${finalPt.y}px`;

    if (!modalOpen) {
      const hitEl = document.elementFromPoint(finalPt.x, finalPt.y);
      const targetEl = hitEl ? hitEl.closest('.dwell-target') : null;

      if (targetEl && (targetEl !== cooldownEl || now > cooldownUntil)) {
        if (targetEl === activeDwellEl) {
          dwellProgressMs += dt;
        } else {
          if (activeDwellEl) activeDwellEl.style.setProperty('--dwell', 0);
          activeDwellEl = targetEl;
          dwellProgressMs = dt;
        }

        const pct = Math.min(100, (dwellProgressMs / dwellThresholdMs) * 100);
        activeDwellEl.style.setProperty('--dwell', pct.toFixed(1));

        if (dwellProgressMs >= dwellThresholdMs) {
          activeDwellEl.style.setProperty('--dwell', 0);
          cooldownEl = activeDwellEl;
          cooldownUntil = now + 1500;
          dwellProgressMs = 0;
          activeDwellEl.click();
        }
      } else if (activeDwellEl) {
        dwellProgressMs = Math.max(0, dwellProgressMs - dt * 1.4);
        const pct = (dwellProgressMs / dwellThresholdMs) * 100;
        activeDwellEl.style.setProperty('--dwell', pct.toFixed(1));
        if (dwellProgressMs === 0) activeDwellEl = null;
      }
    }
  }

  requestAnimationFrame(runGazeDwellLoop);
}

function clearCalibTimers() {
  calibMagnetActive = false;
  if (calibIntervalId) {
    clearInterval(calibIntervalId);
    calibIntervalId = null;
  }
}

function startCalibration(autoMode = true) {
  clearCalibTimers();
  closeGazeModal();

  const overlay = document.getElementById('calibrationOverlay');
  const container = document.getElementById('calibTargetContainer');
  const banner = document.getElementById('calibStatusBanner');
  const subText = document.getElementById('calibSubText');
  const bottomBtn = document.getElementById('bottomCaptureBtn');

  container.innerHTML = '';
  overlay.classList.add('open');

  if (document.getElementById('gazeModeSelect').value === 'off' ||
      document.getElementById('gazeModeSelect').value === 'cursor') {
    document.getElementById('gazeModeSelect').value = 'webcam';
  }
  applyGazeSettings();

  subText.textContent = autoMode
    ? 'Look steadily at each character (or tap the green button below anytime while looking)!'
    : 'Look at the character, then tap the green button at the bottom (or press Spacebar)!';

  bottomBtn.style.display = 'block';

  const steps = [
    { id: 'c',  pctX: 0.50, pctY: 0.50, left: '50%', top: '50%', charKey: 'bluey',  bg: 'radial-gradient(circle, #e0f2fe 0%, #38bdf8 75%, #0284c7 100%)', glow: '#38bdf8', dirX: 0,  dirY: 0 },
    { id: 'tl', pctX: 0.16, pctY: 0.18, left: '16%', top: '18%', charKey: 'bingo',  bg: 'radial-gradient(circle, #ffedd5 0%, #fb923c 75%, #ea580c 100%)', glow: '#fb923c', dirX: -1, dirY: -1 },
    { id: 'tr', pctX: 0.84, pctY: 0.18, left: '84%', top: '18%', charKey: 'bandit', bg: 'radial-gradient(circle, #dbeafe 0%, #3b82f6 75%, #1d4ed8 100%)', glow: '#3b82f6', dirX: 1,  dirY: -1 },
    { id: 'bl', pctX: 0.16, pctY: 0.80, left: '16%', top: '80%', charKey: 'chilli', bg: 'radial-gradient(circle, #ffedd5 0%, #f97316 75%, #c2410c 100%)', glow: '#f97316', dirX: -1, dirY: 1 },
    { id: 'br', pctX: 0.84, pctY: 0.80, left: '84%', top: '80%', charKey: 'muffin', bg: 'radial-gradient(circle, #fae8ff 0%, #c084fc 75%, #7e22ce 100%)', glow: '#c084fc', dirX: 1,  dirY: 1 }
  ];

  let stepIdx = 0;
  const recorded = {};
  let bufX = [];
  let bufY = [];
  let stepStartTime = performance.now();
  const totalSamplesNeeded = 18;
  const circumference = 345;

  const target = document.createElement('div');
  target.className = 'calib-single-target';
  container.appendChild(target);

  const renderStepTarget = () => {
    const s = steps[stepIdx];
    bufX = [];
    bufY = [];
    calibMagnetActive = false;
    stepStartTime = performance.now();
    target.classList.remove('sampling');
    target.style.left = s.left;
    target.style.top = s.top;
    target.style.background = s.bg;
    target.style.boxShadow = `0 0 34px ${s.glow}`;
    target.innerHTML = `
      <svg class="calib-progress-svg" viewBox="0 0 120 120">
        <circle class="calib-progress-bg" cx="60" cy="60" r="55"></circle>
        <circle class="calib-progress-bar" id="calibRingBar" cx="60" cy="60" r="55"></circle>
      </svg>
      <div class="calib-char-wrap">${getBlueyCharacterSVG(s.charKey)}</div>
    `;
    banner.textContent = `🐾 Step ${stepIdx + 1} of 5: Look at the character`;
  };

  const commitCurrentStep = () => {
    calibMagnetActive = false;
    if (bufX.length < 6) {
      for (let i = 0; i < 10; i++) {
        bufX.push(smoothFeatX);
        bufY.push(smoothFeatY);
      }
    }
    const sortedX = [...bufX].sort((a, b) => a - b);
    const sortedY = [...bufY].sort((a, b) => a - b);
    const trim = Math.min(2, Math.floor(sortedX.length / 4));
    const cleanX = trim > 0 ? sortedX.slice(trim, -trim) : sortedX;
    const cleanY = trim > 0 ? sortedY.slice(trim, -trim) : sortedY;
    const avgX = cleanX.reduce((a, b) => a + b, 0) / cleanX.length;
    const avgY = cleanY.reduce((a, b) => a + b, 0) / cleanY.length;

    const s = steps[stepIdx];
    recorded[s.id] = { fx: avgX, fy: avgY };

    if (s.id === 'c') {
      calibData.centerX = avgX;
      calibData.centerY = avgY;
    }

    playBlueyFanfare();
    stepIdx++;

    if (stepIdx < steps.length) {
      renderStepTarget();
    } else {
      clearCalibTimers();
      const cx = recorded.c.fx;
      const cy = recorded.c.fy;
      const leftAvgX = (recorded.tl.fx + recorded.bl.fx) * 0.5;
      const rightAvgX = (recorded.tr.fx + recorded.br.fx) * 0.5;
      const topAvgY = (recorded.tl.fy + recorded.tr.fy) * 0.5;
      const botAvgY = (recorded.bl.fy + recorded.br.fy) * 0.5;

      if (rightAvgX < leftAvgX) {
        invertX = !invertX;
        document.getElementById('invertXCheck').checked = invertX;
      }
      if (botAvgY < topAvgY) {
        invertY = !invertY;
        document.getElementById('invertYCheck').checked = invertY;
      }

      calibData = {
        calibrated: true,
        centerX: cx,
        centerY: cy,
        leftDeltaX: -Math.max(0.014, Math.abs(cx - leftAvgX)),
        rightDeltaX: Math.max(0.014, Math.abs(rightAvgX - cx)),
        upDeltaY: -Math.max(0.010, Math.abs(cy - topAvgY)),
        downDeltaY: Math.max(0.010, Math.abs(botAvgY - cy)),
        pts: recorded
      };

      try {
        localStorage.setItem('vb_gaze_calib_v5', JSON.stringify(calibData));
      } catch (e) {}

      banner.textContent = '🎉 Calibration Locked In!';
      activeCalibTrigger = null;
      setTimeout(() => finishCalibration(), 550);
    }
  };

  renderStepTarget();

  calibIntervalId = setInterval(() => {
    if (!faceDetected) return;

    const s = steps[stepIdx];
    const targetX = s.pctX * window.innerWidth;
    const targetY = s.pctY * window.innerHeight;
    const elapsed = performance.now() - stepStartTime;

    const isSteady = featVelocity < 0.018;

    let shiftedToTarget = true;
    if (s.id !== 'c' && recorded.c) {
      const dxFromCenter = smoothFeatX - recorded.c.fx;
      const dyFromCenter = smoothFeatY - recorded.c.fy;
      const rightWayX = (s.dirX * dxFromCenter) > 0.003;
      const rightWayY = (s.dirY * dyFromCenter) > 0.002;
      shiftedToTarget = rightWayX && rightWayY;
    }

    const ringBar = document.getElementById('calibRingBar');

    if (autoMode) {
      if (elapsed > 600 && isSteady && shiftedToTarget) {
        calibMagnetActive = true;
        calibMagnetX = targetX;
        calibMagnetY = targetY;

        const dotDist = Math.hypot(smoothGazeX - targetX, smoothGazeY - targetY);
        if (dotDist <= 80) {
          target.classList.add('sampling');
          bufX.push(smoothFeatX);
          bufY.push(smoothFeatY);
        }
      } else {
        calibMagnetActive = false;
        target.classList.remove('sampling');
        if (bufX.length > 0) {
          bufX.pop();
          bufY.pop();
        }
      }

      const progress = Math.min(1, bufX.length / totalSamplesNeeded);
      if (ringBar) {
        ringBar.style.strokeDashoffset = (circumference * (1 - progress)).toFixed(1);
      }

      if (bufX.length >= totalSamplesNeeded) {
        commitCurrentStep();
      }
    }
  }, 33);

  const manualCapture = () => {
    calibMagnetActive = true;
    calibMagnetX = steps[stepIdx].pctX * window.innerWidth;
    calibMagnetY = steps[stepIdx].pctY * window.innerHeight;
    smoothGazeX = calibMagnetX;
    smoothGazeY = calibMagnetY;
    setTimeout(() => {
      for (let i = 0; i < 12; i++) {
        bufX.push(smoothFeatX);
        bufY.push(smoothFeatY);
      }
      commitCurrentStep();
    }, 180);
  };

  target.onclick = manualCapture;
  bottomBtn.onclick = manualCapture;
  activeCalibTrigger = manualCapture;
}

function resetDefaultCalibration() {
  clearCalibTimers();
  calibData = {
    calibrated: false,
    centerX: smoothFeatX || 0,
    centerY: smoothFeatY || 0,
    leftDeltaX: -0.055,
    rightDeltaX: 0.055,
    upDeltaY: -0.040,
    downDeltaY: 0.040,
    pts: null
  };
  localStorage.removeItem('vb_gaze_calib_v5');
  finishCalibration();
}

function finishCalibration() {
  clearCalibTimers();
  activeCalibTrigger = null;
  document.getElementById('calibrationOverlay').classList.remove('open');
}

// 5. Parent Edit Mode, Tile Add/Edit Modal, & Backup
function toggleEditMode() {
  editMode = !editMode;
  document.body.classList.toggle('edit-mode', editMode);
  const lockBtn = document.getElementById('lockBtn');
  if (editMode) {
    lockBtn.textContent = '🔓 Edit';
    lockBtn.classList.add('unlocked');
  } else {
    lockBtn.textContent = '🔒 Locked';
    lockBtn.classList.remove('unlocked');
  }
  renderBoard();
}

function updateIotFieldsUI() {
  const type = document.getElementById('tileIotType').value;
  document.getElementById('iotHueFields').style.display =
    (type === 'hue_light' || type === 'hue_group') ? 'flex' : 'none';
  document.getElementById('iotRokuFields').style.display =
    type === 'roku_tv' ? 'flex' : 'none';
  document.getElementById('iotWebhookFields').style.display =
    type === 'webhook' ? 'flex' : 'none';

  if (type === 'pager_urgent') {
    document.getElementById('tileSendPageCheck').checked = true;
  }

  if (type === 'hue_light' || type === 'hue_group') {
    document.getElementById('hueTargetLabel').textContent =
      type === 'hue_group' ? 'Hue Room / Group ID #' : 'Hue Light Bulb ID #';
    const cmd = document.getElementById('hueCommand').value;
    document.getElementById('hueColorRow').style.display = cmd === 'color' ? 'flex' : 'none';
  }
}

function openTileModal(tileToEdit = null) {
  const catSelect = document.getElementById('tileCategorySelect');
  const targetBoardSelect = document.getElementById('tileTargetBoardSelect');
  catSelect.innerHTML = '';
  targetBoardSelect.innerHTML = '<option value="">-- Stay on Current Board --</option>';

  boards.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.name;
    opt.textContent = b.name;
    catSelect.appendChild(opt);

    const jumpOpt = document.createElement('option');
    jumpOpt.value = b.name;
    jumpOpt.textContent = `📂 Switch to "${b.name}" Board`;
    targetBoardSelect.appendChild(jumpOpt);
  });

  document.getElementById('tileImage').value = '';

  if (tileToEdit) {
    editingTileId = tileToEdit.id;
    document.getElementById('tileModalTitle').textContent = 'Edit Communication Tile';
    document.getElementById('tileLabel').value = tileToEdit.label;
    catSelect.value = tileToEdit.category;
    document.getElementById('tileEmoji').value = tileToEdit.emoji || '⭐';
    document.getElementById('tileColor').value = tileToEdit.color || '#38bdf8';
    targetBoardSelect.value = tileToEdit.targetBoard || '';
    document.getElementById('tileSendPageCheck').checked = Boolean(tileToEdit.sendPage);

    const iot = tileToEdit.iotAction || { type: 'none' };
    document.getElementById('tileIotType').value = iot.type || 'none';
    document.getElementById('hueTargetId').value = iot.targetId || '1';
    document.getElementById('hueCommand').value = iot.command || 'toggle';
    document.getElementById('hueColorPreset').value = iot.colorPreset || 'warm';
    document.getElementById('hueBri').value = iot.bri || 200;
    document.getElementById('rokuCommand').value = iot.rokuCmd || 'launch/291097';
    document.getElementById('rokuCustomIp').value = iot.customIp || '';
    document.getElementById('webhookMethod').value = iot.method || 'POST';
    document.getElementById('webhookUrl').value = iot.url || '';
    document.getElementById('webhookBody').value = iot.body || '';

    currentTileImageDataUrl = tileToEdit.imageDataUrl || null;
    recordedAudioDataUrl = tileToEdit.audioDataUrl || null;
  } else {
    editingTileId = null;
    document.getElementById('tileModalTitle').textContent = 'Add Communication Tile';
    document.getElementById('tileLabel').value = '';
    catSelect.value = currentCategory;
    document.getElementById('tileEmoji').value = '⭐';
    document.getElementById('tileColor').value = '#38bdf8';
    targetBoardSelect.value = '';
    document.getElementById('tileSendPageCheck').checked = false;

    document.getElementById('tileIotType').value = 'none';
    document.getElementById('hueTargetId').value = '1';
    document.getElementById('hueCommand').value = 'toggle';
    document.getElementById('hueColorPreset').value = 'warm';
    document.getElementById('hueBri').value = 200;
    document.getElementById('rokuCommand').value = 'launch/291097';
    document.getElementById('rokuCustomIp').value = '';
    document.getElementById('webhookMethod').value = 'POST';
    document.getElementById('webhookUrl').value = '';
    document.getElementById('webhookBody').value = '';

    currentTileImageDataUrl = null;
    recordedAudioDataUrl = null;
  }

  updateIotFieldsUI();
  updateModalMediaStatus();
  document.getElementById('tileModal').classList.add('open');
}

function updateModalMediaStatus() {
  const imgStatus = document.getElementById('imgStatus');
  const clearImgBtn = document.getElementById('clearImageBtn');
  if (currentTileImageDataUrl) {
    imgStatus.textContent = '✅ Custom photo active';
    clearImgBtn.style.display = 'inline-block';
  } else {
    imgStatus.textContent = 'Using Emoji icon';
    clearImgBtn.style.display = 'none';
  }

  const recStatus = document.getElementById('recStatus');
  const clearAudBtn = document.getElementById('clearAudioBtn');
  if (recordedAudioDataUrl) {
    recStatus.textContent = '✅ Custom Voice Recording active';
    clearAudBtn.style.display = 'inline-block';
  } else {
    recStatus.textContent = 'Using Default TTS Voice';
    clearAudBtn.style.display = 'none';
  }
}

function clearTilePhoto() {
  currentTileImageDataUrl = null;
  document.getElementById('tileImage').value = '';
  updateModalMediaStatus();
}

function clearTileAudio() {
  recordedAudioDataUrl = null;
  updateModalMediaStatus();
}

function closeTileModal() {
  document.getElementById('tileModal').classList.remove('open');
}

async function toggleRecording() {
  const btn = document.getElementById('recordBtn');
  const status = document.getElementById('recStatus');

  if (!mediaRecorder || mediaRecorder.state === 'inactive') {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];
      mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          recordedAudioDataUrl = reader.result;
          updateModalMediaStatus();
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach(t => t.stop());
      };
      mediaRecorder.start();
      btn.textContent = '⏹️ Stop';
      btn.classList.add('recording');
      status.textContent = 'Recording now...';
    } catch (err) {
      alert('Microphone permission is required to record custom voice clips.');
    }
  } else {
    mediaRecorder.stop();
    btn.textContent = '🎙️ Record';
    btn.classList.remove('recording');
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

async function saveNewTile() {
  const label = document.getElementById('tileLabel').value.trim();
  if (!label) return alert('Please enter a word or phrase.');

  const selectedCategory = document.getElementById('tileCategorySelect').value || currentCategory;
  const emoji = document.getElementById('tileEmoji').value.trim() || '⭐';
  const color = document.getElementById('tileColor').value;
  const targetBoard = document.getElementById('tileTargetBoardSelect').value || '';
  const sendPage = document.getElementById('tileSendPageCheck').checked;
  const imgInput = document.getElementById('tileImage');

  const iotType = document.getElementById('tileIotType').value;
  let iotAction = { type: 'none' };
  if (iotType === 'pager_urgent') {
    iotAction = { type: 'pager_urgent' };
  } else if (iotType === 'hue_light' || iotType === 'hue_group') {
    iotAction = {
      type: iotType,
      targetId: document.getElementById('hueTargetId').value.trim() || '1',
      command: document.getElementById('hueCommand').value,
      colorPreset: document.getElementById('hueColorPreset').value,
      bri: parseInt(document.getElementById('hueBri').value || '200', 10)
    };
  } else if (iotType === 'roku_tv') {
    iotAction = {
      type: 'roku_tv',
      rokuCmd: document.getElementById('rokuCommand').value,
      customIp: document.getElementById('rokuCustomIp').value.trim()
    };
  } else if (iotType === 'webhook') {
    iotAction = {
      type: 'webhook',
      method: document.getElementById('webhookMethod').value,
      url: document.getElementById('webhookUrl').value.trim(),
      body: document.getElementById('webhookBody').value.trim()
    };
  }

  let finalImageDataUrl = currentTileImageDataUrl;
  if (imgInput.files && imgInput.files[0]) {
    finalImageDataUrl = await fileToDataUrl(imgInput.files[0]);
  }

  const tileData = {
    id: editingTileId ? editingTileId : Date.now().toString(),
    category: selectedCategory,
    label,
    emoji,
    color,
    targetBoard,
    sendPage,
    iotAction,
    imageDataUrl: finalImageDataUrl,
    audioDataUrl: recordedAudioDataUrl
  };

  if (editingTileId) {
    const idx = tiles.findIndex(t => t.id === editingTileId);
    if (idx !== -1) tiles[idx] = tileData;
  } else {
    tiles.push(tileData);
  }

  await saveTileToDB(tileData);
  currentCategory = selectedCategory;
  closeTileModal();
  renderCategories();
  renderBoard();
}

function openSyncModal() {
  document.getElementById('syncModal').classList.add('open');
}
function closeSyncModal() {
  document.getElementById('syncModal').classList.remove('open');
}

function exportBoardData() {
  const payload = { boards, tiles, smartHubConfig };
  const dataStr = JSON.stringify(payload, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `voicebridge_backup_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
}

function importBoardData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      const importedBoards = Array.isArray(parsed) ? DEFAULT_BOARDS : (parsed.boards || DEFAULT_BOARDS);
      const importedTiles = Array.isArray(parsed) ? parsed : (parsed.tiles || []);
      if (parsed.smartHubConfig) {
        smartHubConfig = { ...smartHubConfig, ...parsed.smartHubConfig };
        localStorage.setItem('vb_smart_hub', JSON.stringify(smartHubConfig));
      }

      const tx = db.transaction(['boards', 'tiles'], 'readwrite');
      tx.objectStore('boards').clear();
      tx.objectStore('tiles').clear();
      importedBoards.forEach(b => tx.objectStore('boards').put(b));
      importedTiles.forEach(t => tx.objectStore('tiles').put(t));

      tx.oncomplete = () => {
        boards = importedBoards;
        tiles = importedTiles;
        currentCategory = boards[0]?.name || 'Core Needs';
        twoChoicePairIdx = 0;
        renderCategories();
        renderBoard();
        closeSyncModal();
        alert('All custom boards, pager settings, photos, and voices restored!');
      };
    } catch (err) {
      alert('Invalid backup file.');
    }
  };
  reader.readAsText(file);
}

// Boot Application
window.addEventListener('DOMContentLoaded', async () => {
  await initDB();
  await loadDataFromDB();
  applyTwoChoiceState();
  applySentenceBarState();
  renderCategories();
  renderBoard();
  requestAnimationFrame(runGazeDwellLoop);
});