const DB_NAME = 'VoiceBridgeDB';
const DB_VERSION = 2;

const DEFAULT_BOARDS = [
  { id: 'b1', name: 'Core Needs', order: 1 },
  { id: 'b2', name: 'Mealtime', order: 2 },
  { id: 'b3', name: 'Play & Fun', order: 3 },
  { id: 'b4', name: 'Comfort & Body', order: 4 }
];

const DEFAULT_TILES = [
  { id: '1', category: 'Core Needs', label: 'Yes / Please', emoji: '✅', color: '#22c55e' },
  { id: '2', category: 'Core Needs', label: 'No / All Done', emoji: '🛑', color: '#ef4444' },
  { id: '3', category: 'Core Needs', label: 'Help Me', emoji: '🤝', color: '#eab308' },
  { id: '4', category: 'Core Needs', label: 'Drink / Thirsty', emoji: '🥤', color: '#38bdf8' },
  { id: '5', category: 'Core Needs', label: 'Hungry', emoji: '🍎', color: '#eab308' },
  { id: '6', category: 'Core Needs', label: 'Bathroom', emoji: '🚽', color: '#38bdf8' },
  { id: '7', category: 'Mealtime', label: 'More Please', emoji: '➕', color: '#22c55e' },
  { id: '8', category: 'Mealtime', label: 'Water', emoji: '💧', color: '#38bdf8' },
  { id: '9', category: 'Mealtime', label: 'Favorite Snack', emoji: '🥨', color: '#eab308' },
  { id: '10', category: 'Play & Fun', label: 'Outside', emoji: '🌳', color: '#22c55e' },
  { id: '11', category: 'Play & Fun', label: 'Music / Show', emoji: '🎵', color: '#a855f7' },
  { id: '12', category: 'Comfort & Body', label: 'Too Loud', emoji: '🙉', color: '#ef4444' },
  { id: '13', category: 'Comfort & Body', label: 'Tired / Rest', emoji: '😴', color: '#a855f7' },
  { id: '14', category: 'Comfort & Body', label: 'Something Hurts', emoji: '🩹', color: '#ef4444' }
];

let db;
let boards = [];
let tiles = [];
let currentCategory = 'Core Needs';
let stripItems = [];
let editMode = false;

// Tile Size Presets (Compact 3-col, Standard 2-col on phone, Large 1-col)
const SIZE_PRESETS = [
  { name: 'Standard', min: '155px', height: '140px', emoji: '3.1rem', font: '1.2rem' },
  { name: 'Compact',  min: '115px', height: '110px', emoji: '2.4rem', font: '1.0rem' },
  { name: 'Large',    min: '240px', height: '185px', emoji: '4.2rem', font: '1.5rem' }
];
let currentSizeIdx = 0;

// Tile Editing & Media State
let editingTileId = null;
let currentTileImageDataUrl = null;
let recordedAudioDataUrl = null;
let mediaRecorder = null;
let audioChunks = [];

// Eye Tracking & Dwell Engine State
let gazeMode = 'off';
let dwellThresholdMs = 1200;
let smoothingFactor = 0.25;
let rawGazeX = window.innerWidth / 2;
let rawGazeY = window.innerHeight / 2;
let smoothGazeX = rawGazeX;
let smoothGazeY = rawGazeY;
let activeDwellEl = null;
let dwellProgressMs = 0;
let lastFrameTime = performance.now();
let cooldownEl = null;
let cooldownUntil = 0;
let webgazerActive = false;

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
      if (t.category === oldName) {
        t.category = newName;
        tileStore.put(t);
      }
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

// Tile Size Switcher
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
          renderCategories();
          renderBoard();
        }
      };
      btn.appendChild(del);
    }

    btn.onclick = () => {
      currentCategory = board.name;
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
    renderCategories();
    renderBoard();
  };
  bar.appendChild(addBoardBtn);
}

function renderBoard() {
  const grid = document.getElementById('boardGrid');
  grid.innerHTML = '';

  const filtered = tiles.filter(t => t.category === currentCategory);
  filtered.forEach(tile => {
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

    card.onclick = () => handleTileTap(tile, card);
    grid.appendChild(card);
  });

  const addCard = document.createElement('div');
  addCard.className = 'tile add-tile-card';
  addCard.innerHTML = `<div class="tile-visual">➕</div><div class="tile-label">Add Tile</div>`;
  addCard.onclick = () => openTileModal(null);
  grid.appendChild(addCard);
}

// 3. Speech & Audio Engine
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

function handleTileTap(tile, cardEl) {
  if (cardEl) {
    cardEl.classList.add('dwell-triggered');
    setTimeout(() => cardEl.classList.remove('dwell-triggered'), 220);
  }
  playTileAudio(tile);
  stripItems.push(tile);
  renderStrip();
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

// 4. Eye-Tracking & Gaze Dwell Engine (Mobile & Desktop Fixed)
function openGazeModal() {
  document.getElementById('gazeModal').classList.add('open');
}
function closeGazeModal() {
  document.getElementById('gazeModal').classList.remove('open');
}

async function applyGazeSettings() {
  gazeMode = document.getElementById('gazeModeSelect').value;
  const camPreview = document.getElementById('camPreviewSelect').value;
  dwellThresholdMs = parseInt(document.getElementById('dwellTimeSlider').value, 10);
  const smoothSlider = parseInt(document.getElementById('smoothingSlider').value, 10);
  smoothingFactor = (10 - smoothSlider) * 0.05;

  document.body.classList.toggle('hide-cam-preview', camPreview === 'hidden');
  const gazeBtn = document.getElementById('gazeBtn');

  if (gazeMode === 'off') {
    document.body.classList.remove('gaze-active');
    gazeBtn.textContent = '👁️ Gaze: OFF';
    gazeBtn.classList.remove('active');
    if (webgazerActive && window.webgazer) {
      window.webgazer.pause();
      const vc = document.getElementById('webgazerVideoContainer');
      if (vc) vc.style.display = 'none';
    }
    resetAllDwellVisuals();
  } else if (gazeMode === 'cursor') {
    document.body.classList.add('gaze-active');
    gazeBtn.textContent = '👁️ Gaze: Touch/Cursor';
    gazeBtn.classList.add('active');
    if (webgazerActive && window.webgazer) {
      window.webgazer.pause();
      const vc = document.getElementById('webgazerVideoContainer');
      if (vc) vc.style.display = 'none';
    }
  } else if (gazeMode === 'webcam') {
    document.body.classList.add('gaze-active');
    gazeBtn.textContent = '👁️ Gaze: Cam';
    gazeBtn.classList.add('active');
    await startWebGazer();
    const vc = document.getElementById('webgazerVideoContainer');
    if (vc) vc.style.display = 'block';
  }
  closeGazeModal();
}

// Mouse movement for PC / Hardware Eye Tracker
window.addEventListener('mousemove', (e) => {
  if (gazeMode === 'cursor') {
    rawGazeX = e.clientX;
    rawGazeY = e.clientY;
  }
});

// Touch-drag support so you can test Dwell Selection on a Phone/Tablet!
window.addEventListener('touchmove', (e) => {
  if (gazeMode === 'cursor' && e.touches.length > 0) {
    rawGazeX = e.touches[0].clientX;
    rawGazeY = e.touches[0].clientY;
  }
}, { passive: true });

// Bridge Mobile Touch Taps into WebGazer's Calibration Engine
window.addEventListener('touchstart', (e) => {
  if (e.touches.length > 0) {
    const tx = e.touches[0].clientX;
    const ty = e.touches[0].clientY;
    if (gazeMode === 'cursor') {
      rawGazeX = tx;
      rawGazeY = ty;
    }
    if (webgazerActive && window.webgazer && typeof window.webgazer.recordScreenPosition === 'function') {
      window.webgazer.recordScreenPosition(tx, ty, 'click');
    }
  }
}, { passive: true });

async function startWebGazer() {
  if (!window.webgazer) {
    alert('WebGazer library failed to load.');
    return;
  }
  if (!webgazerActive) {
    await window.webgazer
      .setRegression('ridge')
      .setGazeListener((data) => {
        if (data && gazeMode === 'webcam') {
          rawGazeX = Math.max(0, Math.min(window.innerWidth, data.x));
          rawGazeY = Math.max(0, Math.min(window.innerHeight, data.y));
        }
      })
      .begin();
    // Hide WebGazer's default red dot (we use our smoothed blue reticle)
    window.webgazer.showPredictionPoints(false);
    webgazerActive = true;
  } else {
    window.webgazer.resume();
  }
}

function resetAllDwellVisuals() {
  document.querySelectorAll('.dwell-target').forEach(el => el.style.setProperty('--dwell', 0));
  activeDwellEl = null;
  dwellProgressMs = 0;
}

function runGazeDwellLoop(now) {
  const dt = now - lastFrameTime;
  lastFrameTime = now;

  // Don't trigger background buttons if a modal or calibration screen is open
  const modalOpen = document.querySelector('.modal-backdrop.open, #calibrationOverlay.open');

  if (gazeMode !== 'off' && !modalOpen) {
    smoothGazeX += (rawGazeX - smoothGazeX) * smoothingFactor;
    smoothGazeY += (rawGazeY - smoothGazeY) * smoothingFactor;

    const pointer = document.getElementById('gazePointer');
    pointer.style.left = `${smoothGazeX}px`;
    pointer.style.top = `${smoothGazeY}px`;

    const hitEl = document.elementFromPoint(smoothGazeX, smoothGazeY);
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
      dwellProgressMs = Math.max(0, dwellProgressMs - dt * 1.6);
      const pct = (dwellProgressMs / dwellThresholdMs) * 100;
      activeDwellEl.style.setProperty('--dwell', pct.toFixed(1));
      if (dwellProgressMs === 0) activeDwellEl = null;
    }
  }

  requestAnimationFrame(runGazeDwellLoop);
}

// 5-Point Mobile/Desktop Calibration
async function startCalibration() {
  closeGazeModal();
  document.getElementById('gazeModeSelect').value = 'webcam';
  await applyGazeSettings();

  if (window.webgazer && typeof window.webgazer.clearData === 'function') {
    window.webgazer.clearData();
  }

  const overlay = document.getElementById('calibrationOverlay');
  const container = document.getElementById('calibPointsContainer');
  container.innerHTML = '';
  overlay.classList.add('open');

  const coords = [
    { left: '15%', top: '18%' },
    { left: '85%', top: '18%' },
    { left: '50%', top: '50%' },
    { left: '15%', top: '82%' },
    { left: '85%', top: '82%' }
  ];

  let completedPoints = 0;

  coords.forEach((pos) => {
    let clicks = 0;
    const pt = document.createElement('div');
    pt.className = 'calib-point';
    pt.style.left = pos.left;
    pt.style.top = pos.top;
    pt.style.transform = 'translate(-50%, -50%)';
    pt.textContent = '3';
    pt.onclick = (e) => {
      const rect = pt.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      if (window.webgazer && typeof window.webgazer.recordScreenPosition === 'function') {
        window.webgazer.recordScreenPosition(cx, cy, 'click');
      }
      clicks++;
      const remaining = 3 - clicks;
      if (remaining > 0) {
        pt.textContent = remaining;
      } else if (!pt.classList.contains('done')) {
        pt.textContent = '✓';
        pt.classList.add('done');
        completedPoints++;
        if (completedPoints >= coords.length) {
          setTimeout(() => finishCalibration(), 400);
        }
      }
    };
    container.appendChild(pt);
  });
}

function finishCalibration() {
  document.getElementById('calibrationOverlay').classList.remove('open');
}

// 5. Parent Edit Mode, Tile Add/Edit Modal, & Backup
function toggleEditMode() {
  editMode = !editMode;
  document.body.classList.toggle('edit-mode', editMode);
  const lockBtn = document.getElementById('lockBtn');
  const syncBtn = document.getElementById('syncBtn');
  if (editMode) {
    lockBtn.textContent = '🔓 Edit';
    lockBtn.classList.add('unlocked');
    syncBtn.style.display = 'flex';
  } else {
    lockBtn.textContent = '🔒 Locked';
    lockBtn.classList.remove('unlocked');
    syncBtn.style.display = 'none';
  }
}

function openTileModal(tileToEdit = null) {
  const catSelect = document.getElementById('tileCategorySelect');
  catSelect.innerHTML = '';
  boards.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.name;
    opt.textContent = b.name;
    catSelect.appendChild(opt);
  });

  document.getElementById('tileImage').value = '';

  if (tileToEdit) {
    editingTileId = tileToEdit.id;
    document.getElementById('tileModalTitle').textContent = 'Edit Communication Tile';
    document.getElementById('tileLabel').value = tileToEdit.label;
    catSelect.value = tileToEdit.category;
    document.getElementById('tileEmoji').value = tileToEdit.emoji || '⭐';
    document.getElementById('tileColor').value = tileToEdit.color || '#38bdf8';

    currentTileImageDataUrl = tileToEdit.imageDataUrl || null;
    recordedAudioDataUrl = tileToEdit.audioDataUrl || null;
  } else {
    editingTileId = null;
    document.getElementById('tileModalTitle').textContent = 'Add Communication Tile';
    document.getElementById('tileLabel').value = '';
    catSelect.value = currentCategory;
    document.getElementById('tileEmoji').value = '⭐';
    document.getElementById('tileColor').value = '#38bdf8';

    currentTileImageDataUrl = null;
    recordedAudioDataUrl = null;
  }

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
    btn.textContent = '🎙️ Record Voice';
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
  const imgInput = document.getElementById('tileImage');

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
  const payload = { boards, tiles };
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

      const tx = db.transaction(['boards', 'tiles'], 'readwrite');
      tx.objectStore('boards').clear();
      tx.objectStore('tiles').clear();
      importedBoards.forEach(b => tx.objectStore('boards').put(b));
      importedTiles.forEach(t => tx.objectStore('tiles').put(t));

      tx.oncomplete = () => {
        boards = importedBoards;
        tiles = importedTiles;
        currentCategory = boards[0]?.name || 'Core Needs';
        renderCategories();
        renderBoard();
        closeSyncModal();
        alert('All custom boards, photos, and voices restored!');
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
  renderCategories();
  renderBoard();
  requestAnimationFrame(runGazeDwellLoop);
});