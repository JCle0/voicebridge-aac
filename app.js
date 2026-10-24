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
let showSentenceBar = localStorage.getItem('vb_show_sentence') === 'true';

const SIZE_PRESETS = [
  { name: 'Standard', min: '160px', height: '148px', emoji: '3.3rem', font: '1.25rem' },
  { name: 'Large',    min: '240px', height: '190px', emoji: '4.3rem', font: '1.55rem' },
  { name: 'Compact',  min: '120px', height: '115px', emoji: '2.4rem', font: '1.0rem' }
];
let currentSizeIdx = 0;

let editingTileId = null;
let currentTileImageDataUrl = null;
let recordedAudioDataUrl = null;
let mediaRecorder = null;
let audioChunks = [];

// Eye Tracking & MediaPipe State
let gazeMode = 'off'; // 'off' | 'webcam' | 'head' | 'cursor'
let snapStrength = 'medium'; // 'off' | 'medium' | 'strong'
let dwellThresholdMs = 1100;
let smoothingFactor = 0.18;
let gazeSensitivity = 6;
let rawGazeX = window.innerWidth / 2;
let rawGazeY = window.innerHeight / 2;
let smoothGazeX = rawGazeX;
let smoothGazeY = rawGazeY;
let activeDwellEl = null;
let dwellProgressMs = 0;
let lastFrameTime = performance.now();
let cooldownEl = null;
let cooldownUntil = 0;

// MediaPipe FaceLandmarker instance & roll-compensated feature vector
let faceLandmarker = null;
let mpLoading = false;
let camStream = null;
let lastVideoTime = -1;
let latestFeatX = 0;
let latestFeatY = 0;
let prevFeatX = 0;
let prevFeatY = 0;
let featVelocity = 0;
let faceDetected = false;
let activeCalibTrigger = null;
let calibIntervalId = null;

// 5-Point Calibration Model
let calibData = {
  calibrated: false,
  centerX: 0,
  centerY: 0,
  leftSpan: 0.065,
  rightSpan: 0.065,
  upSpan: 0.048,
  downSpan: 0.048,
  pts: null
};

try {
  const savedCalib = localStorage.getItem('vb_gaze_calib_v3');
  if (savedCalib) calibData = JSON.parse(savedCalib);
} catch (e) {}

// Built-in Vector Illustrations for Bluey, Bingo, Bandit, Chilli & Muffin (No text labels)
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
    setTimeout(() => cardEl.classList.remove('dwell-triggered'), 240);
  }
  playTileAudio(tile);
  if (showSentenceBar) {
    stripItems.push(tile);
    renderStrip();
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

// 4. Roll-Compensated Mobile & Desktop Eye-Gaze Engine
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
  gazeSensitivity = parseInt(document.getElementById('sensSlider').value, 10);
  const smoothSlider = parseInt(document.getElementById('smoothingSlider').value, 10);
  smoothingFactor = (10 - smoothSlider) * 0.038;

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
  } else if (gazeMode === 'webcam' || gazeMode === 'head') {
    document.body.classList.add('gaze-active');
    gazeBtn.textContent = gazeMode === 'head' ? '👁️ Gaze: Head' : '👁️ Gaze: Cam';
    gazeBtn.classList.add('active');
    camBox.classList.add('active');
    await initMediaPipeCamera();
  }
}

function quickCenterGaze() {
  if (gazeMode === 'webcam' || gazeMode === 'head') {
    const shiftX = latestFeatX - calibData.centerX;
    const shiftY = latestFeatY - calibData.centerY;
    calibData.centerX = latestFeatX;
    calibData.centerY = latestFeatY;
    if (calibData.pts) {
      Object.keys(calibData.pts).forEach(k => {
        calibData.pts[k].fx += shiftX;
        calibData.pts[k].fy += shiftY;
      });
    }
    try {
      localStorage.setItem('vb_gaze_calib_v3', JSON.stringify(calibData));
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
  if ((gazeMode !== 'webcam' && gazeMode !== 'head') || !faceLandmarker || !camStream) return;

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

    // 1. Compute Roll Angle between outer eye corners (33 and 263) to cancel phone/head tilt
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
    const leftOuter = rel(33);
    const leftInner = rel(133);
    const leftTop = rel(159);
    const leftBot = rel(145);
    const leftIris = rel(468);

    const rightInner = rel(362);
    const rightOuter = rel(263);
    const rightTop = rel(386);
    const rightBot = rel(374);
    const rightIris = rel(473);

    // 2. 3D Head Yaw & Pitch
    let headYaw = -noseTip.x;
    let headPitch = noseTip.y - 0.34;

    if (results.facialTransformationMatrixes && results.facialTransformationMatrixes.length > 0) {
      const m = results.facialTransformationMatrixes[0].data;
      if (m && m.length >= 16) {
        const matYaw = -Math.atan2(m[8], m[10]);
        const matPitch = Math.atan2(m[9], m[10]);
        headYaw = (headYaw * 0.45) + (matYaw * 0.55);
        headPitch = (headPitch * 0.45) + (matPitch * 0.55);
      }
    }

    // 3. Roll-Compensated Iris Position inside Eye Sockets
    const lIrisRatioX = 0.5 - (leftIris.x - leftOuter.x) / Math.max(0.01, leftInner.x - leftOuter.x);
    const rIrisRatioX = 0.5 - (rightIris.x - rightInner.x) / Math.max(0.01, rightOuter.x - rightInner.x);
    const irisX = (lIrisRatioX + rIrisRatioX) * 0.5;

    const lIrisRatioY = (leftIris.y - leftTop.y) / Math.max(0.01, leftBot.y - leftTop.y) - 0.5;
    const rIrisRatioY = (rightIris.y - rightTop.y) / Math.max(0.01, rightBot.y - rightTop.y) - 0.5;
    const irisY = (lIrisRatioY + rIrisRatioY) * 0.5;

    // 4. Neural Eye-Gaze Blendshapes
    let lookUp = 0, lookDown = 0, lookLeft = 0, lookRight = 0;
    if (results.faceBlendshapes && results.faceBlendshapes.length > 0) {
      const cats = results.faceBlendshapes[0].categories;
      for (let i = 0; i < cats.length; i++) {
        const n = cats[i].categoryName;
        const s = cats[i].score;
        if (n === 'eyeLookUpLeft' || n === 'eyeLookUpRight') lookUp += s * 0.5;
        else if (n === 'eyeLookDownLeft' || n === 'eyeLookDownRight') lookDown += s * 0.5;
        else if (n === 'eyeLookOutLeft' || n === 'eyeLookInRight') lookRight += s * 0.5;
        else if (n === 'eyeLookInLeft' || n === 'eyeLookOutRight') lookLeft += s * 0.5;
      }
    }

    prevFeatX = latestFeatX;
    prevFeatY = latestFeatY;

    if (gazeMode === 'head') {
      latestFeatX = headYaw * 1.45;
      latestFeatY = headPitch * 1.45;
    } else {
      latestFeatX = (headYaw * 0.95) + (irisX * 0.95) + ((lookRight - lookLeft) * 0.65);
      latestFeatY = (headPitch * 0.95) + (irisY * 0.45) + ((lookDown - lookUp) * 0.70);
    }

    // Measure eye/head movement velocity to detect steady fixation
    const instVel = Math.hypot(latestFeatX - prevFeatX, latestFeatY - prevFeatY);
    featVelocity = (featVelocity * 0.7) + (instVel * 0.3);

    // 5. 4-Quadrant Interpolation around Calibrated Center
    const sensScale = 0.45 + (gazeSensitivity * 0.115);
    const dx = latestFeatX - calibData.centerX;
    const dy = latestFeatY - calibData.centerY;

    const spanX = (dx >= 0 ? calibData.rightSpan : calibData.leftSpan) / sensScale;
    const spanY = (dy >= 0 ? calibData.downSpan : calibData.upSpan) / sensScale;

    const normX = 0.5 + (dx / Math.max(0.012, spanX)) * 0.40;
    const normY = 0.5 + (dy / Math.max(0.012, spanY)) * 0.40;

    rawGazeX = Math.max(12, Math.min(window.innerWidth - 12, normX * window.innerWidth));
    rawGazeY = Math.max(12, Math.min(window.innerHeight - 12, normY * window.innerHeight));
  } else {
    faceDetected = false;
    camBox.classList.remove('tracking-ok');
  }
}

// External Tracker / Mouse / Touch-Drag Dwell Support
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
  const pull = snapStrength === 'strong' ? 0.38 : 0.22;

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

// Continuous 60fps Gaze & Dwell Loop
function runGazeDwellLoop(now) {
  const dt = now - lastFrameTime;
  lastFrameTime = now;

  if (gazeMode === 'webcam' || gazeMode === 'head') {
    processVideoFrame();
  }

  if (gazeMode !== 'off') {
    const modalOpen = document.querySelector('.modal-backdrop.open, #calibrationOverlay.open');

    smoothGazeX += (rawGazeX - smoothGazeX) * smoothingFactor;
    smoothGazeY += (rawGazeY - smoothGazeY) * smoothingFactor;

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
  if (calibIntervalId) {
    clearInterval(calibIntervalId);
    calibIntervalId = null;
  }
}

// Bluey Gaze-Lock Calibration (Requires the fixation dot to actually be on the character!)
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
    ? 'Look at the character to guide the blue fixation dot onto them and fill the green ring!'
    : 'Look at the character, then tap the green button below (or press Spacebar)!';

  bottomBtn.style.display = autoMode ? 'none' : 'block';

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
  const totalSamplesNeeded = 22;
  const circumference = 345;

  const target = document.createElement('div');
  target.className = 'calib-single-target';
  container.appendChild(target);

  const renderStepTarget = () => {
    const s = steps[stepIdx];
    bufX = [];
    bufY = [];
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
    banner.textContent = `🐾 Step ${stepIdx + 1} of 5: Hold the fixation dot on the character`;
  };

  const commitCurrentStep = () => {
    if (bufX.length < 6) {
      for (let i = 0; i < 10; i++) {
        bufX.push(latestFeatX);
        bufY.push(latestFeatY);
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

      calibData = {
        calibrated: true,
        centerX: cx,
        centerY: cy,
        leftSpan: Math.max(0.018, Math.abs(cx - leftAvgX)),
        rightSpan: Math.max(0.018, Math.abs(rightAvgX - cx)),
        upSpan: Math.max(0.015, Math.abs(cy - topAvgY)),
        downSpan: Math.max(0.015, Math.abs(botAvgY - cy)),
        pts: recorded
      };

      try {
        localStorage.setItem('vb_gaze_calib_v3', JSON.stringify(calibData));
      } catch (e) {}

      banner.textContent = '🎉 Calibration Complete!';
      activeCalibTrigger = null;
      setTimeout(() => finishCalibration(), 550);
    }
  };

  renderStepTarget();

  // Continuous 30fps Fixation-Dot Check
  calibIntervalId = setInterval(() => {
    if (!faceDetected) return;

    const s = steps[stepIdx];
    const targetX = s.pctX * window.innerWidth;
    const targetY = s.pctY * window.innerHeight;
    const elapsed = performance.now() - stepStartTime;
    const isSteady = featVelocity < 0.012;

    if (autoMode && elapsed > 450 && isSteady) {
      if (s.id === 'c') {
        // Guide center calibration zero smoothly toward steady center gaze so dot lands on Bluey
        calibData.centerX += (latestFeatX - calibData.centerX) * 0.28;
        calibData.centerY += (latestFeatY - calibData.centerY) * 0.28;
      } else if (recorded.c) {
        // Only adapt corner span if user is actually looking into the target's quadrant!
        const dx = latestFeatX - recorded.c.fx;
        const dy = latestFeatY - recorded.c.fy;
        const inQuadX = (s.dirX < 0 && dx < -0.008) || (s.dirX > 0 && dx > 0.008);
        const inQuadY = (s.dirY < 0 && dy < -0.006) || (s.dirY > 0 && dy > 0.006);

        if (inQuadX && inQuadY) {
          const sensScale = 0.45 + (gazeSensitivity * 0.115);
          const desiredSpanX = (Math.abs(dx) / 0.34) * sensScale;
          const desiredSpanY = (Math.abs(dy) / 0.30) * sensScale;
          if (s.dirX < 0) calibData.leftSpan += (Math.max(0.018, desiredSpanX) - calibData.leftSpan) * 0.25;
          if (s.dirX > 0) calibData.rightSpan += (Math.max(0.018, desiredSpanX) - calibData.rightSpan) * 0.25;
          if (s.dirY < 0) calibData.upSpan += (Math.max(0.015, desiredSpanY) - calibData.upSpan) * 0.25;
          if (s.dirY > 0) calibData.downSpan += (Math.max(0.015, desiredSpanY) - calibData.downSpan) * 0.25;
        }
      }
    }

    // Check if the blue fixation dot (#gazePointer) is actually on the character circle!
    const distToTarget = Math.hypot(smoothGazeX - targetX, smoothGazeY - targetY);
    const hitRadius = Math.max(78, Math.min(window.innerWidth, window.innerHeight) * 0.16);
    const dotOnTarget = distToTarget <= hitRadius;

    const ringBar = document.getElementById('calibRingBar');

    if (autoMode) {
      if (dotOnTarget && isSteady && elapsed > 400) {
        target.classList.add('sampling');
        bufX.push(latestFeatX);
        bufY.push(latestFeatY);
      } else {
        target.classList.remove('sampling');
        // Decay samples if fixation dot drifts off the character
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

  // Manual tap / Spacebar capture still works anytime
  const manualCapture = () => {
    bufX.push(latestFeatX);
    bufY.push(latestFeatY);
    commitCurrentStep();
  };

  target.onclick = manualCapture;
  bottomBtn.onclick = manualCapture;
  activeCalibTrigger = manualCapture;
}

function resetDefaultCalibration() {
  clearCalibTimers();
  calibData = {
    calibrated: false,
    centerX: latestFeatX || 0,
    centerY: latestFeatY || 0,
    leftSpan: 0.065,
    rightSpan: 0.065,
    upSpan: 0.048,
    downSpan: 0.048,
    pts: null
  };
  localStorage.removeItem('vb_gaze_calib_v3');
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
  applySentenceBarState();
  renderCategories();
  renderBoard();
  requestAnimationFrame(runGazeDwellLoop);
});