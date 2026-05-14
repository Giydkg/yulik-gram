const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const DATA_FILE = './yulik_data.json';

let users = {};
let chats = {};
let messages = {};

function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = JSON.parse(fs.readFileSync(DATA_FILE));
            users = data.users || {};
            chats = data.chats || {};
            messages = data.messages || {};
        } else {
            users = {
                'yulik': { username: 'yulik', phone: '+79778543533', passwordHash: bcrypt.hashSync('123456', 10), name: 'Юлик', avatar: '👑', online: true, lastSeen: new Date() },
                'max': { username: 'max', phone: '+79778477550', passwordHash: bcrypt.hashSync('123456', 10), name: 'Макс', avatar: '🔥', online: false, lastSeen: new Date() }
            };
            saveData();
        }
    } catch(e) { console.error(e); }
}
function saveData() { fs.writeFileSync(DATA_FILE, JSON.stringify({ users, chats, messages }, null, 2)); }
loadData();

app.use(express.json());
app.use(express.static('public'));

app.post('/api/register', async (req, res) => {
    const { username, phone, password, name } = req.body;
    if (!username || !phone || !password) return res.json({ success: false, error: 'Заполните все поля' });
    if (users[username]) return res.json({ success: false, error: 'Юзернейм занят' });
    if (Object.values(users).some(u => u.phone === phone)) return res.json({ success: false, error: 'Номер занят' });
    users[username] = { username, phone, passwordHash: await bcrypt.hash(password, 10), name: name || username, avatar: '😎', online: true, lastSeen: new Date() };
    saveData();
    res.json({ success: true, user: { username, phone, name: users[username].name, avatar: users[username].avatar } });
});

app.post('/api/login', async (req, res) => {
    const { login, password } = req.body;
    let user = users[login] || Object.values(users).find(u => u.phone === login);
    if (!user) return res.json({ success: false, error: 'Пользователь не найден' });
    if (!await bcrypt.compare(password, user.passwordHash)) return res.json({ success: false, error: 'Неверный пароль' });
    user.online = true;
    saveData();
    res.json({ success: true, user: { username: user.username, phone: user.phone, name: user.name, avatar: user.avatar } });
});

app.get('/api/search', (req, res) => {
    const query = req.query.q?.toLowerCase()?.trim() || '';
    const currentUser = req.query.currentUser || '';
    if (query.length < 1) return res.json([]);
    const results = Object.values(users).filter(u => u.username !== currentUser && (u.username.toLowerCase().includes(query) || u.phone.includes(query) || (u.name && u.name.toLowerCase().includes(query))));
    res.json(results.map(u => ({ username: u.username, phone: u.phone, name: u.name || u.username, avatar: u.avatar || '👤' })));
});

app.get('/api/chats/:username', (req, res) => {
    const username = req.params.username;
    const userChats = Object.values(chats).filter(chat => chat.participants.includes(username));
    const enriched = userChats.map(chat => {
        const other = chat.participants.find(p => p !== username);
        const otherUser = users[other];
        const lastMsg = messages[chat.id]?.[messages[chat.id].length - 1];
        return { id: chat.id, username: other, name: otherUser?.name || other, avatar: otherUser?.avatar || '💬', lastMessage: lastMsg?.text || 'Напишите первым', lastTime: lastMsg?.time || chat.createdAt };
    });
    res.json(enriched);
});

app.get('/api/messages/:chatId', (req, res) => res.json(messages[req.params.chatId] || []));

app.post('/api/create-chat', (req, res) => {
    const { myUsername, targetUsername } = req.body;
    if (!users[targetUsername]) return res.json({ success: false, error: 'Пользователь не найден' });
    let existing = Object.values(chats).find(chat => chat.participants.includes(myUsername) && chat.participants.includes(targetUsername));
    if (existing) return res.json({ success: true, chatId: existing.id });
    const chatId = uuidv4();
    chats[chatId] = { id: chatId, participants: [myUsername, targetUsername], createdAt: new Date().toLocaleString() };
    saveData();
    res.json({ success: true, chatId });
});

const clients = new Map();
wss.on('connection', (ws) => {
    let currentUser = null;
    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data);
            if (msg.type === 'auth') { currentUser = msg.username; clients.set(currentUser, ws); ws.send(JSON.stringify({ type: 'auth_ok' })); }
            if (msg.type === 'message' && currentUser) {
                const messageObj = { id: uuidv4(), from: currentUser, text: msg.text, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
                if (!messages[msg.chatId]) messages[msg.chatId] = [];
                messages[msg.chatId].push(messageObj);
                saveData();
                ws.send(JSON.stringify({ type: 'new_message', chatId: msg.chatId, message: messageObj }));
                const targetWs = clients.get(msg.toUsername);
                if (targetWs && targetWs.readyState === WebSocket.OPEN) targetWs.send(JSON.stringify({ type: 'new_message', chatId: msg.chatId, message: messageObj }));
            }
            if (msg.type === 'call-offer' || msg.type === 'call-answer' || msg.type === 'call-ice') {
                const targetWs = clients.get(msg.to);
                if (targetWs && targetWs.readyState === WebSocket.OPEN) targetWs.send(JSON.stringify(msg));
            }
        } catch(e) { console.error(e); }
    });
    ws.on('close', () => { if (currentUser) { clients.delete(currentUser); if (users[currentUser]) { users[currentUser].online = false; saveData(); } } });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`💎 Yulik Gram PRO запущен на http://localhost:${PORT}`));