let peerConnection = null;
let localStream = null;
let currentCallWith = null;
let callActive = false;

const configuration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

document.getElementById('callBtn').onclick = () => {
    if (!currentChatUsername) return;
    startCall(currentChatUsername);
};

async function startCall(toUsername) {
    currentCallWith = toUsername;
    document.getElementById('callModal').style.display = 'flex';
    document.getElementById('callName').textContent = toUsername;
    document.getElementById('callStatus').textContent = 'Соединение...';
    
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        peerConnection = new RTCPeerConnection(configuration);
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
        
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                ws.send(JSON.stringify({ type: 'call-ice', to: toUsername, candidate: event.candidate, from: currentUser.username }));
            }
        };
        
        peerConnection.ontrack = (event) => {
            const remoteAudio = new Audio();
            remoteAudio.srcObject = event.streams[0];
            remoteAudio.play();
            document.getElementById('callStatus').textContent = 'Разговор...';
        };
        
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        ws.send(JSON.stringify({ type: 'call-offer', to: toUsername, offer: offer, from: currentUser.username }));
    } catch(e) { console.error(e); document.getElementById('callModal').style.display = 'none'; }
}

ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'call-offer' && msg.from !== currentUser?.username) {
        receiveCall(msg.from, msg.offer);
    }
    if (msg.type === 'call-answer' && currentCallWith === msg.from) {
        peerConnection.setRemoteDescription(new RTCSessionDescription(msg.answer));
        document.getElementById('callStatus').textContent = 'Разговор...';
    }
    if (msg.type === 'call-ice' && currentCallWith === msg.from) {
        if (peerConnection) peerConnection.addIceCandidate(new RTCIceCandidate(msg.candidate));
    }
};

async function receiveCall(from, offer) {
    currentCallWith = from;
    document.getElementById('callModal').style.display = 'flex';
    document.getElementById('callName').textContent = from;
    document.getElementById('callStatus').textContent = 'Входящий звонок...';
    
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    peerConnection = new RTCPeerConnection(configuration);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) ws.send(JSON.stringify({ type: 'call-ice', to: from, candidate: event.candidate, from: currentUser.username }));
    };
    peerConnection.ontrack = (event) => { const audio = new Audio(); audio.srcObject = event.streams[0]; audio.play(); };
    
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    ws.send(JSON.stringify({ type: 'call-answer', to: from, answer: answer, from: currentUser.username }));
    document.getElementById('callStatus').textContent = 'Разговор...';
}

document.getElementById('hangupBtn').onclick = () => {
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    if (peerConnection) peerConnection.close();
    peerConnection = null;
    callActive = false;
    document.getElementById('callModal').style.display = 'none';
};