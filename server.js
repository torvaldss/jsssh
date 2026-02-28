require('dotenv').config();

const express = require('express');
const session = require('express-session');
const { WebSocketServer } = require('ws');
const { Client } = require('ssh2');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);

app.use(express.json());

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'fallback-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 3600000 },
});

app.use(sessionMiddleware);

// статик
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
}

// ауз
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === process.env.AUTH_USERNAME && password === process.env.AUTH_PASSWORD) {
    req.session.authenticated = true;
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false });
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.get('/check-auth', (req, res) => {
  res.json({ authenticated: !!req.session.authenticated });
});

if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

// ЕБАТЬ! сокет
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  sessionMiddleware(req, {}, () => {
    if (!req.session || !req.session.authenticated) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });
});

wss.on('connection', (ws) => {
  console.log('WebSocket connected');
  
  const ssh = new Client();
  
  ssh.on('ready', () => {
    console.log('SSH ready');
    ssh.shell({ term: 'xterm-256color' }, (err, stream) => {
      if (err) {
        console.error('Shell error:', err);
        return;
      }
      
      stream.on('data', (data) => ws.send(data.toString()));
      
      ws.on('message', (msg) => {
        try {
          const { type, data, cols, rows } = JSON.parse(msg);
          if (type === 'data') stream.write(data);
          if (type === 'resize') stream.setWindow(rows, cols);
        } catch (e) {
          console.error('Message error:', e);
        }
      });
      
      ws.on('close', () => {
        stream.end();
        ssh.end();
      });
    });
  });
  
  ssh.on('error', (err) => {
    console.error('SSH error:', err);
    ws.send(`\x1b[31mSSH Error: ${err.message}\x1b[0m\r\n`);
  });
  
  ssh.connect({
    host: process.env.SSH_HOST,
    port: parseInt(process.env.SSH_PORT) || 22,
    username: process.env.SSH_USER,
    password: process.env.SSH_PASSWORD,
    readyTimeout: 10000,
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});