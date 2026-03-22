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
let currentTags = [];
let activeTagFilter = null;
let currentView = 'grid';
let editingPostId = null;
let keepScreenshots = [];
let currentDetailPostId = null;
let currentThreadId = null;

// ── EMOJI LIST ──
const EMOJIS = ['👍','👎','❤️','🔥','😂','😮','😢','👏','🎮','🚀','💯','⭐','🤯','😍','🥳','💀','🤔','😎','🙌','✨','🎉','💪','😤','🤩','👀','🫡','💥','🏆','🎯','🧠'];

function buildEmojiPicker(onPick) {
  const div = document.createElement('div');
  div.className = 'emoji-picker';
  EMOJIS.forEach(e => {
    const btn = document.createElement('button');
    btn.className = 'emoji-btn';
    btn.textContent = e;
    btn.addEventListener('click', () => onPick(e));
    div.appendChild(btn);
  });
  return div;
}

// ── RICH EDITOR PASTE HANDLER ──
function attachPasteHandler(editorEl, uploadEndpoint) {
  editorEl.addEventListener('paste', async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        if (!currentUser) { alert('Faça login para colar imagens.'); return; }
        const file = item.getAsFile();
        const reader = new FileReader();
        reader.onload = async (ev) => {
          const base64 = ev.target.result.split(',')[1];
          const mimeType = item.type;
          // Show loading placeholder
          const placeholder = document.createElement('span');
          placeholder.textContent = '⏳ Enviando imagem...';
          placeholder.style.color = 'var(--muted)';
          insertNodeAtCaret(editorEl, placeholder);

          const r = await fetch(uploadEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ base64, mimeType })
          }).then(r => r.json());

          if (r.url) {
            const img = document.createElement('img');
            img.src = r.url;
            img.className = 'pasted-img';
            img.style.cssText = 'max-width:100%;border-radius:8px;margin:6px 0;display:block;cursor:pointer;';
            img.onclick = () => openLightbox(r.url);
            placeholder.replaceWith(img);
            // Insert line break after
            const br = document.createElement('br');
            img.after(br);
          } else {
            placeholder.textContent = '❌ Erro ao enviar imagem';
          }
        };
        reader.readAsDataURL(file);
        return;
      }
    }
  });
}

function insertNodeAtCaret(container, node) {
  const sel = window.getSelection();
  if (sel && sel.rangeCount) {
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  } else {
    container.appendChild(node);
  }
}

function getEditorContent(editorEl) {
  // Returns HTML string preserving images as <img src="...">
  return editorEl.innerHTML;
}
function setEditorContent(editorEl, html) {
  editorEl.innerHTML = html || '';
}

// ── INIT ──
window.addEventListener('load', async () => {
  setTimeout(() => {
    document.getElementById('intro').style.display = 'none';
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('app').style.opacity = '1';
  }, 3200);
  await fetchMe();
  await fetchPosts();
  setupRichEditors();
});

function setupRichEditors() {
  const postEditor = document.getElementById('post-long-desc-editor');
  attachPasteHandler(postEditor, '/api/upload/paste');

  const threadEditor = document.getElementById('thread-body-editor');
  attachPasteHandler(threadEditor, '/api/community/paste');
}

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

document.getElementById('btn-auth').addEventListener('click', () => document.getElementById('modal-auth').classList.remove('hidden'));
document.getElementById('close-auth').addEventListener('click', () => document.getElementById('modal-auth').classList.add('hidden'));

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
  const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) }).then(r => r.json());
  if (r.error) { err.textContent = r.error; return; }
  currentUser = { username: r.username };
  document.getElementById('modal-auth').classList.add('hidden');
  updateNav();
});

document.getElementById('do-register').addEventListener('click', async () => {
  const username = document.getElementById('reg-user').value.trim();
  const password = document.getElementById('reg-pass').value;
  const err = document.getElementById('reg-err');
  const r = await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) }).then(r => r.json());
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
  renderTagFilters();
  renderPosts();
}

function getAllTags() {
  const set = new Set();
  posts.forEach(p => (p.tags || []).forEach(t => set.add(t)));
  return [...set];
}

function renderTagFilters() {
  const tags = getAllTags();
  const bar = document.getElementById('tag-filters');
  bar.innerHTML = '';
  if (!tags.length) return;
  const allBtn = document.createElement('button');
  allBtn.className = 'tag-filter-btn' + (activeTagFilter === null ? ' active' : '');
  allBtn.textContent = 'Todos';
  allBtn.addEventListener('click', () => { activeTagFilter = null; renderTagFilters(); renderPosts(); });
  bar.appendChild(allBtn);
  tags.forEach(tag => {
    const btn = document.createElement('button');
    btn.className = 'tag-filter-btn' + (activeTagFilter === tag ? ' active' : '');
    btn.textContent = tag;
    btn.addEventListener('click', () => { activeTagFilter = tag; renderTagFilters(); renderPosts(); });
    bar.appendChild(btn);
  });
}

function getFilteredPosts() {
  if (!activeTagFilter) return posts;
  return posts.filter(p => (p.tags || []).includes(activeTagFilter));
}

function renderReactionsSummary(reactions, myReaction) {
  const summary = Object.entries(reactions || {});
  if (!summary.length) return '';
  return summary.map(([emoji, count]) =>
    `<button class="reaction-chip${myReaction === emoji ? ' my-reaction' : ''}" data-emoji="${emoji}">${emoji} <span>${count}</span></button>`
  ).join('');
}

function renderPosts() {
  const grid = document.getElementById('posts-grid');
  const empty = document.getElementById('empty-state');
  grid.innerHTML = '';
  grid.className = currentView === 'list' ? 'posts-list' : '';
  const filtered = getFilteredPosts();
  if (!filtered.length) { empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  const isMingau = currentUser && currentUser.username === 'Mingau';

  filtered.forEach(post => {
    const card = document.createElement('div');
    card.className = 'post-card' + (currentView === 'list' ? ' post-card-list' : '');
    card.dataset.id = post.id;
    card.draggable = isMingau;

    const thumb = post.thumbnail
      ? `<img class="card-thumb" src="${post.thumbnail}" alt="${post.title}" loading="lazy"/>`
      : `<div class="card-thumb-placeholder">🎮</div>`;

    const tagsHtml = (post.tags || []).map(t => `<span class="card-tag">${t}</span>`).join('');
    const likeCount = Object.keys(post.likes || {}).length;
    const commentCount = (post.comments || []).length;
    const reactionsSummary = renderReactionsSummary(post.reactions, currentUser ? (Object.entries(post.reactions || {}).find(([, v]) => v[currentUser.username])?.[0]) : null);

    card.innerHTML = `
      ${thumb}
      <div class="card-body">
        <div class="card-title">${post.title}</div>
        ${tagsHtml ? `<div class="card-tags">${tagsHtml}</div>` : ''}
        ${post.description ? `<div class="card-desc">${post.description}</div>` : ''}
        <div class="card-meta">
          <span class="card-meta-item">♥ ${likeCount}</span>
          <span class="card-meta-item">💬 ${commentCount}</span>
          ${post.clicks ? `<span class="card-meta-item">👁 ${post.clicks}</span>` : ''}
        </div>
        ${reactionsSummary ? `<div class="card-reactions">${reactionsSummary}</div>` : ''}
      </div>
      ${isMingau ? `<button class="card-delete" data-id="${post.id}" title="Remover">×</button><button class="card-edit" data-id="${post.id}" title="Editar">✏️</button>` : ''}
    `;

    card.addEventListener('click', (e) => {
      if (e.target.classList.contains('card-delete') || e.target.classList.contains('card-edit') || e.target.classList.contains('reaction-chip') || e.target.closest('.reaction-chip')) return;
      openDetail(post.id);
    });

    // Reaction chips on card
    card.querySelectorAll('.reaction-chip').forEach(chip => {
      chip.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!currentUser) { document.getElementById('modal-auth').classList.remove('hidden'); return; }
        const emoji = chip.dataset.emoji;
        const r = await fetch('/api/posts/' + post.id + '/react', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emoji }) }).then(r => r.json());
        if (!r.error) {
          const idx = posts.findIndex(p => p.id === post.id);
          if (idx !== -1) posts[idx].reactions = r.reactions;
          renderPosts();
        }
      });
    });

    if (isMingau) {
      card.addEventListener('dragstart', onDragStart);
      card.addEventListener('dragover', onDragOver);
      card.addEventListener('drop', onDrop);
      card.addEventListener('dragend', onDragEnd);
      const del = card.querySelector('.card-delete');
      if (del) del.addEventListener('click', deletePost);
      const edit = card.querySelector('.card-edit');
      if (edit) edit.addEventListener('click', (e) => { e.stopPropagation(); openEditModal(parseInt(e.target.dataset.id)); });
    }
    grid.appendChild(card);
  });
}

// ── VIEW TOGGLE ──
document.getElementById('view-grid').addEventListener('click', () => {
  currentView = 'grid';
  document.getElementById('view-grid').classList.add('active');
  document.getElementById('view-list').classList.remove('active');
  renderPosts();
});
document.getElementById('view-list').addEventListener('click', () => {
  currentView = 'list';
  document.getElementById('view-list').classList.add('active');
  document.getElementById('view-grid').classList.remove('active');
  renderPosts();
});

// ── DRAG & DROP ──
function onDragStart(e) { dragSrc = this; this.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; }
function onDragOver(e) { e.preventDefault(); document.querySelectorAll('.post-card').forEach(c => c.classList.remove('drag-over')); this.classList.add('drag-over'); }
function onDrop(e) {
  e.preventDefault();
  if (dragSrc === this) return;
  const srcId = parseInt(dragSrc.dataset.id), dstId = parseInt(this.dataset.id);
  const srcIdx = posts.findIndex(p => p.id === srcId), dstIdx = posts.findIndex(p => p.id === dstId);
  posts.splice(dstIdx, 0, posts.splice(srcIdx, 1)[0]);
  renderPosts();
  fetch('/api/posts/reorder', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order: posts.map(p => p.id) }) });
}
function onDragEnd() { document.querySelectorAll('.post-card').forEach(c => c.classList.remove('dragging', 'drag-over')); }

// ── TAGS INPUT ──
function renderTagsPreview() {
  const preview = document.getElementById('tags-preview');
  preview.innerHTML = currentTags.map((t, i) =>
    `<span class="tag-pill">${t}<button class="tag-remove" data-idx="${i}">×</button></span>`
  ).join('');
  preview.querySelectorAll('.tag-remove').forEach(btn => {
    btn.addEventListener('click', () => { currentTags.splice(parseInt(btn.dataset.idx), 1); renderTagsPreview(); });
  });
}

document.getElementById('tags-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    const val = e.target.value.trim().replace(',', '');
    if (val && !currentTags.includes(val)) { currentTags.push(val); renderTagsPreview(); }
    e.target.value = '';
  }
});

// ── SCREENSHOTS ──
document.getElementById('post-screenshots').addEventListener('change', function () {
  const files = Array.from(this.files);
  document.getElementById('screenshots-text').textContent = `📷 ${files.length} screenshot(s)`;
  const existingHtml = keepScreenshots.map((src, i) =>
    `<div class="screenshot-thumb-wrap"><img src="${src}" class="screenshot-thumb"/><button class="screenshot-remove" data-keep-idx="${i}">×</button></div>`
  ).join('');
  Promise.all(files.map(f => new Promise(res => {
    const r = new FileReader();
    r.onload = e => res(`<div class="screenshot-thumb-wrap"><img src="${e.target.result}" class="screenshot-thumb"/></div>`);
    r.readAsDataURL(f);
  }))).then(htmlArr => {
    document.getElementById('screenshots-preview').innerHTML = `<div class="screenshots-row">${existingHtml}${htmlArr.join('')}</div>`;
    document.getElementById('screenshots-preview').querySelectorAll('.screenshot-remove').forEach(btn => {
      btn.addEventListener('click', () => { keepScreenshots.splice(parseInt(btn.dataset.keepIdx), 1); document.getElementById('post-screenshots').dispatchEvent(new Event('change')); });
    });
  });
});

document.getElementById('post-thumb').addEventListener('change', function () {
  const file = this.files[0]; if (!file) return;
  document.getElementById('upload-text').textContent = '✅ ' + file.name;
  const r = new FileReader();
  r.onload = e => { document.getElementById('thumb-preview').innerHTML = `<img src="${e.target.result}" style="width:100%;border-radius:10px;margin-top:8px;"/>`; };
  r.readAsDataURL(file);
});

// ── ADD POST ──
document.getElementById('btn-add').addEventListener('click', () => {
  editingPostId = null; currentTags = []; keepScreenshots = [];
  document.getElementById('modal-post-title').textContent = 'Adicionar jogo';
  ['post-title','post-url','post-embed','post-desc'].forEach(id => document.getElementById(id).value = '');
  setEditorContent(document.getElementById('post-long-desc-editor'), '');
  document.getElementById('post-thumb').value = '';
  document.getElementById('post-screenshots').value = '';
  document.getElementById('thumb-preview').innerHTML = '';
  document.getElementById('screenshots-preview').innerHTML = '';
  document.getElementById('upload-text').textContent = '📎 Adicionar thumbnail';
  document.getElementById('screenshots-text').textContent = '📷 Adicionar screenshots';
  document.getElementById('post-err').textContent = '';
  renderTagsPreview();
  document.getElementById('modal-post').classList.remove('hidden');
});
document.getElementById('close-post').addEventListener('click', () => document.getElementById('modal-post').classList.add('hidden'));

// ── EDIT POST ──
function openEditModal(id) {
  const post = posts.find(p => p.id === id); if (!post) return;
  editingPostId = id; currentTags = [...(post.tags || [])]; keepScreenshots = [...(post.screenshots || [])];
  document.getElementById('modal-post-title').textContent = 'Editar jogo';
  document.getElementById('post-title').value = post.title || '';
  document.getElementById('post-url').value = post.url || '';
  document.getElementById('post-embed').value = post.embedUrl || '';
  document.getElementById('post-desc').value = post.description || '';
  setEditorContent(document.getElementById('post-long-desc-editor'), post.longDescription || '');
  document.getElementById('post-err').textContent = '';
  document.getElementById('post-thumb').value = '';
  document.getElementById('post-screenshots').value = '';
  document.getElementById('screenshots-text').textContent = '📷 Adicionar screenshots';
  document.getElementById('thumb-preview').innerHTML = post.thumbnail ? `<img src="${post.thumbnail}" style="width:100%;border-radius:10px;margin-top:8px;"/>` : '';
  document.getElementById('upload-text').textContent = post.thumbnail ? '✅ Thumbnail atual' : '📎 Adicionar thumbnail';

  if (keepScreenshots.length) {
    document.getElementById('screenshots-preview').innerHTML = `<div class="screenshots-row">${keepScreenshots.map((src, i) =>
      `<div class="screenshot-thumb-wrap"><img src="${src}" class="screenshot-thumb"/><button class="screenshot-remove" data-keep-idx="${i}">×</button></div>`
    ).join('')}</div>`;
    document.getElementById('screenshots-preview').querySelectorAll('.screenshot-remove').forEach(btn => {
      btn.addEventListener('click', () => { keepScreenshots.splice(parseInt(btn.dataset.keepIdx), 1); openEditModal(id); });
    });
  } else { document.getElementById('screenshots-preview').innerHTML = ''; }

  renderTagsPreview();
  document.getElementById('modal-post').classList.remove('hidden');
}

document.getElementById('do-post').addEventListener('click', async () => {
  const title = document.getElementById('post-title').value.trim();
  const url = document.getElementById('post-url').value.trim();
  const embedUrl = document.getElementById('post-embed').value.trim();
  const description = document.getElementById('post-desc').value.trim();
  const longDescription = getEditorContent(document.getElementById('post-long-desc-editor'));
  const thumb = document.getElementById('post-thumb').files[0];
  const screenshots = document.getElementById('post-screenshots').files;
  const err = document.getElementById('post-err');
  if (!title) { err.textContent = 'Título obrigatório'; return; }
  const form = new FormData();
  form.append('title', title);
  if (url) form.append('url', url);
  if (embedUrl) form.append('embedUrl', embedUrl);
  if (description) form.append('description', description);
  if (longDescription) form.append('longDescription', longDescription);
  form.append('tags', JSON.stringify(currentTags));
  if (thumb) form.append('thumbnail', thumb);
  Array.from(screenshots).forEach(f => form.append('screenshots', f));
  let r;
  if (editingPostId) {
    form.append('keepScreenshots', JSON.stringify(keepScreenshots));
    r = await fetch('/api/posts/' + editingPostId, { method: 'PUT', body: form }).then(r => r.json());
  } else {
    r = await fetch('/api/posts', { method: 'POST', body: form }).then(r => r.json());
  }
  if (r.error) { err.textContent = r.error; return; }
  document.getElementById('modal-post').classList.add('hidden');
  if (editingPostId) { const idx = posts.findIndex(p => p.id === editingPostId); if (idx !== -1) posts[idx] = r; }
  renderTagFilters(); renderPosts();
});

async function deletePost(e) {
  const id = e.target.dataset.id;
  if (!confirm('Remover este post?')) return;
  await fetch('/api/posts/' + id, { method: 'DELETE' });
}

// ── EMOJI REACTIONS ──
let emojiPickerTarget = null; // { type: 'post'|'community'|'reply', id, replyId? }

function openEmojiPicker(anchorEl, target) {
  // Close any open picker
  document.querySelectorAll('.emoji-picker.visible').forEach(p => p.classList.remove('visible'));

  emojiPickerTarget = target;
  const picker = document.getElementById('emoji-picker-global');
  picker.innerHTML = '';
  EMOJIS.forEach(e => {
    const btn = document.createElement('button');
    btn.className = 'emoji-btn';
    btn.textContent = e;
    btn.addEventListener('click', async () => {
      picker.classList.remove('visible');
      await sendReaction(target, e);
    });
    picker.appendChild(btn);
  });

  const rect = anchorEl.getBoundingClientRect();
  picker.style.position = 'fixed';
  picker.style.top = (rect.bottom + 6) + 'px';
  picker.style.left = Math.min(rect.left, window.innerWidth - 280) + 'px';
  picker.classList.add('visible');
}

async function sendReaction(target, emoji) {
  let url;
  if (target.type === 'post') url = '/api/posts/' + target.id + '/react';
  else if (target.type === 'community') url = '/api/community/' + target.id + '/react';
  else if (target.type === 'reply') url = '/api/community/' + target.threadId + '/replies/' + target.replyId + '/react';
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emoji }) }).then(r => r.json());
  if (r.error) return;
  if (target.type === 'post') {
    const p = posts.find(p => p.id === target.id);
    if (p) p.reactions = r.reactions;
    renderPosts();
    if (currentDetailPostId === target.id) renderDetailReactions(r.reactions, r.myReaction);
  } else if (target.type === 'community') {
    // Handled via socket or reload
  } else if (target.type === 'reply') {
    // Re-render replies
    if (currentThreadId === target.threadId) loadThreadDetail(target.threadId);
  }
}

document.addEventListener('click', (e) => {
  const picker = document.getElementById('emoji-picker-global');
  if (!picker.contains(e.target) && !e.target.classList.contains('btn-add-reaction') && !e.target.classList.contains('reply-react-btn')) {
    picker.classList.remove('visible');
  }
});

// ── DETAIL MODAL ──
async function openDetail(id) {
  const post = posts.find(p => p.id === id); if (!post) return;
  currentDetailPostId = id;
  fetch('/api/posts/' + id + '/click', { method: 'POST' });

  const isMingau = currentUser && currentUser.username === 'Mingau';
  const likeCount = Object.keys(post.likes || {}).length;
  const voter = currentUser?.username;
  const liked = voter && post.likes?.[voter];

  const mediaEl = document.getElementById('detail-media');
  if (post.embedUrl) {
    mediaEl.innerHTML = `<div class="embed-wrap"><iframe src="${post.embedUrl}" allowfullscreen frameborder="0"></iframe></div>`;
  } else if (post.thumbnail) {
    mediaEl.innerHTML = `<img src="${post.thumbnail}" class="detail-main-img"/>`;
  } else { mediaEl.innerHTML = ''; }

  document.getElementById('detail-title').textContent = post.title;
  document.getElementById('detail-tags').innerHTML = (post.tags || []).map(t => `<span class="card-tag">${t}</span>`).join('');
  document.getElementById('detail-like-count').textContent = likeCount;
  document.getElementById('detail-clicks').textContent = post.clicks || 0;
  document.getElementById('detail-comment-count').textContent = (post.comments || []).length;
  document.getElementById('detail-like-btn').classList.toggle('liked', !!liked);

  const linkEl = document.getElementById('detail-link');
  if (post.url) { linkEl.href = post.url; linkEl.classList.remove('hidden'); } else { linkEl.classList.add('hidden'); }

  const editBtn = document.getElementById('detail-edit-btn');
  if (isMingau) { editBtn.classList.remove('hidden'); editBtn.onclick = () => { document.getElementById('modal-detail').classList.add('hidden'); openEditModal(id); }; }
  else editBtn.classList.add('hidden');

  // Long description (HTML with pasted images)
  const descEl = document.getElementById('detail-desc-long');
  if (post.longDescription) {
    descEl.innerHTML = post.longDescription;
    descEl.querySelectorAll('img').forEach(img => {
      img.style.cursor = 'pointer';
      img.onclick = () => openLightbox(img.src);
    });
  } else { descEl.textContent = post.description || ''; }

  const screenshotsEl = document.getElementById('detail-screenshots');
  const shots = post.embedUrl ? [] : (post.screenshots || []);
  screenshotsEl.innerHTML = shots.map(s => `<img src="${s}" class="screenshot-thumb" style="cursor:pointer;" onclick="openLightbox('${s}')">`).join('');

  // Reactions
  const myReaction = voter ? (Object.entries(post.reactions || {}).find(([, v]) => v[voter])?.[0] || null) : null;
  renderDetailReactions(post.reactions || {}, myReaction);

  await loadComments(id);

  const commentForm = document.getElementById('comment-form');
  const commentLoginMsg = document.getElementById('comment-login-msg');
  if (currentUser) { commentForm.classList.remove('hidden'); commentLoginMsg.classList.add('hidden'); }
  else { commentForm.classList.add('hidden'); commentLoginMsg.classList.remove('hidden'); }

  document.getElementById('modal-detail').classList.remove('hidden');
}

function renderDetailReactions(reactions, myReaction) {
  const display = document.getElementById('detail-reactions-display');
  display.innerHTML = renderReactionsSummary(reactions, myReaction);
  display.querySelectorAll('.reaction-chip').forEach(chip => {
    chip.addEventListener('click', async () => {
      if (!currentUser) { document.getElementById('modal-auth').classList.remove('hidden'); return; }
      const emoji = chip.dataset.emoji;
      await sendReaction({ type: 'post', id: currentDetailPostId }, emoji);
    });
  });
}

document.getElementById('btn-add-reaction').addEventListener('click', (e) => {
  if (!currentUser) { document.getElementById('modal-auth').classList.remove('hidden'); return; }
  openEmojiPicker(e.target, { type: 'post', id: currentDetailPostId });
});

async function loadComments(postId) {
  const comments = await fetch('/api/posts/' + postId + '/comments').then(r => r.json());
  const list = document.getElementById('comments-list');
  const isMingau = currentUser?.username === 'Mingau';
  if (!comments.length) { list.innerHTML = '<p class="muted-msg">Nenhum comentário ainda.</p>'; return; }
  list.innerHTML = comments.map(c => `
    <div class="comment-item">
      <div class="comment-header">
        <span class="comment-user">${c.username}</span>
        <span class="comment-date">${new Date(c.created_at).toLocaleDateString('pt-BR')}</span>
        ${isMingau ? `<button class="comment-delete" data-id="${c.id}">×</button>` : ''}
      </div>
      <div class="comment-text">${escapeHtml(c.text)}</div>
    </div>
  `).join('');
  if (isMingau) {
    list.querySelectorAll('.comment-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        await fetch('/api/posts/' + postId + '/comments/' + btn.dataset.id, { method: 'DELETE' });
        await loadComments(postId);
      });
    });
  }
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

document.getElementById('detail-like-btn').addEventListener('click', async () => {
  if (!currentDetailPostId) return;
  const r = await fetch('/api/posts/' + currentDetailPostId + '/like', { method: 'POST' }).then(r => r.json());
  if (r.error) return;
  document.getElementById('detail-like-count').textContent = r.count;
  document.getElementById('detail-like-btn').classList.toggle('liked', r.liked);
  const post = posts.find(p => p.id === currentDetailPostId);
  if (post) { if (r.liked && currentUser) post.likes[currentUser.username] = true; else if (currentUser) delete post.likes[currentUser.username]; }
  renderPosts();
});

document.getElementById('comment-submit').addEventListener('click', async () => {
  const text = document.getElementById('comment-input').value.trim(); if (!text) return;
  const r = await fetch('/api/posts/' + currentDetailPostId + '/comments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }).then(r => r.json());
  if (r.error) { alert(r.error); return; }
  document.getElementById('comment-input').value = '';
  await loadComments(currentDetailPostId);
  const post = posts.find(p => p.id === currentDetailPostId);
  if (post) { if (!post.comments) post.comments = []; post.comments.push(r); }
  document.getElementById('detail-comment-count').textContent = (post?.comments || []).length;
  renderPosts();
});

document.getElementById('comment-login-link').addEventListener('click', () => {
  document.getElementById('modal-detail').classList.add('hidden');
  document.getElementById('modal-auth').classList.remove('hidden');
});
document.getElementById('close-detail').addEventListener('click', () => {
  document.getElementById('modal-detail').classList.add('hidden');
  currentDetailPostId = null;
});

// ── LIGHTBOX ──
function openLightbox(src) {
  const lb = document.createElement('div');
  lb.className = 'lightbox';
  lb.innerHTML = `<div class="lightbox-inner"><img src="${src}"/><button class="lightbox-close">×</button></div>`;
  lb.addEventListener('click', e => { if (e.target === lb || e.target.classList.contains('lightbox-close')) lb.remove(); });
  document.body.appendChild(lb);
}

// ── STATS ──
document.getElementById('btn-stats').addEventListener('click', async () => {
  const stats = await fetch('/api/stats').then(r => r.json());
  document.getElementById('stats-content').innerHTML = `
    <div class="stat-card"><div class="stat-num">${stats.totalPosts}</div><div class="stat-label">Jogos</div></div>
    <div class="stat-card"><div class="stat-num">${stats.totalUsers}</div><div class="stat-label">Usuários</div></div>
    <div class="stat-card"><div class="stat-num">${stats.totalClicks}</div><div class="stat-label">Cliques</div></div>
    <div class="stat-card"><div class="stat-num">${stats.totalLikes}</div><div class="stat-label">Likes</div></div>
    <div class="stat-card"><div class="stat-num">${stats.totalComments}</div><div class="stat-label">Comentários</div></div>
    <div class="stat-card"><div class="stat-num">${stats.totalThreads || 0}</div><div class="stat-label">Threads</div></div>
    ${stats.topPost ? `<div class="stat-card stat-card-wide"><div class="stat-label">🏆 Mais clicado</div><div class="stat-num-sm">${stats.topPost.title}</div><div class="stat-label">${stats.topPost.clicks} cliques</div></div>` : ''}
  `;
  document.getElementById('modal-stats').classList.remove('hidden');
});
document.getElementById('close-stats').addEventListener('click', () => document.getElementById('modal-stats').classList.add('hidden'));

// ── COMMUNITY PANEL ──
let communityOpen = false;

document.getElementById('community-fab').addEventListener('click', () => {
  communityOpen = !communityOpen;
  const panel = document.getElementById('community-panel');
  if (communityOpen) {
    panel.classList.remove('hidden');
    panel.classList.add('panel-open');
    loadThreads();
    document.getElementById('community-unread').classList.add('hidden');
    document.getElementById('community-unread').textContent = '0';
  } else {
    panel.classList.remove('panel-open');
    setTimeout(() => panel.classList.add('hidden'), 300);
  }
});

document.getElementById('community-close').addEventListener('click', () => {
  communityOpen = false;
  const panel = document.getElementById('community-panel');
  panel.classList.remove('panel-open');
  setTimeout(() => panel.classList.add('hidden'), 300);
});

let communityThreads = [];

async function loadThreads() {
  communityThreads = await fetch('/api/community').then(r => r.json());
  renderThreadsList();
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'agora';
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h';
  return Math.floor(h / 24) + 'd';
}

function renderThreadsList() {
  const list = document.getElementById('threads-list');
  if (!communityThreads.length) { list.innerHTML = '<p class="muted-msg" style="padding:24px;text-align:center;">Nenhuma thread ainda. Seja o primeiro!</p>'; return; }
  list.innerHTML = communityThreads.map(t => {
    const reactSummary = Object.entries(t.reactions || {}).slice(0, 3).map(([e, v]) => `${e}${Object.keys(v).length > 1 ? Object.keys(v).length : ''}`).join(' ');
    return `
      <div class="thread-item" data-id="${t.id}">
        <div class="thread-item-header">
          ${t.pinned ? '<span class="pin-badge">📌</span>' : ''}
          <span class="thread-author">${t.author}</span>
          <span class="thread-time">${timeAgo(t.created_at)}</span>
          ${currentUser?.username === 'Mingau' ? `<button class="thread-pin-btn" data-id="${t.id}" title="${t.pinned ? 'Desafixar' : 'Fixar'}">📌</button><button class="thread-del-btn" data-id="${t.id}">×</button>` : (currentUser?.username === t.author ? `<button class="thread-del-btn" data-id="${t.id}">×</button>` : '')}
        </div>
        <div class="thread-title">${escapeHtml(t.title)}</div>
        ${t.body ? `<div class="thread-preview">${escapeHtml(t.body).slice(0, 120)}${t.body.length > 120 ? '...' : ''}</div>` : ''}
        ${t.images?.length ? `<div class="thread-img-row">${t.images.slice(0,3).map(img => `<img src="${img}" class="thread-thumb" onclick="openLightbox('${img}')">`).join('')}</div>` : ''}
        <div class="thread-footer">
          <span class="thread-meta">💬 ${(t.replies || []).length}</span>
          ${reactSummary ? `<span class="thread-reactions">${reactSummary}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.thread-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('thread-del-btn') || e.target.classList.contains('thread-pin-btn') || e.target.classList.contains('thread-thumb')) return;
      openThreadDetail(parseInt(el.dataset.id));
    });
  });

  list.querySelectorAll('.thread-del-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Remover thread?')) return;
      await fetch('/api/community/' + btn.dataset.id, { method: 'DELETE' });
      await loadThreads();
    });
  });

  list.querySelectorAll('.thread-pin-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await fetch('/api/community/' + btn.dataset.id + '/pin', { method: 'PUT' });
      await loadThreads();
    });
  });
}

async function openThreadDetail(id) {
  currentThreadId = id;
  document.getElementById('community-list-view').classList.add('hidden');
  document.getElementById('community-thread-view').classList.remove('hidden');
  const thread = communityThreads.find(t => t.id === id);
  if (thread) document.getElementById('thread-view-title').textContent = thread.title;
  await loadThreadDetail(id);

  const replyInput = document.getElementById('reply-input');
  const replyLoginMsg = document.getElementById('reply-login-msg');
  const replyFormWrap = document.getElementById('reply-form-wrap');
  if (currentUser) { replyInput.classList.remove('hidden'); document.getElementById('reply-submit').classList.remove('hidden'); replyLoginMsg.classList.add('hidden'); }
  else { replyInput.classList.add('hidden'); document.getElementById('reply-submit').classList.add('hidden'); replyLoginMsg.classList.remove('hidden'); }

  // Attach paste to reply input (for images)
  attachReplyPaste();
}

let replyPastedImages = []; // { url }

function attachReplyPaste() {
  const replyInput = document.getElementById('reply-input');
  replyPastedImages = [];
  replyInput.onpaste = async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        if (!currentUser) { alert('Faça login para colar imagens.'); return; }
        const file = item.getAsFile();
        const reader = new FileReader();
        reader.onload = async (ev) => {
          const base64 = ev.target.result.split(',')[1];
          const r = await fetch('/api/community/paste', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ base64, mimeType: item.type }) }).then(r => r.json());
          if (r.url) {
            replyPastedImages.push(r.url);
            renderReplyPastePreviews();
          }
        };
        reader.readAsDataURL(file);
        return;
      }
    }
  };
}

function renderReplyPastePreviews() {
  const wrap = document.getElementById('reply-paste-previews');
  wrap.innerHTML = replyPastedImages.map((url, i) =>
    `<div class="screenshot-thumb-wrap">
      <img src="${url}" class="screenshot-thumb"/>
      <button class="screenshot-remove" data-idx="${i}">×</button>
    </div>`
  ).join('');
  wrap.querySelectorAll('.screenshot-remove').forEach(btn => {
    btn.addEventListener('click', () => { replyPastedImages.splice(parseInt(btn.dataset.idx), 1); renderReplyPastePreviews(); });
  });
}

async function loadThreadDetail(id) {
  const thread = communityThreads.find(t => t.id === id);
  const replies = await fetch('/api/community/' + id + '/replies').then(r => r.json());
  const isMingau = currentUser?.username === 'Mingau';
  const voter = currentUser?.username;

  const threadMyReaction = voter ? (Object.entries(thread?.reactions || {}).find(([, v]) => v[voter])?.[0] || null) : null;
  const threadReactionHtml = renderReactionsSummary(thread?.reactions || {}, threadMyReaction);

  const content = document.getElementById('thread-detail-content');
  content.innerHTML = `
    <div class="thread-full">
      <div class="thread-full-header">
        <span class="comment-user">${thread?.author || ''}</span>
        <span class="comment-date">${thread ? new Date(thread.created_at).toLocaleDateString('pt-BR') : ''}</span>
        ${thread?.pinned ? '<span class="pin-badge">📌 Fixado</span>' : ''}
      </div>
      <h3 class="thread-full-title">${escapeHtml(thread?.title || '')}</h3>
      ${thread?.body ? `<div class="thread-full-body">${escapeHtml(thread.body)}</div>` : ''}
      ${thread?.images?.length ? `<div class="screenshots-row" style="margin:12px 0;">${thread.images.map(img => `<img src="${img}" class="screenshot-thumb" style="cursor:pointer;" onclick="openLightbox('${img}')">`).join('')}</div>` : ''}
      <div class="thread-actions-row">
        ${threadReactionHtml ? `<div class="reactions-inline">${threadReactionHtml}</div>` : ''}
        ${currentUser ? `<button class="btn-add-reaction-sm thread-react-btn" data-id="${id}">＋ 😀</button>` : ''}
      </div>
    </div>
    <div class="replies-list">${replies.map(r => renderReply(r, id)).join('')}</div>
  `;

  // Thread reaction chips
  content.querySelectorAll('.reaction-chip').forEach(chip => {
    chip.addEventListener('click', async () => {
      if (!currentUser) return;
      await sendReaction({ type: 'community', id }, chip.dataset.emoji);
      await loadThreadDetail(id);
    });
  });

  // Thread react btn
  content.querySelectorAll('.thread-react-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      openEmojiPicker(e.target, { type: 'community', id: parseInt(btn.dataset.id) });
    });
  });

  // Reply reaction chips
  content.querySelectorAll('.reply-reaction-chip').forEach(chip => {
    chip.addEventListener('click', async () => {
      if (!currentUser) return;
      const replyId = parseInt(chip.closest('[data-reply-id]').dataset.replyId);
      await sendReaction({ type: 'reply', threadId: id, replyId }, chip.dataset.emoji);
      await loadThreadDetail(id);
    });
  });

  // Reply react buttons
  content.querySelectorAll('.reply-react-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const replyId = parseInt(btn.dataset.replyId);
      openEmojiPicker(e.target, { type: 'reply', threadId: id, replyId });
    });
  });

  // Reply delete
  content.querySelectorAll('.reply-del-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remover resposta?')) return;
      await fetch('/api/community/' + id + '/replies/' + btn.dataset.id, { method: 'DELETE' });
      await loadThreadDetail(id);
    });
  });
}

function renderReply(reply, threadId) {
  const voter = currentUser?.username;
  const myReaction = voter ? (Object.entries(reply.reactions || {}).find(([, v]) => v[voter])?.[0] || null) : null;
  const reactionHtml = Object.entries(reply.reactions || {}).map(([emoji, voters]) => {
    const count = Object.keys(voters).length;
    const mine = voter && voters[voter];
    return `<button class="reaction-chip reply-reaction-chip${mine ? ' my-reaction' : ''}" data-emoji="${emoji}">${emoji} <span>${count}</span></button>`;
  }).join('');

  const isMingau = currentUser?.username === 'Mingau';
  const isAuthor = currentUser?.username === reply.username;

  return `
    <div class="reply-item" data-reply-id="${reply.id}">
      <div class="comment-header">
        <span class="comment-user">${reply.username}</span>
        <span class="comment-date">${timeAgo(reply.created_at)}</span>
        ${isMingau || isAuthor ? `<button class="reply-del-btn" data-id="${reply.id}">×</button>` : ''}
      </div>
      <div class="comment-text">${escapeHtml(reply.text)}</div>
      ${reply.images?.length ? `<div class="screenshots-row" style="margin-top:8px;">${reply.images.map(img => `<img src="${img}" class="screenshot-thumb" style="cursor:pointer;" onclick="openLightbox('${img}')">`).join('')}</div>` : ''}
      <div class="thread-actions-row">
        ${reactionHtml ? `<div class="reactions-inline">${reactionHtml}</div>` : ''}
        ${currentUser ? `<button class="btn-add-reaction-sm reply-react-btn" data-reply-id="${reply.id}">＋ 😀</button>` : ''}
      </div>
    </div>
  `;
}

document.getElementById('btn-back-threads').addEventListener('click', () => {
  currentThreadId = null;
  document.getElementById('community-thread-view').classList.add('hidden');
  document.getElementById('community-list-view').classList.remove('hidden');
  loadThreads();
});

document.getElementById('reply-submit').addEventListener('click', async () => {
  const text = document.getElementById('reply-input').value.trim();
  if (!text && !replyPastedImages.length) return;
  const form = new FormData();
  form.append('text', text || ' ');
  // For pasted images, we already uploaded them; send URLs in text
  let finalText = text;
  if (replyPastedImages.length) finalText = (text ? text + '\n' : '') + replyPastedImages.map(u => `[img:${u}]`).join('\n');
  form.set('text', finalText || ' ');

  const r = await fetch('/api/community/' + currentThreadId + '/replies', { method: 'POST', body: form }).then(r => r.json());
  if (r.error) { alert(r.error); return; }
  document.getElementById('reply-input').value = '';
  replyPastedImages = [];
  renderReplyPastePreviews();
  await loadThreadDetail(currentThreadId);
});

document.getElementById('reply-login-link').addEventListener('click', () => {
  document.getElementById('modal-auth').classList.remove('hidden');
});

// ── NEW THREAD MODAL ──
document.getElementById('btn-new-thread').addEventListener('click', () => {
  if (!currentUser) { document.getElementById('modal-auth').classList.remove('hidden'); return; }
  document.getElementById('thread-title').value = '';
  setEditorContent(document.getElementById('thread-body-editor'), '');
  document.getElementById('thread-images').value = '';
  document.getElementById('thread-img-preview').innerHTML = '';
  document.getElementById('thread-img-text').textContent = '🖼️ Adicionar imagens';
  document.getElementById('thread-err').textContent = '';
  document.getElementById('modal-thread').classList.remove('hidden');
});
document.getElementById('close-thread').addEventListener('click', () => document.getElementById('modal-thread').classList.add('hidden'));

document.getElementById('thread-images').addEventListener('change', function() {
  const files = Array.from(this.files);
  document.getElementById('thread-img-text').textContent = `🖼️ ${files.length} imagem(ns)`;
  Promise.all(files.map(f => new Promise(res => {
    const r = new FileReader(); r.onload = e => res(e.target.result); r.readAsDataURL(f);
  }))).then(srcs => {
    document.getElementById('thread-img-preview').innerHTML = srcs.map(s => `<img src="${s}" class="screenshot-thumb">`).join('');
  });
});

document.getElementById('do-thread').addEventListener('click', async () => {
  const title = document.getElementById('thread-title').value.trim();
  const body = getEditorContent(document.getElementById('thread-body-editor'));
  const images = document.getElementById('thread-images').files;
  const err = document.getElementById('thread-err');
  if (!title) { err.textContent = 'Título obrigatório'; return; }
  const form = new FormData();
  form.append('title', title);
  form.append('body', body);
  Array.from(images).forEach(f => form.append('images', f));
  const r = await fetch('/api/community', { method: 'POST', body: form }).then(r => r.json());
  if (r.error) { err.textContent = r.error; return; }
  document.getElementById('modal-thread').classList.add('hidden');
  communityThreads.unshift(r);
  renderThreadsList();
});

// ── SOCKET EVENTS ──
socket.on('post:added', post => { if (!posts.find(p => p.id === post.id)) { posts.push(post); renderTagFilters(); renderPosts(); } });
socket.on('post:updated', up => { const i = posts.findIndex(p => p.id === up.id); if (i !== -1) posts[i] = up; renderTagFilters(); renderPosts(); });
socket.on('post:deleted', ({ id }) => { posts = posts.filter(p => p.id !== id); renderTagFilters(); renderPosts(); });
socket.on('post:reordered', order => { posts.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)); renderPosts(); });
socket.on('post:clicked', ({ id, clicks }) => { const p = posts.find(p => p.id === id); if (p) p.clicks = clicks; });
socket.on('post:liked', ({ id, count }) => { const p = posts.find(p => p.id === id); if (p && p.likes) renderPosts(); });
socket.on('post:reacted', ({ id, reactions }) => { const p = posts.find(p => p.id === id); if (p) { p.reactions = reactions; renderPosts(); } });
socket.on('comment:added', ({ postId, comment }) => {
  const p = posts.find(p => p.id === postId);
  if (p) { if (!p.comments) p.comments = []; p.comments.push(comment); }
  if (currentDetailPostId === postId) { loadComments(postId); document.getElementById('detail-comment-count').textContent = (p?.comments || []).length; }
  renderPosts();
});
socket.on('comment:deleted', ({ postId, commentId }) => {
  const p = posts.find(p => p.id === postId);
  if (p) p.comments = (p.comments || []).filter(c => c.id !== commentId);
  if (currentDetailPostId === postId) loadComments(postId);
  renderPosts();
});

socket.on('community:thread:added', thread => {
  if (!communityOpen) {
    const badge = document.getElementById('community-unread');
    badge.classList.remove('hidden');
    badge.textContent = parseInt(badge.textContent || '0') + 1;
  }
  if (!communityThreads.find(t => t.id === thread.id)) { communityThreads.unshift(thread); renderThreadsList(); }
});
socket.on('community:thread:deleted', ({ id }) => { communityThreads = communityThreads.filter(t => t.id !== id); renderThreadsList(); });
socket.on('community:thread:pinned', ({ id, pinned }) => { const t = communityThreads.find(t => t.id === id); if (t) { t.pinned = pinned; renderThreadsList(); } });
socket.on('community:reacted', ({ id, reactions }) => { const t = communityThreads.find(t => t.id === id); if (t) t.reactions = reactions; if (currentThreadId === id) loadThreadDetail(id); });
socket.on('community:reply:added', ({ threadId, reply }) => {
  const t = communityThreads.find(t => t.id === threadId);
  if (t) { if (!t.replies) t.replies = []; t.replies.push(reply); }
  if (currentThreadId === threadId) loadThreadDetail(threadId);
  else if (communityOpen) renderThreadsList();
  else {
    const badge = document.getElementById('community-unread');
    badge.classList.remove('hidden');
    badge.textContent = parseInt(badge.textContent || '0') + 1;
  }
});
socket.on('community:reply:deleted', ({ threadId, replyId }) => {
  const t = communityThreads.find(t => t.id === threadId);
  if (t) t.replies = (t.replies || []).filter(r => r.id !== replyId);
  if (currentThreadId === threadId) loadThreadDetail(threadId);
});
socket.on('community:reply:reacted', ({ threadId, replyId, reactions }) => {
  if (currentThreadId === threadId) loadThreadDetail(threadId);
});

// Close modals on backdrop
document.querySelectorAll('.modal').forEach(m => { m.addEventListener('click', e => { if (e.target === m) m.classList.add('hidden'); }); });