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
    const base = { users: [], posts: [] };
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

// Migrate existing posts to have new fields
(function migrateData() {
  const d = readData();
  let changed = false;
  d.posts.forEach(p => {
    if (!p.clicks) { p.clicks = 0; changed = true; }
    if (!p.reactions) { p.reactions = { fire: 0, heart: 0, star: 0 }; changed = true; }
    if (!p.comments) { p.comments = []; changed = true; }
    if (!p.tags) { p.tags = []; changed = true; }
    if (!p.screenshots) { p.screenshots = []; changed = true; }
    if (!p.links) { p.links = []; changed = true; }
    if (!p.longDescription) { p.longDescription = ''; changed = true; }
  });
  if (!d.heroImage) { d.heroImage = null; changed = true; }
  if (changed) writeData(d);
})();

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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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

// ── AUTH ──
app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ error: 'Preencha todos os campos' });
  if (username.trim().length < 2) return res.json({ error: 'Nome muito curto' });
  const d = readData();
  if (d.users.find(u => u.username.toLowerCase() === username.trim().toLowerCase())) {
    return res.json({ error: 'Nome já em uso' });
  }
  d.users.push({ username: username.trim(), password: bcrypt.hashSync(password, 10) });
  writeData(d);
  req.session.user = { username: username.trim() };
  res.json({ ok: true, username: username.trim() });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const d = readData();
  const user = d.users.find(u => u.username === username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.json({ error: 'Usuário ou senha incorretos' });
  }
  req.session.user = { username: user.username };
  res.json({ ok: true, username: user.username });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {});
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  res.json({ user: req.session.user || null });
});

// ── POSTS ──
app.get('/api/posts', (req, res) => {
  const d = readData();
  const sorted = [...d.posts].sort((a, b) => (a.position || 0) - (b.position || 0) || a.id - b.id);
  res.json(sorted);
});

app.post('/api/posts', isMingau, upload.fields([
  { name: 'thumbnail', maxCount: 1 },
  { name: 'screenshots', maxCount: 10 }
]), (req, res) => {
  const { title, url, description, longDescription, tags, links } = req.body;
  if (!title) return res.json({ error: 'Título obrigatório' });
  const d = readData();
  const maxPos = d.posts.length ? Math.max(...d.posts.map(p => p.position || 0)) : 0;
  const id = d.posts.length ? Math.max(...d.posts.map(p => p.id)) + 1 : 1;
  const thumbnail = req.files?.thumbnail?.[0] ? '/uploads/' + req.files.thumbnail[0].filename : null;
  const screenshots = req.files?.screenshots ? req.files.screenshots.map(f => '/uploads/' + f.filename) : [];

  let parsedTags = [];
  try { parsedTags = tags ? JSON.parse(tags) : []; } catch { parsedTags = []; }

  let parsedLinks = [];
  try { parsedLinks = links ? JSON.parse(links) : []; } catch { parsedLinks = []; }

  const post = {
    id, title,
    url: url || null,
    description: description || null,
    longDescription: longDescription || '',
    thumbnail,
    screenshots,
    tags: parsedTags,
    links: parsedLinks,
    position: maxPos + 1,
    clicks: 0,
    reactions: { fire: 0, heart: 0, star: 0 },
    comments: [],
    created_at: new Date().toISOString()
  };
  d.posts.push(post);
  writeData(d);
  io.emit('post:added', post);
  res.json(post);
});

// Edit post
app.put('/api/posts/:id', isMingau, upload.fields([
  { name: 'thumbnail', maxCount: 1 },
  { name: 'screenshots', maxCount: 10 }
]), (req, res) => {
  const d = readData();
  const id = parseInt(req.params.id, 10);
  const idx = d.posts.findIndex(p => p.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Post não encontrado' });

  const post = d.posts[idx];
  const { title, url, description, longDescription, tags, links, keepScreenshots } = req.body;

  if (title) post.title = title;
  post.url = url || null;
  post.description = description || null;
  post.longDescription = longDescription || '';

  try { post.tags = tags ? JSON.parse(tags) : []; } catch { post.tags = []; }
  try { post.links = links ? JSON.parse(links) : []; } catch { post.links = []; }

  if (req.files?.thumbnail?.[0]) {
    if (post.thumbnail) {
      const old = './public' + post.thumbnail;
      if (fs.existsSync(old)) fs.unlinkSync(old);
    }
    post.thumbnail = '/uploads/' + req.files.thumbnail[0].filename;
  }

  if (req.files?.screenshots?.length) {
    const keep = keepScreenshots === 'true';
    if (!keep) {
      post.screenshots.forEach(s => {
        const f = './public' + s;
        if (fs.existsSync(f)) fs.unlinkSync(f);
      });
      post.screenshots = [];
    }
    post.screenshots = [...post.screenshots, ...req.files.screenshots.map(f => '/uploads/' + f.filename)];
  }

  d.posts[idx] = post;
  writeData(d);
  io.emit('post:updated', post);
  res.json(post);
});

app.delete('/api/posts/:id', isMingau, (req, res) => {
  const d = readData();
  const id = parseInt(req.params.id, 10);
  const post = d.posts.find(p => p.id === id);
  if (!post) return res.status(404).json({ error: 'Post não encontrado' });

  if (post.thumbnail) {
    const filePath = './public' + post.thumbnail;
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  post.screenshots?.forEach(s => {
    const f = './public' + s;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  });

  d.posts = d.posts.filter(p => p.id !== id);
  writeData(d);
  io.emit('post:deleted', { id });
  res.json({ ok: true });
});

app.put('/api/posts/reorder', isMingau, (req, res) => {
  const { order } = req.body;
  const d = readData();
  if (!Array.isArray(order)) return res.status(400).json({ error: 'Order inválido' });
  const map = new Map(d.posts.map(p => [p.id, p]));
  d.posts = order.map((id, idx) => {
    const post = map.get(id);
    if (post) { post.position = idx; return post; }
    return null;
  }).filter(p => p);
  writeData(d);
  io.emit('post:reordered', order);
  res.json({ ok: true });
});

// ── CLICKS ──
app.post('/api/posts/:id/click', (req, res) => {
  const d = readData();
  const id = parseInt(req.params.id, 10);
  const post = d.posts.find(p => p.id === id);
  if (!post) return res.status(404).json({ error: 'Post não encontrado' });
  post.clicks = (post.clicks || 0) + 1;
  writeData(d);
  io.emit('post:click', { id, clicks: post.clicks });
  res.json({ clicks: post.clicks });
});

// ── REACTIONS ──
app.post('/api/posts/:id/react', (req, res) => {
  const { type } = req.body;
  const valid = ['fire', 'heart', 'star'];
  if (!valid.includes(type)) return res.status(400).json({ error: 'Reação inválida' });
  const d = readData();
  const id = parseInt(req.params.id, 10);
  const post = d.posts.find(p => p.id === id);
  if (!post) return res.status(404).json({ error: 'Post não encontrado' });
  if (!post.reactions) post.reactions = { fire: 0, heart: 0, star: 0 };
  post.reactions[type] = (post.reactions[type] || 0) + 1;
  writeData(d);
  io.emit('post:reacted', { id, reactions: post.reactions });
  res.json({ reactions: post.reactions });
});

// ── COMMENTS ──
app.post('/api/posts/:id/comments', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Login necessário' });
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Comentário vazio' });
  if (text.trim().length > 500) return res.status(400).json({ error: 'Comentário muito longo' });
  const d = readData();
  const id = parseInt(req.params.id, 10);
  const post = d.posts.find(p => p.id === id);
  if (!post) return res.status(404).json({ error: 'Post não encontrado' });
  if (!post.comments) post.comments = [];
  const comment = {
    id: Date.now(),
    username: req.session.user.username,
    text: text.trim(),
    created_at: new Date().toISOString()
  };
  post.comments.push(comment);
  writeData(d);
  io.emit('post:comment', { postId: id, comment });
  res.json(comment);
});

app.delete('/api/posts/:postId/comments/:commentId', isMingau, (req, res) => {
  const d = readData();
  const postId = parseInt(req.params.postId, 10);
  const commentId = parseInt(req.params.commentId, 10);
  const post = d.posts.find(p => p.id === postId);
  if (!post) return res.status(404).json({ error: 'Post não encontrado' });
  post.comments = post.comments.filter(c => c.id !== commentId);
  writeData(d);
  io.emit('post:commentDeleted', { postId, commentId });
  res.json({ ok: true });
});

// ── HERO IMAGE ──
app.post('/api/hero', isMingau, upload.single('heroImage'), (req, res) => {
  const d = readData();
  if (req.file) {
    if (d.heroImage) {
      const old = './public' + d.heroImage;
      if (fs.existsSync(old)) fs.unlinkSync(old);
    }
    d.heroImage = '/uploads/' + req.file.filename;
    writeData(d);
    io.emit('hero:updated', { heroImage: d.heroImage });
    res.json({ heroImage: d.heroImage });
  } else {
    res.json({ heroImage: d.heroImage });
  }
});

app.delete('/api/hero', isMingau, (req, res) => {
  const d = readData();
  if (d.heroImage) {
    const old = './public' + d.heroImage;
    if (fs.existsSync(old)) fs.unlinkSync(old);
    d.heroImage = null;
    writeData(d);
    io.emit('hero:updated', { heroImage: null });
  }
  res.json({ ok: true });
});

app.get('/api/hero', (req, res) => {
  const d = readData();
  res.json({ heroImage: d.heroImage || null });
});

// ── STATS ──
app.get('/api/stats', isMingau, (req, res) => {
  const d = readData();
  const totalClicks = d.posts.reduce((acc, p) => acc + (p.clicks || 0), 0);
  const totalComments = d.posts.reduce((acc, p) => acc + (p.comments?.length || 0), 0);
  const totalReactions = d.posts.reduce((acc, p) => {
    const r = p.reactions || {};
    return acc + (r.fire || 0) + (r.heart || 0) + (r.star || 0);
  }, 0);
  res.json({
    totalPosts: d.posts.length,
    totalUsers: d.users.length,
    totalClicks,
    totalComments,
    totalReactions,
    topPost: d.posts.sort((a, b) => (b.clicks || 0) - (a.clicks || 0))[0] || null
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`NODE ZERO rodando na porta ${PORT}`));