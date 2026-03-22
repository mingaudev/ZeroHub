/* ═══════════════════════════════════════════════════
   COMMUNITY.JS — NODE ZERO mini-Discord
   Depende de: socket (io()), currentUser (App.js),
   openLightbox(), escapeHtml(), EMOJIS[],
   getEditorContent(), setEditorContent()
   ═══════════════════════════════════════════════════ */

'use strict';

let communityOpen = false;
let communityThreads = [];
let activeThreadId = null;
let dcReplyPastedImages = [];
let dcEmojiTarget = null;

const AV_COLORS = ['av-blue','av-orange','av-green','av-yellow','av-pink','av-teal'];
function avatarColor(username) {
  let h = 0;
  for (let i = 0; i < username.length; i++) h = (h * 31 + username.charCodeAt(i)) & 0xffffffff;
  return AV_COLORS[Math.abs(h) % AV_COLORS.length];
}
function avatarLetter(u) { return (u || '?')[0].toUpperCase(); }

function timeAgo(d) {
  const m = Math.floor((Date.now() - new Date(d)) / 60000);
  if (m < 1) return 'agora';
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h';
  const dy = Math.floor(h / 24);
  if (dy < 7) return dy + 'd';
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function fmtReactions(reactions, voter) {
  return Object.entries(reactions || {}).map(([emoji, voters]) => {
    const count = Object.keys(voters).length;
    const mine = voter && voters[voter];
    return `<button class="dc-reaction${mine ? ' mine' : ''}" data-emoji="${emoji}">${emoji} <span>${count}</span></button>`;
  }).join('');
}

function renderMessageBody(body) {
  if (!body) return '';
  return escapeHtml(body).replace(
    /\[img:(\/uploads\/[^\]]+)\]/g,
    (_, url) => `<img src="${url}" style="max-width:280px;max-height:200px;border-radius:8px;margin:4px 0;display:block;cursor:pointer;object-fit:contain;border:1px solid #252d3d;" onclick="openLightbox('${url}')">`
  );
}

// ── OPEN / CLOSE ──
document.getElementById('community-fab').addEventListener('click', openCommunity);
document.getElementById('community-close').addEventListener('click', closeCommunity);
document.getElementById('community-overlay').addEventListener('click', closeCommunity);

function openCommunity() {
  communityOpen = true;
  document.getElementById('community-panel').classList.add('panel-open');
  document.getElementById('community-overlay').classList.add('active');
  document.getElementById('community-unread').classList.add('hidden');
  document.getElementById('community-unread').textContent = '0';
  updateSidebarUser();
  loadThreads();
}

function closeCommunity() {
  communityOpen = false;
  document.getElementById('community-panel').classList.remove('panel-open');
  document.getElementById('community-overlay').classList.remove('active');
}

// ── SIDEBAR USER ──
function updateSidebarUser() {
  const avatar = document.getElementById('dc-sidebar-avatar');
  const name   = document.getElementById('dc-sidebar-username');
  const status = document.getElementById('dc-sidebar-status');
  const loginB = document.getElementById('dc-sidebar-login-btn');
  if (currentUser) {
    avatar.textContent = avatarLetter(currentUser.username);
    avatar.className = 'dc-user-avatar ' + avatarColor(currentUser.username);
    name.textContent = currentUser.username;
    status.textContent = currentUser.username === 'Mingau' ? '👑 Admin' : 'Online';
    loginB.classList.add('hidden');
  } else {
    avatar.textContent = '?'; avatar.className = 'dc-user-avatar av-blue';
    name.textContent = 'Visitante'; status.textContent = 'Não logado';
    loginB.classList.remove('hidden');
  }
}
document.getElementById('dc-sidebar-login-btn').addEventListener('click', () => {
  document.getElementById('modal-auth').classList.remove('hidden');
});

// ── LOAD ──
async function loadThreads() {
  communityThreads = await fetch('/api/community').then(r => r.json());
  renderChannelList();
  if (activeThreadId) renderThreadDetail(activeThreadId);
  else showThreadList();
}

// ── CHANNEL LIST ──
function renderChannelList() {
  const list = document.getElementById('dc-channel-list');
  const pinned = communityThreads.filter(t => t.pinned);

  let html = `
    <div class="dc-channel-item ${activeThreadId === null ? 'active' : ''}" data-ch="geral">
      <span class="dc-channel-icon">#</span>
      <span class="dc-channel-name">geral</span>
    </div>`;

  if (pinned.length) {
    html += `<div style="padding:14px 8px 2px;"><div class="dc-section-label">📌 Fixados</div></div>`;
    pinned.forEach(t => {
      html += `<div class="dc-channel-item ${activeThreadId === t.id ? 'active' : ''}" data-thread-id="${t.id}">
        <span class="dc-channel-icon">📌</span>
        <span class="dc-channel-name">${escapeHtml(t.title)}</span>
        ${(t.replies||[]).length ? `<span class="dc-channel-badge">${(t.replies||[]).length}</span>` : ''}
      </div>`;
    });
  }

  list.innerHTML = html;
  list.querySelectorAll('.dc-channel-item').forEach(el => {
    el.addEventListener('click', () => {
      const tid = el.dataset.threadId ? parseInt(el.dataset.threadId) : null;
      if (tid) openThread(tid);
      else { activeThreadId = null; renderChannelList(); showThreadList(); }
    });
  });
}

// ── THREAD LIST ──
function showThreadList() {
  document.getElementById('dc-thread-list-view').style.display = 'flex';
  document.getElementById('dc-thread-list-view').style.flexDirection = 'column';
  document.getElementById('dc-thread-detail-view').style.display = 'none';
  document.getElementById('dc-active-channel-name').textContent = 'geral';
  document.getElementById('dc-active-channel-desc').textContent = communityThreads.length + ' threads';
  renderThreadList();
}

function renderThreadList() {
  const view = document.getElementById('dc-thread-list-view');
  if (!communityThreads.length) {
    view.innerHTML = `<div class="dc-empty"><div class="dc-empty-icon">💬</div><div class="dc-empty-text">Nenhuma thread ainda.<br>Seja o primeiro a postar!</div></div>`;
    return;
  }
  const voter = currentUser?.username;
  const isMingau = currentUser?.username === 'Mingau';

  view.innerHTML = communityThreads.map(t => {
    const replyCount = (t.replies || []).length;
    const reactHtml = fmtReactions(t.reactions, voter);
    const imgs = (t.images || []).slice(0, 3).map(img =>
      `<img src="${img}" class="dc-thread-row-img" onclick="event.stopPropagation();openLightbox('${img}')">`
    ).join('');
    const canAct = isMingau || currentUser?.username === t.author;
    return `
      <div class="dc-thread-row${t.pinned ? ' pinned-thread' : ''}" data-id="${t.id}">
        <div class="dc-thread-avatar ${avatarColor(t.author)}">${avatarLetter(t.author)}</div>
        <div class="dc-thread-body">
          <div class="dc-thread-row-header">
            <span class="dc-thread-row-author">${escapeHtml(t.author)}</span>
            <span class="dc-thread-row-time">${timeAgo(t.created_at)}</span>
            ${t.pinned ? '<span class="dc-thread-row-pin">📌</span>' : ''}
            <div class="dc-thread-row-actions">
              ${isMingau ? `<button class="dc-thread-action-btn" data-pin="${t.id}" title="${t.pinned?'Desafixar':'Fixar'}">${t.pinned?'📍':'📌'}</button>` : ''}
              ${canAct ? `<button class="dc-thread-action-btn danger" data-del="${t.id}">🗑</button>` : ''}
            </div>
          </div>
          <div class="dc-thread-row-title">${escapeHtml(t.title)}</div>
          ${t.body ? `<div class="dc-thread-row-preview">${escapeHtml(t.body)}</div>` : ''}
          ${imgs ? `<div class="dc-thread-row-imgs">${imgs}</div>` : ''}
          <div class="dc-thread-row-footer">
            <span class="dc-thread-row-meta">💬 ${replyCount}</span>
            <div class="dc-thread-row-reactions">${reactHtml}</div>
          </div>
        </div>
      </div>`;
  }).join('');

  view.querySelectorAll('.dc-thread-row').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.dataset.del || e.target.dataset.pin || e.target.classList.contains('dc-thread-row-img')) return;
      openThread(parseInt(row.dataset.id));
    });
  });
  view.querySelectorAll('[data-pin]').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      await fetch('/api/community/' + btn.dataset.pin + '/pin', { method: 'PUT' });
      await loadThreads();
    });
  });
  view.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('Remover esta thread?')) return;
      await fetch('/api/community/' + btn.dataset.del, { method: 'DELETE' });
      communityThreads = communityThreads.filter(t => t.id !== parseInt(btn.dataset.del));
      renderChannelList(); renderThreadList();
    });
  });
  view.querySelectorAll('.dc-reaction').forEach(chip => {
    chip.addEventListener('click', async e => {
      e.stopPropagation();
      if (!currentUser) { document.getElementById('modal-auth').classList.remove('hidden'); return; }
      const tid = parseInt(chip.closest('.dc-thread-row').dataset.id);
      await sendDcReaction({ type: 'thread', threadId: tid }, chip.dataset.emoji);
    });
  });
}

// ── OPEN THREAD ──
async function openThread(id) {
  activeThreadId = id;
  const thread = communityThreads.find(t => t.id === id);
  document.getElementById('dc-active-channel-name').textContent = thread?.title || '';
  document.getElementById('dc-active-channel-desc').textContent = '';
  document.getElementById('dc-thread-list-view').style.display = 'none';
  const dv = document.getElementById('dc-thread-detail-view');
  dv.style.display = 'flex';
  dv.style.flexDirection = 'column';
  renderChannelList();
  await renderThreadDetail(id);
  setupReplyInput(id);
}

async function renderThreadDetail(id) {
  const thread = communityThreads.find(t => t.id === id);
  if (!thread) return;
  const replies = await fetch('/api/community/' + id + '/replies').then(r => r.json());
  const voter = currentUser?.username;
  const isMingau = currentUser?.username === 'Mingau';

  // OP
  const opReacts = fmtReactions(thread.reactions, voter);
  const opImgs = (thread.images || []).map(img =>
    `<img src="${img}" class="dc-op-image" onclick="openLightbox('${img}')">`
  ).join('');
  document.getElementById('dc-op-area').innerHTML = `
    <div class="dc-op-header">
      <div class="dc-op-avatar ${avatarColor(thread.author)}">${avatarLetter(thread.author)}</div>
      <div style="flex:1;">
        <span class="dc-op-author">${escapeHtml(thread.author)}</span>
        ${thread.pinned ? ' <span style="color:#f9c623;font-size:0.72rem;">📌</span>' : ''}
        <div class="dc-op-time">${new Date(thread.created_at).toLocaleString('pt-BR',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</div>
      </div>
      ${(isMingau || currentUser?.username === thread.author)
        ? `<button class="dc-thread-action-btn danger" onclick="deleteDcThread(${id})">🗑</button>` : ''}
    </div>
    <div class="dc-op-title">${escapeHtml(thread.title)}</div>
    ${thread.body ? `<div class="dc-op-body">${renderMessageBody(thread.body)}</div>` : ''}
    ${opImgs ? `<div class="dc-op-images">${opImgs}</div>` : ''}
    <div class="dc-op-footer">
      ${opReacts}
      ${currentUser ? `<button class="dc-add-reaction" data-react-thread="${id}">＋ 😀</button>` : ''}
    </div>`;

  document.getElementById('dc-op-area').querySelectorAll('.dc-reaction').forEach(chip => {
    chip.addEventListener('click', async () => {
      if (!currentUser) return;
      await sendDcReaction({ type: 'thread', threadId: id }, chip.dataset.emoji);
      await renderThreadDetail(id);
    });
  });
  document.getElementById('dc-op-area').querySelectorAll('[data-react-thread]').forEach(btn => {
    btn.addEventListener('click', e => openDcEmojiPicker(e.target, { type: 'thread', threadId: id }));
  });

  // REPLIES
  const msgArea = document.getElementById('dc-messages-area');
  if (!replies.length) {
    msgArea.innerHTML = `<div class="dc-empty" style="padding:32px;"><div class="dc-empty-icon" style="font-size:2rem;">👀</div><div class="dc-empty-text">Seja o primeiro a responder!</div></div>`;
  } else {
    let prevAuthor = null, prevTime = null;
    msgArea.innerHTML = replies.map(reply => {
      const grouped = prevAuthor === reply.username && (new Date(reply.created_at) - new Date(prevTime)) < 300000;
      prevAuthor = reply.username; prevTime = reply.created_at;
      const rReacts = fmtReactions(reply.reactions, voter);
      const rImgs = (reply.images || []).map(img =>
        `<img src="${img}" class="dc-msg-image" onclick="openLightbox('${img}')">`
      ).join('');
      const canDel = isMingau || currentUser?.username === reply.username;
      return `
        <div class="dc-msg${grouped ? ' grouped' : ''}" data-reply-id="${reply.id}">
          <div class="dc-msg-avatar ${avatarColor(reply.username)}">${avatarLetter(reply.username)}</div>
          <div class="dc-msg-right">
            <div class="dc-msg-header">
              <span class="dc-msg-author${reply.username==='Mingau'?' is-mingau':''}">${escapeHtml(reply.username)}</span>
              <span class="dc-msg-time">${timeAgo(reply.created_at)}</span>
            </div>
            <div class="dc-msg-text">${renderMessageBody(reply.text)}</div>
            ${rImgs ? `<div class="dc-msg-images">${rImgs}</div>` : ''}
            ${(rReacts || currentUser) ? `<div class="dc-msg-reactions">${rReacts}${currentUser?`<button class="dc-add-reaction" data-react-reply="${reply.id}">＋ 😀</button>`:''}</div>` : ''}
          </div>
          <div class="dc-msg-actions">
            ${currentUser?`<button class="dc-msg-action" data-react-btn="${reply.id}" title="Reagir">😀</button>`:''}
            ${canDel?`<button class="dc-msg-action danger" data-del-reply="${reply.id}" title="Deletar">🗑</button>`:''}
          </div>
        </div>`;
    }).join('');

    msgArea.querySelectorAll('.dc-reaction').forEach(chip => {
      chip.addEventListener('click', async () => {
        if (!currentUser) return;
        const replyId = parseInt(chip.closest('[data-reply-id]').dataset.replyId);
        await sendDcReaction({ type: 'reply', threadId: id, replyId }, chip.dataset.emoji);
        await renderThreadDetail(id);
      });
    });
    msgArea.querySelectorAll('[data-react-reply],[data-react-btn]').forEach(btn => {
      btn.addEventListener('click', e => {
        const replyId = parseInt(btn.dataset.reactReply || btn.dataset.reactBtn);
        openDcEmojiPicker(e.target, { type: 'reply', threadId: id, replyId });
      });
    });
    msgArea.querySelectorAll('[data-del-reply]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Deletar mensagem?')) return;
        await fetch('/api/community/' + id + '/replies/' + btn.dataset.delReply, { method: 'DELETE' });
        await renderThreadDetail(id);
      });
    });
    msgArea.scrollTop = msgArea.scrollHeight;
  }
}

// ── REPLY INPUT ──
function setupReplyInput(threadId) {
  dcReplyPastedImages = [];
  renderDcPastePreviews();
  const input = document.getElementById('dc-reply-input');
  const sendBtn = document.getElementById('dc-send-btn');
  const prompt = document.getElementById('dc-login-prompt');

  if (currentUser) {
    input.disabled = false; sendBtn.disabled = false; prompt.classList.add('hidden');
    const t = communityThreads.find(t => t.id === threadId);
    input.placeholder = `Responder em #${(t?.title||'thread').slice(0,24)}... (Ctrl+V = imagem)`;
  } else {
    input.disabled = true; sendBtn.disabled = true; prompt.classList.remove('hidden');
  }

  input.oninput = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 120) + 'px'; };
  input.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendDcReply(threadId); } };
  input.onpaste = async e => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        if (!currentUser) { document.getElementById('modal-auth').classList.remove('hidden'); return; }
        const reader = new FileReader();
        reader.onload = async ev => {
          const r = await fetch('/api/community/paste', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ base64: ev.target.result.split(',')[1], mimeType: item.type })
          }).then(r => r.json());
          if (r.url) { dcReplyPastedImages.push(r.url); renderDcPastePreviews(); }
        };
        reader.readAsDataURL(item.getAsFile());
        return;
      }
    }
  };
  sendBtn.onclick = () => sendDcReply(threadId);
}

function renderDcPastePreviews() {
  const wrap = document.getElementById('dc-paste-previews');
  wrap.innerHTML = dcReplyPastedImages.map((url, i) => `
    <div class="dc-paste-thumb-wrap">
      <img src="${url}" class="dc-paste-thumb"/>
      <button class="dc-paste-remove" data-idx="${i}">×</button>
    </div>`).join('');
  wrap.querySelectorAll('.dc-paste-remove').forEach(btn => {
    btn.addEventListener('click', () => { dcReplyPastedImages.splice(parseInt(btn.dataset.idx), 1); renderDcPastePreviews(); });
  });
}

async function sendDcReply(threadId) {
  const input = document.getElementById('dc-reply-input');
  const text = input.value.trim();
  if (!text && !dcReplyPastedImages.length) return;
  let finalText = text;
  if (dcReplyPastedImages.length) finalText = (text ? text + '\n' : '') + dcReplyPastedImages.map(u => `[img:${u}]`).join('\n');
  const form = new FormData();
  form.append('text', finalText || ' ');
  const r = await fetch('/api/community/' + threadId + '/replies', { method: 'POST', body: form }).then(r => r.json());
  if (r.error) { alert(r.error); return; }
  input.value = ''; input.style.height = 'auto';
  dcReplyPastedImages = []; renderDcPastePreviews();
  const t = communityThreads.find(t => t.id === threadId);
  if (t) { if (!t.replies) t.replies = []; t.replies.push(r); }
  await renderThreadDetail(threadId);
}

async function deleteDcThread(id) {
  if (!confirm('Remover esta thread?')) return;
  await fetch('/api/community/' + id, { method: 'DELETE' });
  communityThreads = communityThreads.filter(t => t.id !== id);
  activeThreadId = null;
  renderChannelList(); showThreadList();
}

// ── NEW THREAD ──
['dc-btn-new-thread','dc-btn-new-thread-header'].forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('click', () => {
    if (!currentUser) { document.getElementById('modal-auth').classList.remove('hidden'); return; }
    document.getElementById('thread-title').value = '';
    if (typeof setEditorContent === 'function') setEditorContent(document.getElementById('thread-body-editor'), '');
    document.getElementById('thread-images').value = '';
    document.getElementById('thread-img-preview').innerHTML = '';
    document.getElementById('thread-img-text').textContent = '🖼️ Adicionar imagens';
    document.getElementById('thread-err').textContent = '';
    document.getElementById('modal-thread').classList.remove('hidden');
  });
});

document.getElementById('close-thread').addEventListener('click', () => document.getElementById('modal-thread').classList.add('hidden'));

document.getElementById('thread-images').addEventListener('change', function () {
  const files = Array.from(this.files);
  document.getElementById('thread-img-text').textContent = `🖼️ ${files.length} imagem(ns)`;
  Promise.all(files.map(f => new Promise(res => { const r = new FileReader(); r.onload = e => res(e.target.result); r.readAsDataURL(f); }))).then(srcs => {
    document.getElementById('thread-img-preview').innerHTML = srcs.map(s =>
      `<img src="${s}" style="width:60px;height:45px;object-fit:cover;border-radius:6px;border:1px solid #252d3d;">`
    ).join('');
  });
});

document.getElementById('do-thread').addEventListener('click', async () => {
  const title = document.getElementById('thread-title').value.trim();
  const body = typeof getEditorContent === 'function'
    ? getEditorContent(document.getElementById('thread-body-editor'))
    : document.getElementById('thread-body-editor').innerText;
  const images = document.getElementById('thread-images').files;
  const err = document.getElementById('thread-err');
  if (!title) { err.textContent = 'Título obrigatório'; return; }
  const form = new FormData();
  form.append('title', title); form.append('body', body);
  Array.from(images).forEach(f => form.append('images', f));
  const r = await fetch('/api/community', { method: 'POST', body: form }).then(r => r.json());
  if (r.error) { err.textContent = r.error; return; }
  document.getElementById('modal-thread').classList.add('hidden');
  communityThreads.unshift(r);
  renderChannelList();
  openThread(r.id);
});

// ── EMOJI PICKER ──
const DC_EMOJIS = ['👍','👎','❤️','🔥','😂','😮','😢','👏','🎮','🚀','💯','⭐','🤯','😍','🥳','💀','🤔','😎','🙌','✨','🎉','💪','😤','🤩','👀','🫡','💥','🏆','🎯','🧠'];
const dcPicker = document.getElementById('community-emoji-picker');
DC_EMOJIS.forEach(e => {
  const btn = document.createElement('button');
  btn.className = 'emoji-btn'; btn.textContent = e;
  btn.addEventListener('click', async () => {
    dcPicker.classList.remove('visible');
    if (dcEmojiTarget) await sendDcReaction(dcEmojiTarget, e);
    else {
      // Insert into reply input
      const inp = document.getElementById('dc-reply-input');
      const pos = inp.selectionStart;
      inp.value = inp.value.slice(0, pos) + e + inp.value.slice(pos);
      inp.focus(); inp.setSelectionRange(pos + e.length, pos + e.length);
    }
  });
  dcPicker.appendChild(btn);
});

document.getElementById('dc-emoji-trigger').addEventListener('click', e => {
  dcEmojiTarget = null;
  openDcEmojiPicker(e.target, null);
});

function openDcEmojiPicker(anchor, target) {
  dcEmojiTarget = target;
  dcPicker.classList.add('visible');
  requestAnimationFrame(() => {
    const rect = anchor.getBoundingClientRect();
    const ph = dcPicker.offsetHeight || 200;
    const top = rect.top - ph - 8 > 0 ? rect.top - ph - 8 : rect.bottom + 8;
    dcPicker.style.top = top + 'px';
    dcPicker.style.left = Math.max(4, Math.min(rect.left, window.innerWidth - 260)) + 'px';
  });
}

document.addEventListener('click', e => {
  if (!dcPicker.contains(e.target) &&
      !e.target.classList.contains('dc-add-reaction') &&
      e.target.id !== 'dc-emoji-trigger' &&
      !e.target.dataset.reactReply && !e.target.dataset.reactBtn && !e.target.dataset.reactThread) {
    dcPicker.classList.remove('visible');
  }
});

async function sendDcReaction(target, emoji) {
  let url;
  if (target.type === 'thread') url = '/api/community/' + target.threadId + '/react';
  else url = '/api/community/' + target.threadId + '/replies/' + target.replyId + '/react';
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emoji }) }).then(r => r.json());
  if (r.error) return;
  if (communityOpen) {
    if (activeThreadId === target.threadId) await renderThreadDetail(target.threadId);
    else { await loadThreads(); renderThreadList(); }
  }
}

// ── SOCKET ──
socket.on('community:thread:added', thread => {
  if (!communityOpen) { const b = document.getElementById('community-unread'); b.classList.remove('hidden'); b.textContent = parseInt(b.textContent||'0')+1; }
  if (!communityThreads.find(t => t.id === thread.id)) { communityThreads.unshift(thread); if (communityOpen && !activeThreadId) { renderChannelList(); renderThreadList(); } else if (communityOpen) renderChannelList(); }
});
socket.on('community:thread:deleted', ({ id }) => {
  communityThreads = communityThreads.filter(t => t.id !== id);
  if (activeThreadId === id) { activeThreadId = null; showThreadList(); }
  else if (communityOpen) { renderChannelList(); if (!activeThreadId) renderThreadList(); }
});
socket.on('community:thread:pinned', ({ id, pinned }) => {
  const t = communityThreads.find(t => t.id === id);
  if (t) { t.pinned = pinned; if (communityOpen) { renderChannelList(); if (!activeThreadId) renderThreadList(); } }
});
socket.on('community:reacted', ({ id, reactions }) => {
  const t = communityThreads.find(t => t.id === id);
  if (t) t.reactions = reactions;
  if (communityOpen && !activeThreadId) renderThreadList();
  else if (communityOpen && activeThreadId === id) renderThreadDetail(id);
});
socket.on('community:reply:added', ({ threadId, reply }) => {
  const t = communityThreads.find(t => t.id === threadId);
  if (t) { if (!t.replies) t.replies = []; if (!t.replies.find(r => r.id === reply.id)) t.replies.push(reply); }
  if (!communityOpen) { const b = document.getElementById('community-unread'); b.classList.remove('hidden'); b.textContent = parseInt(b.textContent||'0')+1; }
  else if (activeThreadId === threadId) renderThreadDetail(threadId);
  else { renderChannelList(); renderThreadList(); }
});
socket.on('community:reply:deleted', ({ threadId, replyId }) => {
  const t = communityThreads.find(t => t.id === threadId);
  if (t) t.replies = (t.replies||[]).filter(r => r.id !== replyId);
  if (communityOpen && activeThreadId === threadId) renderThreadDetail(threadId);
});
socket.on('community:reply:reacted', ({ threadId }) => {
  if (communityOpen && activeThreadId === threadId) renderThreadDetail(threadId);
});

window.deleteDcThread = deleteDcThread;