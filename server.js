const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const DATA_FILE = './data.json';

function readData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    const base = { users: [], posts: [], community: [] };
    fs.writeFileSync(DATA_FILE, JSON.stringify(base, null, 2));
    return base;
  }
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

const data = readData();
if (!data.users.find(u => u.username === 'Mingau')) {
  data.users.push({ username: 'Mingau', password: bcrypt.hashSync('studiodegames12', 10) });
  writeData(data);
}
if (!data.community) { data.community = []; writeData(data); }

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = './public/uploads';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + Math.random().toString(36).slice(2) + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

const uploadBase64 = (base64Data, ext) => {
  const dir = './public/uploads';
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filename = Date.now() + '-' + Math.random().toString(36).slice(2) + '.' + ext;
  fs.writeFileSync(path.join(dir, filename), Buffer.from(base64Data, 'base64'));
  return '/uploads/' + filename;
};

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
app.use(session({
  secret: 'nodezero_secret_2025',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

const isMingau = (req, res, next) => {
  if (req.session.user && req.session.user.username === 'Mingau') return next();
  res.status(403).json({ error: 'Sem permissão' });
};
const isLoggedIn = (req, res, next) => {
  if (req.session.user) return next();
  res.status(401).json({ error: 'Faça login primeiro' });
};

// ── AUTH ──
app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ error: 'Preencha todos os campos' });
  if (username.trim().length < 2) return res.json({ error: 'Nome muito curto' });
  const d = readData();
  if (d.users.find(u => u.username.toLowerCase() === username.trim().toLowerCase()))
    return res.json({ error: 'Nome já em uso' });
  d.users.push({ username: username.trim(), password: bcrypt.hashSync(password, 10) });
  writeData(d);
  req.session.user = { username: username.trim() };
  res.json({ ok: true, username: username.trim() });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const d = readData();
  const user = d.users.find(u => u.username === username);
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.json({ error: 'Usuário ou senha incorretos' });
  req.session.user = { username: user.username };
  res.json({ ok: true, username: user.username });
});

app.post('/api/logout', (req, res) => { req.session.destroy(() => {}); res.json({ ok: true }); });
app.get('/api/me', (req, res) => res.json({ user: req.session.user || null }));

// ── PASTE IMAGE UPLOAD ──
app.post('/api/upload/paste', isLoggedIn, (req, res) => {
  const { base64, mimeType } = req.body;
  if (!base64 || !mimeType) return res.status(400).json({ error: 'Dados inválidos' });
  const extMap = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
  const ext = extMap[mimeType] || 'png';
  try { const url = uploadBase64(base64, ext); res.json({ url }); }
  catch { res.status(500).json({ error: 'Erro ao salvar imagem' }); }
});

// ── POSTS ──
app.get('/api/posts', (req, res) => {
  const d = readData();
  res.json([...d.posts].sort((a, b) => (a.position ?? 999) - (b.position ?? 999) || a.id - b.id));
});

app.post('/api/posts', isMingau, upload.fields([
  { name: 'thumbnail', maxCount: 1 }, { name: 'screenshots', maxCount: 10 }
]), (req, res) => {
  const { title, url, description, longDescription, tags, embedUrl } = req.body;
  if (!title) return res.json({ error: 'Título obrigatório' });
  const d = readData();
  const maxPos = d.posts.length ? Math.max(...d.posts.map(p => p.position || 0)) : 0;
  const id = d.posts.length ? Math.max(...d.posts.map(p => p.id)) + 1 : 1;
  const thumbnail = req.files?.thumbnail?.[0] ? '/uploads/' + req.files.thumbnail[0].filename : null;
  const screenshots = req.files?.screenshots ? req.files.screenshots.map(f => '/uploads/' + f.filename) : [];
  let parsedTags = []; try { parsedTags = tags ? JSON.parse(tags) : []; } catch {}
  const post = {
    id, title, url: url || null, description: description || null,
    longDescription: longDescription || null, thumbnail, screenshots,
    tags: parsedTags, embedUrl: embedUrl || null,
    clicks: 0, likes: {}, reactions: {}, comments: [],
    position: maxPos + 1, created_at: new Date().toISOString()
  };
  d.posts.push(post);
  writeData(d);
  io.emit('post:added', post);
  res.json(post);
});

app.put('/api/posts/:id', isMingau, upload.fields([
  { name: 'thumbnail', maxCount: 1 }, { name: 'screenshots', maxCount: 10 }
]), (req, res) => {
  const d = readData();
  const id = parseInt(req.params.id, 10);
  const post = d.posts.find(p => p.id === id);
  if (!post) return res.status(404).json({ error: 'Post não encontrado' });
  const { title, url, description, longDescription, tags, embedUrl, keepScreenshots } = req.body;
  if (title) post.title = title;
  post.url = url || null; post.description = description || null;
  post.longDescription = longDescription || null; post.embedUrl = embedUrl || null;
  if (!post.reactions) post.reactions = {};
  try { post.tags = tags ? JSON.parse(tags) : []; } catch { post.tags = []; }
  if (req.files?.thumbnail?.[0]) {
    if (post.thumbnail) { const old = './public' + post.thumbnail; if (fs.existsSync(old)) fs.unlinkSync(old); }
    post.thumbnail = '/uploads/' + req.files.thumbnail[0].filename;
  }
  if (req.files?.screenshots?.length) {
    let keep = []; try { keep = keepScreenshots ? JSON.parse(keepScreenshots) : []; } catch {}
    (post.screenshots || []).forEach(s => { if (!keep.includes(s)) { const p = './public' + s; if (fs.existsSync(p)) fs.unlinkSync(p); } });
    post.screenshots = [...keep, ...req.files.screenshots.map(f => '/uploads/' + f.filename)];
  }
  writeData(d);
  io.emit('post:updated', post);
  res.json(post);
});

app.delete('/api/posts/:id', isMingau, (req, res) => {
  const d = readData();
  const id = parseInt(req.params.id, 10);
  const post = d.posts.find(p => p.id === id);
  if (!post) return res.status(404).json({ error: 'Post não encontrado' });
  if (post.thumbnail) { const f = './public' + post.thumbnail; if (fs.existsSync(f)) fs.unlinkSync(f); }
  (post.screenshots || []).forEach(s => { const p = './public' + s; if (fs.existsSync(p)) fs.unlinkSync(p); });
  d.posts = d.posts.filter(p => p.id !== id);
  writeData(d); io.emit('post:deleted', { id }); res.json({ ok: true });
});

app.put('/api/posts/reorder', isMingau, (req, res) => {
  const { order } = req.body; const d = readData();
  if (!Array.isArray(order)) return res.status(400).json({ error: 'Order inválido' });
  const map = new Map(d.posts.map(p => [p.id, p]));
  d.posts = order.map((id, idx) => { const p = map.get(id); if (p) { p.position = idx; return p; } return null; }).filter(Boolean);
  writeData(d); io.emit('post:reordered', order); res.json({ ok: true });
});

app.post('/api/posts/:id/click', (req, res) => {
  const d = readData(); const id = parseInt(req.params.id, 10);
  const post = d.posts.find(p => p.id === id);
  if (!post) return res.status(404).json({ error: 'Not found' });
  post.clicks = (post.clicks || 0) + 1; writeData(d);
  io.emit('post:clicked', { id, clicks: post.clicks }); res.json({ clicks: post.clicks });
});

app.post('/api/posts/:id/like', (req, res) => {
  const d = readData(); const id = parseInt(req.params.id, 10);
  const post = d.posts.find(p => p.id === id);
  if (!post) return res.status(404).json({ error: 'Not found' });
  const voter = req.session.user ? req.session.user.username : req.ip;
  if (!post.likes) post.likes = {};
  if (post.likes[voter]) delete post.likes[voter]; else post.likes[voter] = true;
  writeData(d);
  const count = Object.keys(post.likes).length;
  io.emit('post:liked', { id, count }); res.json({ count, liked: !!post.likes[voter] });
});

// ── EMOJI REACTIONS (posts) ──
app.post('/api/posts/:id/react', (req, res) => {
  const { emoji } = req.body;
  if (!emoji) return res.status(400).json({ error: 'Emoji obrigatório' });
  const voter = req.session.user ? req.session.user.username : req.ip;
  const d = readData(); const id = parseInt(req.params.id, 10);
  const post = d.posts.find(p => p.id === id);
  if (!post) return res.status(404).json({ error: 'Not found' });
  if (!post.reactions) post.reactions = {};
  let removedEmoji = null;
  for (const e of Object.keys(post.reactions)) {
    if (post.reactions[e][voter]) {
      removedEmoji = e;
      delete post.reactions[e][voter];
      if (!Object.keys(post.reactions[e]).length) delete post.reactions[e];
      break;
    }
  }
  if (removedEmoji !== emoji) {
    if (!post.reactions[emoji]) post.reactions[emoji] = {};
    post.reactions[emoji][voter] = true;
  }
  writeData(d);
  const summary = Object.fromEntries(Object.entries(post.reactions).map(([e, v]) => [e, Object.keys(v).length]));
  const myReaction = Object.entries(post.reactions).find(([, v]) => v[voter])?.[0] || null;
  io.emit('post:reacted', { id, reactions: summary });
  res.json({ reactions: summary, myReaction });
});

// ── COMMENTS ──
app.get('/api/posts/:id/comments', (req, res) => {
  const d = readData(); const id = parseInt(req.params.id, 10);
  const post = d.posts.find(p => p.id === id);
  if (!post) return res.status(404).json({ error: 'Not found' });
  res.json(post.comments || []);
});

app.post('/api/posts/:id/comments', isLoggedIn, (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.json({ error: 'Comentário vazio' });
  if (text.trim().length > 500) return res.json({ error: 'Comentário muito longo' });
  const d = readData(); const id = parseInt(req.params.id, 10);
  const post = d.posts.find(p => p.id === id);
  if (!post) return res.status(404).json({ error: 'Not found' });
  if (!post.comments) post.comments = [];
  const comment = { id: Date.now(), username: req.session.user.username, text: text.trim(), created_at: new Date().toISOString() };
  post.comments.push(comment); writeData(d);
  io.emit('comment:added', { postId: id, comment }); res.json(comment);
});

app.delete('/api/posts/:postId/comments/:commentId', isMingau, (req, res) => {
  const d = readData();
  const postId = parseInt(req.params.postId, 10); const commentId = parseInt(req.params.commentId, 10);
  const post = d.posts.find(p => p.id === postId);
  if (!post) return res.status(404).json({ error: 'Not found' });
  post.comments = (post.comments || []).filter(c => c.id !== commentId);
  writeData(d); io.emit('comment:deleted', { postId, commentId }); res.json({ ok: true });
});

// ── STATS ──
app.get('/api/stats', isMingau, (req, res) => {
  const d = readData();
  const totalClicks = d.posts.reduce((a, p) => a + (p.clicks || 0), 0);
  const totalLikes = d.posts.reduce((a, p) => a + Object.keys(p.likes || {}).length, 0);
  const totalComments = d.posts.reduce((a, p) => a + (p.comments || []).length, 0);
  const totalThreads = (d.community || []).length;
  const topPost = [...d.posts].sort((a, b) => (b.clicks || 0) - (a.clicks || 0))[0] || null;
  res.json({ totalPosts: d.posts.length, totalUsers: d.users.length, totalClicks, totalLikes, totalComments, totalThreads, topPost: topPost ? { id: topPost.id, title: topPost.title, clicks: topPost.clicks || 0 } : null });
});

// ── COMMUNITY ──
app.get('/api/community', (req, res) => {
  const d = readData();
  const threads = [...(d.community || [])].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return new Date(b.created_at) - new Date(a.created_at);
  });
  res.json(threads);
});

app.post('/api/community', isLoggedIn, upload.array('images', 6), (req, res) => {
  const { title, body } = req.body;
  if (!title?.trim()) return res.json({ error: 'Título obrigatório' });
  const d = readData();
  if (!d.community) d.community = [];
  const id = d.community.length ? Math.max(...d.community.map(t => t.id)) + 1 : 1;
  const images = (req.files || []).map(f => '/uploads/' + f.filename);
  const thread = { id, title: title.trim(), author: req.session.user.username, body: (body || '').trim(), images, reactions: {}, replies: [], pinned: false, created_at: new Date().toISOString() };
  d.community.push(thread); writeData(d);
  io.emit('community:thread:added', thread); res.json(thread);
});

app.post('/api/community/paste', isLoggedIn, (req, res) => {
  const { base64, mimeType } = req.body;
  if (!base64 || !mimeType) return res.status(400).json({ error: 'Dados inválidos' });
  const extMap = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
  try { res.json({ url: uploadBase64(base64, extMap[mimeType] || 'png') }); }
  catch { res.status(500).json({ error: 'Erro ao salvar imagem' }); }
});

app.delete('/api/community/:id', (req, res) => {
  const d = readData(); const id = parseInt(req.params.id, 10);
  const thread = d.community.find(t => t.id === id);
  if (!thread) return res.status(404).json({ error: 'Thread não encontrada' });
  const isMingauU = req.session.user?.username === 'Mingau';
  const isAuthor = req.session.user?.username === thread.author;
  if (!isMingauU && !isAuthor) return res.status(403).json({ error: 'Sem permissão' });
  (thread.images || []).forEach(img => { const p = './public' + img; if (fs.existsSync(p)) fs.unlinkSync(p); });
  d.community = d.community.filter(t => t.id !== id); writeData(d);
  io.emit('community:thread:deleted', { id }); res.json({ ok: true });
});

app.put('/api/community/:id/pin', isMingau, (req, res) => {
  const d = readData(); const id = parseInt(req.params.id, 10);
  const thread = d.community.find(t => t.id === id);
  if (!thread) return res.status(404).json({ error: 'Not found' });
  thread.pinned = !thread.pinned; writeData(d);
  io.emit('community:thread:pinned', { id, pinned: thread.pinned }); res.json({ pinned: thread.pinned });
});

app.post('/api/community/:id/react', isLoggedIn, (req, res) => {
  const { emoji } = req.body; if (!emoji) return res.status(400).json({ error: 'Emoji obrigatório' });
  const voter = req.session.user.username;
  const d = readData(); const id = parseInt(req.params.id, 10);
  const thread = d.community.find(t => t.id === id);
  if (!thread) return res.status(404).json({ error: 'Not found' });
  if (!thread.reactions) thread.reactions = {};
  let removedEmoji = null;
  for (const e of Object.keys(thread.reactions)) {
    if (thread.reactions[e][voter]) { removedEmoji = e; delete thread.reactions[e][voter]; if (!Object.keys(thread.reactions[e]).length) delete thread.reactions[e]; break; }
  }
  if (removedEmoji !== emoji) { if (!thread.reactions[emoji]) thread.reactions[emoji] = {}; thread.reactions[emoji][voter] = true; }
  writeData(d);
  const summary = Object.fromEntries(Object.entries(thread.reactions).map(([e, v]) => [e, Object.keys(v).length]));
  const myReaction = Object.entries(thread.reactions).find(([, v]) => v[voter])?.[0] || null;
  io.emit('community:reacted', { id, reactions: summary }); res.json({ reactions: summary, myReaction });
});

app.get('/api/community/:id/replies', (req, res) => {
  const d = readData(); const id = parseInt(req.params.id, 10);
  const thread = d.community.find(t => t.id === id);
  if (!thread) return res.status(404).json({ error: 'Not found' });
  res.json(thread.replies || []);
});

app.post('/api/community/:id/replies', isLoggedIn, upload.array('images', 4), (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.json({ error: 'Resposta vazia' });
  const d = readData(); const id = parseInt(req.params.id, 10);
  const thread = d.community.find(t => t.id === id);
  if (!thread) return res.status(404).json({ error: 'Not found' });
  if (!thread.replies) thread.replies = [];
  const images = (req.files || []).map(f => '/uploads/' + f.filename);
  const reply = { id: Date.now(), username: req.session.user.username, text: text.trim(), images, reactions: {}, created_at: new Date().toISOString() };
  thread.replies.push(reply); writeData(d);
  io.emit('community:reply:added', { threadId: id, reply }); res.json(reply);
});

app.delete('/api/community/:threadId/replies/:replyId', (req, res) => {
  const d = readData();
  const threadId = parseInt(req.params.threadId, 10); const replyId = parseInt(req.params.replyId, 10);
  const thread = d.community.find(t => t.id === threadId);
  if (!thread) return res.status(404).json({ error: 'Not found' });
  const reply = (thread.replies || []).find(r => r.id === replyId);
  if (!reply) return res.status(404).json({ error: 'Reply not found' });
  if (req.session.user?.username !== 'Mingau' && req.session.user?.username !== reply.username) return res.status(403).json({ error: 'Sem permissão' });
  thread.replies = thread.replies.filter(r => r.id !== replyId); writeData(d);
  io.emit('community:reply:deleted', { threadId, replyId }); res.json({ ok: true });
});

app.post('/api/community/:threadId/replies/:replyId/react', isLoggedIn, (req, res) => {
  const { emoji } = req.body; if (!emoji) return res.status(400).json({ error: 'Emoji obrigatório' });
  const voter = req.session.user.username;
  const d = readData();
  const threadId = parseInt(req.params.threadId, 10); const replyId = parseInt(req.params.replyId, 10);
  const thread = d.community.find(t => t.id === threadId);
  const reply = thread && (thread.replies || []).find(r => r.id === replyId);
  if (!reply) return res.status(404).json({ error: 'Not found' });
  if (!reply.reactions) reply.reactions = {};
  let removedEmoji = null;
  for (const e of Object.keys(reply.reactions)) {
    if (reply.reactions[e][voter]) { removedEmoji = e; delete reply.reactions[e][voter]; if (!Object.keys(reply.reactions[e]).length) delete reply.reactions[e]; break; }
  }
  if (removedEmoji !== emoji) { if (!reply.reactions[emoji]) reply.reactions[emoji] = {}; reply.reactions[emoji][voter] = true; }
  writeData(d);
  const summary = Object.fromEntries(Object.entries(reply.reactions).map(([e, v]) => [e, Object.keys(v).length]));
  const myReaction = Object.entries(reply.reactions).find(([, v]) => v[voter])?.[0] || null;
  io.emit('community:reply:reacted', { threadId, replyId, reactions: summary }); res.json({ reactions: summary, myReaction });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`NODE ZERO rodando na porta ${PORT}`));