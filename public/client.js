let currentUser = null, currentChatId = null, currentChatUsername = null, ws = null, chats = [];

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        document.getElementById('loginTab').classList.toggle('active', tab === 'login');
        document.getElementById('registerTab').classList.toggle('active', tab === 'register');
    };
});

document.getElementById('doRegisterBtn').onclick = async () => {
    const username = document.getElementById('regUsername').value.trim();
    const phone = document.getElementById('regPhone').value.trim();
    const name = document.getElementById('regName').value.trim();
    const password = document.getElementById('regPassword').value;
    if (!username || !phone || !password) return showError('Заполните все поля');
    const res = await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, phone, password, name }) });
    const data = await res.json();
    if (data.success) { currentUser = data.user; initApp(); } else showError(data.error);
};

document.getElementById('doLoginBtn').onclick = async () => {
    const login = document.getElementById('loginLogin').value.trim();
    const password = document.getElementById('loginPassword').value;
    if (!login || !password) return showError('Введите логин и пароль');
    const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login, password }) });
    const data = await res.json();
    if (data.success) { currentUser = data.user; initApp(); } else showError(data.error);
};

function showError(msg) { const err = document.getElementById('authError'); err.textContent = msg; err.style.display = 'block'; setTimeout(() => err.style.display = 'none', 3000); }

async function initApp() {
    document.getElementById('authScreen').classList.remove('active');
    document.getElementById('mainScreen').classList.add('active');
    document.getElementById('chatArea').style.display = 'none';
    document.getElementById('userName').textContent = currentUser.name || currentUser.username;
    document.getElementById('userAvatar').textContent = currentUser.avatar || '😎';
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${location.host}`);
    ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', username: currentUser.username }));
    ws.onmessage = (e) => { const msg = JSON.parse(e.data); if (msg.type === 'new_message' && currentChatId === msg.chatId) appendMessage(msg.message); };
    loadChats();
    setupSearch();
}

async function loadChats() {
    const res = await fetch(`/api/chats/${currentUser.username}`);
    chats = await res.json();
    const container = document.getElementById('chatsList');
    if (!chats.length) { container.innerHTML = '<div class="empty-state">✨ Найди друга через поиск</div>'; return; }
    container.innerHTML = chats.map(c => `<div class="chat-item" onclick="openChat('${c.id}','${c.username}','${c.name}','${c.avatar}')"><div class="chat-item-avatar">${c.avatar}</div><div class="chat-item-info"><div class="chat-item-name">${escapeHtml(c.name)}</div><div class="chat-item-last">${escapeHtml(c.lastMessage)}</div></div></div>`).join('');
}

window.openChat = async (chatId, username, name, avatar) => {
    currentChatId = chatId; currentChatUsername = username;
    document.getElementById('chatArea').style.display = 'flex';
    document.getElementById('chatName').textContent = name;
    document.getElementById('chatAvatar').textContent = avatar;
    const res = await fetch(`/api/messages/${chatId}`);
    const msgs = await res.json();
    const container = document.getElementById('messagesContainer');
    container.innerHTML = '';
    msgs.forEach(m => appendMessage(m));
};

function appendMessage(msg) {
    const container = document.getElementById('messagesContainer');
    const div = document.createElement('div');
    div.className = `message ${msg.from === currentUser.username ? 'out' : 'in'}`;
    div.innerHTML = `${escapeHtml(msg.text)}<span class="message-time">${msg.time}</span>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

document.getElementById('sendBtn').onclick = () => {
    const text = document.getElementById('messageInput').value.trim();
    if (!text || !currentChatId) return;
    ws.send(JSON.stringify({ type: 'message', chatId: currentChatId, text, toUsername: currentChatUsername }));
    document.getElementById('messageInput').value = '';
};

async function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    const resultsDiv = document.getElementById('searchResults');
    searchInput.oninput = async () => {
        const q = searchInput.value.trim();
        if (q.length < 2) { resultsDiv.style.display = 'none'; resultsDiv.innerHTML = ''; return; }
        resultsDiv.style.display = 'block';
        resultsDiv.innerHTML = '<div class="search-result-item">⏳ Поиск...</div>';
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&currentUser=${currentUser.username}`);
        const users = await res.json();
        if (!users.length) { resultsDiv.innerHTML = '<div class="search-result-item">❌ Никого не найдено</div>'; return; }
        resultsDiv.innerHTML = users.map(u => `<div class="search-result-item" onclick="startChatWith('${u.username}')"><span style="font-size:36px">${u.avatar || '👤'}</span><div style="flex:1"><div><strong>${escapeHtml(u.name)}</strong></div><div style="font-size:11px;color:#c084fc">@${u.username}</div></div><button style="background:#a855f7;border:none;padding:6px 12px;border-radius:20px;color:white">💬</button></div>`).join('');
    };
}

window.startChatWith = async (username) => {
    const res = await fetch('/api/create-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ myUsername: currentUser.username, targetUsername: username }) });
    const data = await res.json();
    if (data.success) {
        document.getElementById('searchResults').style.display = 'none';
        document.getElementById('searchInput').value = '';
        await loadChats();
        setTimeout(() => { const newChat = chats.find(c => c.username === username); if (newChat) openChat(newChat.id, newChat.username, newChat.name, newChat.avatar); }, 500);
    } else alert(data.error);
};

document.getElementById('logoutBtn').onclick = () => { if (ws) ws.close(); location.reload(); };
function escapeHtml(str) { if (!str) return ''; return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m])); }