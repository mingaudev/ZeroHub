// ── DEVTOOLS BLOCK ──
(function () {
  document.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('keydown', e => {
    if (
      e.key === 'F12' ||
      (e.ctrlKey && e.shiftKey && ['I','J','C','U'].includes(e.key.toUpperCase())) ||
      (e.ctrlKey && e.key.toUpperCase() === 'U')
    ) e.preventDefault();
  });
  let devopen = false;
  const threshold = 160;
  setInterval(() => {
    const before = new Date();
    debugger;
    if (new Date() - before > threshold && !devopen) {
      devopen = true;
      document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#fff;background:#0e1117;font-size:1.5rem;">🚫 Acesso negado</div>';
    }
  }, 1000);
})();

const socket = io();
let currentUser = null;
let posts = [];
let dragSrc = null;

// ── INIT ──
window.addEventListener('load', async () => {
  setTimeout(() => {
    document.getElementById('intro').style.display = 'none';
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('app').style.opacity = '1';
  }, 3200);
  await fetchMe();
  await fetchPosts();
});

// ── AUTH ──
async function fetchMe() {
  const r = await fetch('/api/me').then(r => r.json());
  currentUser = r.user;
  updateNav();
}

function updateNav() {
  const navUser = document.getElementById('nav-user');
  const btnAuth = document.getElementById('btn-auth');
  const btnLogout = document.getElementById('btn-logout');
  const mingauPanel = document.getElementById('mingau-panel');
  if (currentUser) {
    navUser.textContent = currentUser.username;
    btnAuth.classList.add('hidden');
    btnLogout.classList.remove('hidden');
    if (currentUser.username === 'Mingau') mingauPanel.classList.remove('hidden');
  } else {
    navUser.textContent = '';
    btnAuth.classList.remove('hidden');
    btnLogout.classList.add('hidden');
    mingauPanel.classList.add('hidden');
  }
  renderPosts();
}

document.getElementById('btn-auth').addEventListener('click', () => {
  document.getElementById('modal-auth').classList.remove('hidden');
});
document.getElementById('close-auth').addEventListener('click', () => {
  document.getElementById('modal-auth').classList.add('hidden');
});

// Tabs
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    document.getElementById('tab-' + tab.dataset.tab).classList.remove('hidden');
  });
});

document.getElementById('do-login').addEventListener('click', async () => {
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;
  const err = document.getElementById('login-err');
  const r = await fetch('/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  }).then(r => r.json());
  if (r.error) { err.textContent = r.error; return; }
  currentUser = { username: r.username };
  document.getElementById('modal-auth').classList.add('hidden');
  updateNav();
});

document.getElementById('do-register').addEventListener('click', async () => {
  const username = document.getElementById('reg-user').value.trim();
  const password = document.getElementById('reg-pass').value;
  const err = document.getElementById('reg-err');
  const r = await fetch('/api/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  }).then(r => r.json());
  if (r.error) { err.textContent = r.error; return; }
  currentUser = { username: r.username };
  document.getElementById('modal-auth').classList.add('hidden');
  updateNav();
});

document.getElementById('btn-logout').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  currentUser = null;
  updateNav();
});

// ── POSTS ──
async function fetchPosts() {
  posts = await fetch('/api/posts').then(r => r.json());
  renderPosts();
}

function renderPosts() {
  const grid = document.getElementById('posts-grid');
  const empty = document.getElementById('empty-state');
  grid.innerHTML = '';
  if (!posts.length) { empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  const isMingau = currentUser && currentUser.username === 'Mingau';
  posts.forEach(post => {
    const card = document.createElement('div');
    card.className = 'post-card';
    card.dataset.id = post.id;
    card.draggable = isMingau;

    const thumb = post.thumbnail
      ? `<img class="card-thumb" src="${post.thumbnail}" alt="${post.title}" loading="lazy"/>`
      : `<div class="card-thumb-placeholder">🎮</div>`;

    const link = post.url
      ? `<a class="card-link" href="${post.url}" target="_blank" rel="noopener">▶ Abrir link</a>`
      : '';

    const deleteBtn = isMingau
      ? `<button class="card-delete" data-id="${post.id}" title="Remover">×</button>`
      : '';

    card.innerHTML = `
      ${thumb}
      <div class="card-body">
        <div class="card-title">${post.title}</div>
        ${post.description ? `<div class="card-desc">${post.description}</div>` : ''}
        ${link}
      </div>
      ${deleteBtn}
    `;

    if (isMingau) {
      card.addEventListener('dragstart', onDragStart);
      card.addEventListener('dragover', onDragOver);
      card.addEventListener('drop', onDrop);
      card.addEventListener('dragend', onDragEnd);
      const del = card.querySelector('.card-delete');
      if (del) del.addEventListener('click', deletePost);
    }

    grid.appendChild(card);
  });
}

// ── DRAG & DROP ──
function onDragStart(e) {
  dragSrc = this;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}
function onDragOver(e) {
  e.preventDefault();
  document.querySelectorAll('.post-card').forEach(c => c.classList.remove('drag-over'));
  this.classList.add('drag-over');
}
function onDrop(e) {
  e.preventDefault();
  if (dragSrc === this) return;
  const srcId = parseInt(dragSrc.dataset.id);
  const dstId = parseInt(this.dataset.id);
  const srcIdx = posts.findIndex(p => p.id === srcId);
  const dstIdx = posts.findIndex(p => p.id === dstId);
  posts.splice(dstIdx, 0, posts.splice(srcIdx, 1)[0]);
  renderPosts();
  fetch('/api/posts/reorder', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order: posts.map(p => p.id) })
  });
}
function onDragEnd() {
  document.querySelectorAll('.post-card').forEach(c => {
    c.classList.remove('dragging', 'drag-over');
  });
}

// ── ADD POST ──
document.getElementById('btn-add').addEventListener('click', () => {
  document.getElementById('modal-post').classList.remove('hidden');
});
document.getElementById('close-post').addEventListener('click', () => {
  document.getElementById('modal-post').classList.add('hidden');
});

document.getElementById('post-thumb').addEventListener('change', function () {
  const file = this.files[0];
  if (!file) return;
  document.getElementById('upload-text').textContent = '✅ ' + file.name;
  const preview = document.getElementById('thumb-preview');
  if (file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = e => { preview.innerHTML = `<img src="${e.target.result}"/>`; };
    reader.readAsDataURL(file);
  } else {
    preview.innerHTML = '';
  }
});

document.getElementById('do-post').addEventListener('click', async () => {
  const title = document.getElementById('post-title').value.trim();
  const url = document.getElementById('post-url').value.trim();
  const description = document.getElementById('post-desc').value.trim();
  const thumb = document.getElementById('post-thumb').files[0];
  const err = document.getElementById('post-err');
  if (!title) { err.textContent = 'Título obrigatório'; return; }
  const form = new FormData();
  form.append('title', title);
  if (url) form.append('url', url);
  if (description) form.append('description', description);
  if (thumb) form.append('thumbnail', thumb);
  const r = await fetch('/api/posts', { method: 'POST', body: form }).then(r => r.json());
  if (r.error) { err.textContent = r.error; return; }
  document.getElementById('modal-post').classList.add('hidden');
  document.getElementById('post-title').value = '';
  document.getElementById('post-url').value = '';
  document.getElementById('post-desc').value = '';
  document.getElementById('post-thumb').value = '';
  document.getElementById('thumb-preview').innerHTML = '';
  document.getElementById('upload-text').textContent = '📎 Adicionar thumbnail';
});

async function deletePost(e) {
  const id = e.target.dataset.id;
  if (!confirm('Remover este post?')) return;
  await fetch('/api/posts/' + id, { method: 'DELETE' });
}

// ── SOCKET EVENTS ──
socket.on('post:added', post => {
  if (!posts.find(p => p.id === post.id)) {
    posts.push(post);
    renderPosts();
  }
});
socket.on('post:deleted', ({ id }) => {
  posts = posts.filter(p => p.id !== id);
  renderPosts();
});
socket.on('post:reordered', order => {
  posts.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  renderPosts();
});

// Close modals on backdrop click
document.querySelectorAll('.modal').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) m.classList.add('hidden'); });
});