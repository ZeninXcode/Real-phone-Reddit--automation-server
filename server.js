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

wss.on('connection', function(ws) {
  var clientType = null;
  var clientId = null;

  ws.on('message', function(raw) {
    var msg;
    try { msg = JSON.parse(raw); } catch(e) { return; }

    if (!clientType) {
      if (msg.type === 'register_phone') {
        clientType = 'phone';
        clientId = msg.phoneId ? msg.phoneId : 'phone_' + Date.now();
        phones.set(clientId, ws);
        console.log('Phone connected: ' + clientId);
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
      msg.phoneId = clientId;
      broadcastToDashboards(msg);
    }

    if (clientType === 'dashboard') {
      var targetPhone = phones.get(msg.phoneId);
      if (targetPhone && targetPhone.readyState === WebSocket.OPEN) {
        targetPhone.send(JSON.stringify(msg));
      } else {
        ws.send(JSON.stringify({ type: 'error', message: 'Phone not connected' }));
      }
    }
  });

  ws.on('close', function() {
    if (clientType === 'phone') {
      phones.delete(clientId);
      broadcastToDashboards({ type: 'phone_disconnected', phoneId: clientId });
    } else if (clientType === 'dashboard') {
      dashboards.delete(ws);
    }
  });
});

function broadcastToDashboards(data) {
  var msg = JSON.stringify(data);
  dashboards.forEach(function(ws) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  });
}

app.get('/', function(req, res) {
  res.json({ status: 'online', phones: phones.size, dashboards: dashboards.size });
});

app.get('/phones', function(req, res) {
  res.json({ phones: Array.from(phones.keys()) });
});

app.post('/command', function(req, res) {
  var phoneId = req.body.phoneId;
  var command = req.body.command;
  var params = req.body.params;
  var phone = phones.get(phoneId);
  if (!phone || phone.readyState !== WebSocket.OPEN) {
    return res.status(404).json({ error: 'Phone not connected' });
  }
  phone.send(JSON.stringify({ type: 'command', command: command, params: params }));
  res.json({ success: true });
});

var PORT = process.env.PORT || 3000;
server.listen(PORT, function() {
  console.log('Server running on port ' + PORT);
});
