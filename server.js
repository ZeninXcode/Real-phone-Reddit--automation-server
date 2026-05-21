const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());

const phones = new Map();
const dashboards = new Set();

wss.on('connection', (ws) => {
  let clientType = null;
  let clientId = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (!clientType) {
      if (msg.type === 'register_phone') {
        clientType = 'phone';
        clientId = msg.phoneId || phone_${Date.now()};
        phones.set(clientId, ws);
        console.log(📱 Phone connected: ${clientId});
        ws.send(JSON.stringify({ type: 'registered', phoneId: clientId }));
        broadcastToDashboards({ type: 'phone_connected', phoneId: clientId });
      } else if (msg.type === 'register_dashboard') {
        clientType = 'dashboard';
        dashboards.add(ws);
        ws.send(JSON.stringify({ type: 'phone_list', phones: Array.from(phones.keys()) }));
      }
      return;
    }

    if (clientType === 'phone') {
      broadcastToDashboards({ ...msg, phoneId: clientId });
    }

    if (clientType === 'dashboard') {
      const targetPhone = phones.get(msg.phoneId);
      if (targetPhone && targetPhone.readyState === WebSocket.OPEN) {
        targetPhone.send(JSON.stringify(msg));
      } else {
        ws.send(JSON.stringify({ type: 'error', message: 'Phone not connected' }));
      }
    }
  });

  ws.on('close', () => {
    if (clientType === 'phone') {
      phones.delete(clientId);
      broadcastToDashboards({ type: 'phone_disconnected', phoneId: clientId });
    } else if (clientType === 'dashboard') {
      dashboards.delete(ws);
    }
  });
});

function broadcastToDashboards(data) {
  const msg = JSON.stringify(data);
  dashboards.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  });
}

app.get('/', (req, res) => {
  res.json({ status: 'online', phones: phones.size, dashboards: dashboards.size });
});

app.get('/phones', (req, res) => {
  res.json({ phones: Array.from(phones.keys()) });
});

app.post('/command', (req, res) => {
  const { phoneId, command, params } = req.body;
  const phone = phones.get(phoneId);
  if (!phone || phone.readyState !== WebSocket.OPEN) {
    return res.status(404).json({ error: 'Phone not connected' });
  }
  phone.send(JSON.stringify({ type: 'command', command, params }));
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(🚀 Server running on port ${PORT});
});
