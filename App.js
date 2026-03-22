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
let editingPostId = null;
let currentTags = [];
let activeTagFilter = null;
let currentView = 'grid';

// ── INIT ──
window.addEventListener('load', async () => {
  setTimeout(() => {
    document.getElementById('intro').style.display = 'none';
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('app').style.opacity = '1';
  }, 3200);
  await fetchMe();
  await fetchPosts();
  await fetchHero();
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
  const btnHeroEdit = document.getElementById('btn-hero-edit');
  if (currentUser) {
    navUser.textContent = currentUser.username;
    btnAuth.classList.add('hidden');
    btnLogout.classList.remove('hidden');
    if (currentUser.username === 'Mingau') {
      mingauPanel.classList.remove('hidden');
      btnHeroEdit.classList.remove('hidden');
    }
  } else {
    navUser.textContent = '';
    btnAuth.classList.remove('hidden');
    btnLogout.classList.add('hidden');
    mingauPanel.classList.add('hidden');
    btnHeroEdit.classList.add('hidden');
  }
  renderPosts();
}

document.getElementById('btn-auth').addEventListener('click', () => {
  document.getElementById('modal-auth').classList.remove('hidden');
});
document.getElementById('close-auth').addEventListener('click', () => {
  document.getElementById('modal-auth').classList.add('hidden');
});

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
  renderTagFilters();
  renderPosts();
}

function getAllTags() {
  const tags = new Set();
  posts.forEach(p => (p.tags || []).forEach(t => tags.add(t)));
  return [...tags];
}

function renderTagFilters() {
  const tags = getAllTags();
  const container = document.getElementById('tag-filters');
  container.innerHTML = '';
  if (!tags.length) return;

  const allBtn = document.createElement('button');
  allBtn.className = 'tag-filter-btn' + (!activeTagFilter ? ' active' : '');
  allBtn.textContent = 'Todos';
  allBtn.addEventListener('click', () => { activeTagFilter = null; renderTagFilters(); renderPosts(); });
  container.appendChild(allBtn);

  tags.forEach(tag => {
    const btn = document.createElement('button');
    btn.className = 'tag-filter-btn' + (activeTagFilter === tag ? ' active' : '');
    btn.textContent = tag;
    btn.addEventListener('click', () => { activeTagFilter = tag; renderTagFilters(); renderPosts(); });
    container.appendChild(btn);
  });
}

function getFilteredPosts() {
  if (!activeTagFilter) return posts;
  return posts.filter(p => (p.tags || []).includes(activeTagFilter));
}

function renderPosts() {
  const grid = document.getElementById('posts-grid');
  const empty = document.getElementById('empty-state');
  grid.innerHTML = '';

  const filtered = getFilteredPosts();
  grid.className = currentView === 'list' ? 'posts-list' : '';

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

    const tagsHtml = (post.tags || []).length
      ? `<div class="card-tags">${post.tags.map(t => `<span class="card-tag">${t}</span>`).join('')}</div>`
      : '';

    const reactionsHtml = `
      <div class="card-reactions">
        <button class="reaction-btn" data-id="${post.id}" data-type="fire">🔥 <span>${post.reactions?.fire || 0}</span></button>
        <button class="reaction-btn" data-id="${post.id}" data-type="heart">❤️ <span>${post.reactions?.heart || 0}</span></button>
        <button class="reaction-btn" data-id="${post.id}" data-type="star">⭐ <span>${post.reactions?.star || 0}</span></button>
      </div>`;

    const clicksHtml = `<span class="card-clicks">👁 ${post.clicks || 0}</span>`;

    const link = post.url
      ? `<a class="card-link" href="${post.url}" target="_blank" rel="noopener" data-post-id="${post.id}">▶ Abrir link</a>`
      : '';

    const adminBtns = isMingau ? `
      <div class="card-admin-btns">
        <button class="card-edit" data-id="${post.id}" title="Editar">✏️</button>
        <button class="card-delete" data-id="${post.id}" title="Remover">×</button>
      </div>` : '';

    card.innerHTML = `
      ${thumb}
      <div class="card-body">
        <div class="card-title">${post.title}</div>
        ${tagsHtml}
        ${post.description ? `<div class="card-desc">${post.description}</div>` : ''}
        <div class="card-footer">
          ${link}
          <div class="card-meta">${clicksHtml}</div>
        </div>
        ${reactionsHtml}
      </div>
      ${adminBtns}
    `;

    // Open detail on card click (not on link/button)
    card.addEventListener('click', e => {
      if (e.target.closest('a, button')) return;
      openDetail(post.id);
    });

    // Reaction buttons
    card.querySelectorAll('.reaction-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const type = btn.dataset.type;
        const id = btn.dataset.id;
        const r = await fetch(`/api/posts/${id}/react`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type })
        }).then(r => r.json());
        if (r.reactions) {
          btn.querySelector('span').textContent = r.reactions[type];
          btn.classList.add('reacted');
          setTimeout(() => btn.classList.remove('reacted'), 400);
        }
      });
    });

    // Track link clicks
    const linkEl = card.querySelector('.card-link');
    if (linkEl) {
      linkEl.addEventListener('click', () => {
        fetch(`/api/posts/${post.id}/click`, { method: 'POST' });
      });
    }

    if (isMingau) {
      card.addEventListener('dragstart', onDragStart);
      card.addEventListener('dragover', onDragOver);
      card.addEventListener('drop', onDrop);
      card.addEventListener('dragend', onDragEnd);

      const editBtn = card.querySelector('.card-edit');
      if (editBtn) editBtn.addEventListener('click', e => { e.stopPropagation(); openEditPost(parseInt(e.target.dataset.id)); });

      const delBtn = card.querySelector('.card-delete');
      if (delBtn) delBtn.addEventListener('click', e => { e.stopPropagation(); deletePost(e); });
    }

    grid.appendChild(card);
  });
}

// ── VIEW TOGGLE ──
document.querySelectorAll('.view-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentView = btn.dataset.view;
    renderPosts();
  });
});

// ── DETAIL MODAL ──
async function openDetail(postId) {
  const post = posts.find(p => p.id === postId);
  if (!post) return;

  const isMingau = currentUser && currentUser.username === 'Mingau';

  const screensHtml = (post.screenshots || []).length
    ? `<div class="detail-screenshots">
        ${post.screenshots.map(s => `<img src="${s}" class="detail-screenshot" loading="lazy"/>`).join('')}
      </div>` : '';

  const tagsHtml = (post.tags || []).length
    ? `<div class="detail-tags">${post.tags.map(t => `<span class="card-tag">${t}</span>`).join('')}</div>`
    : '';

  const linksHtml = (() => {
    const allLinks = [];
    if (post.url) allLinks.push({ label: '▶ Jogar agora', url: post.url });
    (post.links || []).forEach(l => allLinks.push(l));
    return allLinks.length
      ? `<div class="detail-links">${allLinks.map(l => `<a href="${l.url}" target="_blank" rel="noopener" class="detail-link-btn" data-post-id="${post.id}">${l.label}</a>`).join('')}</div>`
      : '';
  })();

  const reactionsHtml = `
    <div class="detail-reactions">
      <button class="reaction-btn reaction-btn-lg" data-id="${post.id}" data-type="fire">🔥 <span>${post.reactions?.fire || 0}</span></button>
      <button class="reaction-btn reaction-btn-lg" data-id="${post.id}" data-type="heart">❤️ <span>${post.reactions?.heart || 0}</span></button>
      <button class="reaction-btn reaction-btn-lg" data-id="${post.id}" data-type="star">⭐ <span>${post.reactions?.star || 0}</span></button>
    </div>`;

  const commentsHtml = `
    <div class="detail-comments">
      <h4>Comentários (${(post.comments || []).length})</h4>
      <div class="comments-list" id="comments-list-${post.id}">
        ${renderCommentsList(post)}
      </div>
      ${currentUser
        ? `<div class="comment-form">
            <textarea id="comment-input-${post.id}" placeholder="Deixe seu comentário..." rows="2"></textarea>
            <button class="btn-primary" id="comment-send-${post.id}">Enviar</button>
          </div>`
        : `<p class="comment-login-hint">
            <button class="btn-outline btn-sm" id="comment-login-prompt">Entre</button> para comentar
          </p>`
      }
    </div>`;

  document.getElementById('detail-content').innerHTML = `
    ${post.thumbnail ? `<img class="detail-thumb" src="${post.thumbnail}" alt="${post.title}"/>` : ''}
    <div class="detail-body">
      <div class="detail-header">
        <div>
          <h2 class="detail-title">${post.title}</h2>
          ${tagsHtml}
        </div>
        <span class="card-clicks">👁 ${post.clicks || 0}</span>
      </div>
      ${post.longDescription ? `<p class="detail-long-desc">${post.longDescription.replace(/\n/g, '<br/>')}</p>` : (post.description ? `<p class="detail-long-desc">${post.description}</p>` : '')}
      ${screensHtml}
      ${linksHtml}
      ${reactionsHtml}
      ${commentsHtml}
    </div>
  `;

  document.getElementById('modal-detail').classList.remove('hidden');

  // Reaction buttons inside detail
  document.querySelectorAll('#detail-content .reaction-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const type = btn.dataset.type;
      const id = btn.dataset.id;
      const r = await fetch(`/api/posts/${id}/react`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type })
      }).then(r => r.json());
      if (r.reactions) {
        btn.querySelector('span').textContent = r.reactions[type];
        btn.classList.add('reacted');
        setTimeout(() => btn.classList.remove('reacted'), 400);
        const cardBtn = document.querySelector(`.reaction-btn[data-id="${id}"][data-type="${type}"]`);
        if (cardBtn) cardBtn.querySelector('span').textContent = r.reactions[type];
      }
    });
  });

  // Link click tracking in detail
  document.querySelectorAll('#detail-content .detail-link-btn').forEach(a => {
    a.addEventListener('click', () => {
      fetch(`/api/posts/${a.dataset.postId}/click`, { method: 'POST' });
    });
  });

  // Comment send
  const sendBtn = document.getElementById(`comment-send-${post.id}`);
  if (sendBtn) {
    sendBtn.addEventListener('click', async () => {
      const input = document.getElementById(`comment-input-${post.id}`);
      const text = input.value.trim();
      if (!text) return;
      const r = await fetch(`/api/posts/${post.id}/comments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      }).then(r => r.json());
      if (r.error) { alert(r.error); return; }
      input.value = '';
      const p = posts.find(p => p.id === post.id);
      if (p) {
        if (!p.comments) p.comments = [];
        p.comments.push(r);
        document.getElementById(`comments-list-${post.id}`).innerHTML = renderCommentsList(p);
        bindCommentDeletes(p);
      }
    });
  }

  const loginPrompt = document.getElementById('comment-login-prompt');
  if (loginPrompt) {
    loginPrompt.addEventListener('click', () => {
      document.getElementById('modal-detail').classList.add('hidden');
      document.getElementById('modal-auth').classList.remove('hidden');
    });
  }

  bindCommentDeletes(post);
}

function renderCommentsList(post) {
  if (!post.comments || !post.comments.length) return '<p class="no-comments">Nenhum comentário ainda. Seja o primeiro!</p>';
  const isMingau = currentUser && currentUser.username === 'Mingau';
  return post.comments.map(c => `
    <div class="comment" data-comment-id="${c.id}">
      <div class="comment-header">
        <span class="comment-user">${c.username}</span>
        <span class="comment-date">${formatDate(c.created_at)}</span>
        ${isMingau ? `<button class="comment-delete" data-post-id="${post.id}" data-comment-id="${c.id}">×</button>` : ''}
      </div>
      <p class="comment-text">${c.text.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>
    </div>
  `).join('');
}

function bindCommentDeletes(post) {
  document.querySelectorAll('.comment-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remover comentário?')) return;
      const postId = btn.dataset.postId;
      const commentId = btn.dataset.commentId;
      await fetch(`/api/posts/${postId}/comments/${commentId}`, { method: 'DELETE' });
      const p = posts.find(p => p.id === parseInt(postId));
      if (p) {
        p.comments = p.comments.filter(c => c.id !== parseInt(commentId));
        document.getElementById(`comments-list-${p.id}`).innerHTML = renderCommentsList(p);
        bindCommentDeletes(p);
      }
    });
  });
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

document.getElementById('close-detail').addEventListener('click', () => {
  document.getElementById('modal-detail').classList.add('hidden');
});

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

// ── TAG INPUT ──
function initTagInput() {
  currentTags = [];
  renderTagsPreview();
  const input = document.getElementById('tag-input');
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = input.value.trim().replace(/,/g, '');
      if (val && !currentTags.includes(val) && currentTags.length < 5) {
        currentTags.push(val);
        renderTagsPreview();
      }
      input.value = '';
    }
  });
}

function renderTagsPreview() {
  const preview = document.getElementById('tags-preview');
  preview.innerHTML = currentTags.map((t, i) =>
    `<span class="tag-chip">${t}<button type="button" data-idx="${i}">×</button></span>`
  ).join('');
  preview.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      currentTags.splice(parseInt(btn.dataset.idx), 1);
      renderTagsPreview();
    });
  });
}

// ── ADD/EDIT POST MODAL ──
document.getElementById('btn-add').addEventListener('click', () => openPostModal());
document.getElementById('close-post').addEventListener('click', closePostModal);

function openPostModal(post = null) {
  editingPostId = post ? post.id : null;
  document.getElementById('modal-post-title').textContent = post ? 'Editar jogo' : 'Adicionar jogo';
  document.getElementById('do-post').textContent = post ? 'Salvar alterações' : 'Publicar';

  document.getElementById('post-title').value = post?.title || '';
  document.getElementById('post-url').value = post?.url || '';
  document.getElementById('post-desc').value = post?.description || '';
  document.getElementById('post-long-desc').value = post?.longDescription || '';
  document.getElementById('thumb-preview').innerHTML = post?.thumbnail
    ? `<img src="${post.thumbnail}"/>`
    : '';
  document.getElementById('upload-text').textContent = '📎 Adicionar thumbnail';
  document.getElementById('screens-preview').innerHTML = '';
  document.getElementById('upload-screens-text').textContent = '🖼️ Adicionar screenshots';
  document.getElementById('post-err').textContent = '';

  // Tags
  currentTags = post?.tags ? [...post.tags] : [];
  initTagInput();

  // Extra links
  const linksContainer = document.getElementById('extra-links');
  linksContainer.innerHTML = '';
  const linksToShow = post?.links?.length ? post.links : [{ label: '', url: '' }];
  linksToShow.forEach(l => addLinkRow(l.label || '', l.url || ''));

  document.getElementById('modal-post').classList.remove('hidden');
}

function closePostModal() {
  document.getElementById('modal-post').classList.add('hidden');
  editingPostId = null;
}

function openEditPost(id) {
  const post = posts.find(p => p.id === id);
  if (post) openPostModal(post);
}

function addLinkRow(label = '', url = '') {
  const container = document.getElementById('extra-links');
  const row = document.createElement('div');
  row.className = 'extra-link-row';
  row.innerHTML = `
    <input type="text" class="link-label" placeholder="Label (ex: itch.io)" value="${label}"/>
    <input type="url" class="link-url" placeholder="URL" value="${url}"/>
    <button class="btn-remove-link" type="button">×</button>
  `;
  row.querySelector('.btn-remove-link').addEventListener('click', () => row.remove());
  container.appendChild(row);
}

document.getElementById('btn-add-link').addEventListener('click', () => addLinkRow());

document.getElementById('post-thumb').addEventListener('change', function () {
  const file = this.files[0];
  if (!file) return;
  document.getElementById('upload-text').textContent = '✅ ' + file.name;
  const preview = document.getElementById('thumb-preview');
  const reader = new FileReader();
  reader.onload = e => { preview.innerHTML = `<img src="${e.target.result}"/>`; };
  reader.readAsDataURL(file);
});

document.getElementById('post-screens').addEventListener('change', function () {
  const files = Array.from(this.files);
  if (!files.length) return;
  document.getElementById('upload-screens-text').textContent = `✅ ${files.length} imagem(s)`;
  const preview = document.getElementById('screens-preview');
  preview.innerHTML = '';
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = document.createElement('img');
      img.src = e.target.result;
      preview.appendChild(img);
    };
    reader.readAsDataURL(file);
  });
});

document.getElementById('do-post').addEventListener('click', async () => {
  const title = document.getElementById('post-title').value.trim();
  const url = document.getElementById('post-url').value.trim();
  const description = document.getElementById('post-desc').value.trim();
  const longDescription = document.getElementById('post-long-desc').value.trim();
  const thumb = document.getElementById('post-thumb').files[0];
  const screens = document.getElementById('post-screens').files;
  const err = document.getElementById('post-err');

  if (!title) { err.textContent = 'Título obrigatório'; return; }

  // Collect extra links
  const links = [];
  document.querySelectorAll('.extra-link-row').forEach(row => {
    const label = row.querySelector('.link-label').value.trim();
    const linkUrl = row.querySelector('.link-url').value.trim();
    if (label && linkUrl) links.push({ label, url: linkUrl });
  });

  const form = new FormData();
  form.append('title', title);
  if (url) form.append('url', url);
  if (description) form.append('description', description);
  if (longDescription) form.append('longDescription', longDescription);
  form.append('tags', JSON.stringify(currentTags));
  form.append('links', JSON.stringify(links));
  if (thumb) form.append('thumbnail', thumb);
  if (screens.length) {
    Array.from(screens).forEach(s => form.append('screenshots', s));
  }

  const endpoint = editingPostId ? `/api/posts/${editingPostId}` : '/api/posts';
  const method = editingPostId ? 'PUT' : 'POST';

  const r = await fetch(endpoint, { method, body: form }).then(r => r.json());
  if (r.error) { err.textContent = r.error; return; }

  closePostModal();
});

async function deletePost(e) {
  const id = e.target.dataset.id;
  if (!confirm('Remover este post?')) return;
  await fetch('/api/posts/' + id, { method: 'DELETE' });
}

// ── STATS ──
document.getElementById('btn-stats').addEventListener('click', async () => {
  const stats = await fetch('/api/stats').then(r => r.json());
  document.getElementById('stats-content').innerHTML = `
    <div class="stat-card"><div class="stat-num">${stats.totalPosts}</div><div class="stat-label">Jogos</div></div>
    <div class="stat-card"><div class="stat-num">${stats.totalUsers}</div><div class="stat-label">Usuários</div></div>
    <div class="stat-card"><div class="stat-num">${stats.totalClicks}</div><div class="stat-label">Cliques</div></div>
    <div class="stat-card"><div class="stat-num">${stats.totalComments}</div><div class="stat-label">Comentários</div></div>
    <div class="stat-card"><div class="stat-num">${stats.totalReactions}</div><div class="stat-label">Reações</div></div>
    ${stats.topPost ? `<div class="stat-card stat-card-wide"><div class="stat-label">🏆 Post mais visitado</div><div class="stat-top">${stats.topPost.title} — ${stats.topPost.clicks} cliques</div></div>` : ''}
  `;
  document.getElementById('modal-stats').classList.remove('hidden');
});

document.getElementById('close-stats').addEventListener('click', () => {
  document.getElementById('modal-stats').classList.add('hidden');
});

// ── HERO ──
async function fetchHero() {
  const r = await fetch('/api/hero').then(r => r.json());
  applyHero(r.heroImage);
}

function applyHero(url) {
  const heroBg = document.getElementById('hero-bg');
  if (url) {
    heroBg.style.backgroundImage = `url('${url}')`;
    heroBg.classList.add('has-image');
  } else {
    heroBg.style.backgroundImage = '';
    heroBg.classList.remove('has-image');
  }
}

document.getElementById('btn-hero-edit').addEventListener('click', () => {
  document.getElementById('modal-hero').classList.remove('hidden');
});
document.getElementById('close-hero').addEventListener('click', () => {
  document.getElementById('modal-hero').classList.add('hidden');
});

document.getElementById('hero-img-input').addEventListener('change', function () {
  const file = this.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('hero-preview').innerHTML = `<img src="${e.target.result}" style="width:100%;border-radius:10px;margin-top:8px;"/>`;
  };
  reader.readAsDataURL(file);
});

document.getElementById('do-hero-save').addEventListener('click', async () => {
  const file = document.getElementById('hero-img-input').files[0];
  if (!file) return;
  const form = new FormData();
  form.append('heroImage', file);
  const r = await fetch('/api/hero', { method: 'POST', body: form }).then(r => r.json());
  applyHero(r.heroImage);
  document.getElementById('modal-hero').classList.add('hidden');
});

document.getElementById('do-hero-remove').addEventListener('click', async () => {
  if (!confirm('Remover o banner?')) return;
  await fetch('/api/hero', { method: 'DELETE' });
  applyHero(null);
  document.getElementById('modal-hero').classList.add('hidden');
});

// ── SOCKET EVENTS ──
socket.on('post:added', post => {
  if (!posts.find(p => p.id === post.id)) {
    posts.push(post);
    renderTagFilters();
    renderPosts();
  }
});
socket.on('post:updated', updatedPost => {
  const idx = posts.findIndex(p => p.id === updatedPost.id);
  if (idx !== -1) posts[idx] = updatedPost;
  else posts.push(updatedPost);
  renderTagFilters();
  renderPosts();
});
socket.on('post:deleted', ({ id }) => {
  posts = posts.filter(p => p.id !== id);
  renderTagFilters();
  renderPosts();
});
socket.on('post:reordered', order => {
  posts.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  renderPosts();
});
socket.on('post:reacted', ({ id, reactions }) => {
  const post = posts.find(p => p.id === id);
  if (post) post.reactions = reactions;
});
socket.on('post:click', ({ id, clicks }) => {
  const post = posts.find(p => p.id === id);
  if (post) post.clicks = clicks;
});
socket.on('post:comment', ({ postId, comment }) => {
  const post = posts.find(p => p.id === postId);
  if (post) {
    if (!post.comments) post.comments = [];
    if (!post.comments.find(c => c.id === comment.id)) post.comments.push(comment);
    const list = document.getElementById(`comments-list-${postId}`);
    if (list) {
      list.innerHTML = renderCommentsList(post);
      bindCommentDeletes(post);
    }
  }
});
socket.on('post:commentDeleted', ({ postId, commentId }) => {
  const post = posts.find(p => p.id === postId);
  if (post) post.comments = post.comments.filter(c => c.id !== commentId);
});
socket.on('hero:updated', ({ heroImage }) => applyHero(heroImage));

// Close modals on backdrop click
document.querySelectorAll('.modal').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) m.classList.add('hidden'); });
});