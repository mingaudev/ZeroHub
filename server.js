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

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = './public/uploads';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

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

app.get('/api/posts', (req, res) => {
  const d = readData();
  const sorted = [...d.posts].sort((a, b) => a.position - b.position || a.id - b.id);
  res.json(sorted);
});

app.post('/api/posts', isMingau, upload.single('thumbnail'), (req, res) => {
  const { title, url, description } = req.body;
  if (!title) return res.json({ error: 'Título obrigatório' });
  const d = readData();
  const maxPos = d.posts.length ? Math.max(...d.posts.map(p => p.position || 0)) : 0;
  const id = d.posts.length ? Math.max(...d.posts.map(p => p.id)) + 1 : 1;
  const thumbnail = req.file ? '/uploads/' + req.file.filename : null;
  const post = { id, title, url: url || null, description: description || null, thumbnail, position: maxPos + 1, created_at: new Date().toISOString() };
  d.posts.push(post);
  writeData(d);
  io.emit('post:added', post);
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
    if (post) {
      post.position = idx;
      return post;
    }
    return null;
  }).filter(p => p);
  writeData(d);
  io.emit('post:reordered', order);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`NODE ZERO rodando na porta ${PORT}`));
