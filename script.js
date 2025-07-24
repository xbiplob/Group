document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const authContainer = document.getElementById('auth-container');
    const chatContainer = document.getElementById('chat-container');
    const callContainer = document.getElementById('call-container');
    const googleLoginBtn = document.getElementById('google-login');
    const logoutBtn = document.getElementById('logout-btn');
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');
    const messagesContainer = document.getElementById('messages');
    const userAvatar = document.getElementById('user-avatar');
    const usernameSpan = document.getElementById('username');
    const notificationSound = document.getElementById('notification-sound');
    const audioCallBtn = document.getElementById('audio-call-btn');
    const videoCallBtn = document.getElementById('video-call-btn');
    const endCallBtn = document.getElementById('end-call-btn');
    const toggleAudioBtn = document.getElementById('toggle-audio-btn');
    const toggleVideoBtn = document.getElementById('toggle-video-btn');
    const localVideo = document.getElementById('local-video');
    const remoteVideo = document.getElementById('remote-video');

    // Firebase references
    const { auth, provider, database, ref, push, onValue, off, set, signInWithPopup, signOut, onAuthStateChanged } = window.firebase;
    const messagesRef = ref(database, 'messages');
    
    // WebRTC variables
    let localStream;
    let remoteStream;
    let peerConnection;
    let isCaller = false;
    let isAudioMuted = false;
    let isVideoOff = false;
    
    // STUN servers configuration
    const configuration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' }
        ]
    };

    // Initialize Firebase auth state listener
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // User is signed in
            handleUserLogin(user);
        } else {
            // User is signed out
            handleUserLogout();
        }
    });

    // Event Listeners
    googleLoginBtn.addEventListener('click', signInWithGoogle);
    logoutBtn.addEventListener('click', signOutUser);
    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });
    audioCallBtn.addEventListener('click', () => startCall(false));
    videoCallBtn.addEventListener('click', () => startCall(true));
    endCallBtn.addEventListener('click', endCall);
    toggleAudioBtn.addEventListener('click', toggleAudio);
    toggleVideoBtn.addEventListener('click', toggleVideo);

    // Functions
    function signInWithGoogle() {
        signInWithPopup(auth, provider)
            .catch((error) => {
                console.error('Error during sign in:', error);
                alert('Error during sign in. Please try again.');
            });
    }

    function signOutUser() {
        endCall();
        signOut(auth).catch((error) => {
            console.error('Error signing out:', error);
        });
    }

    function handleUserLogin(user) {
        // Update UI
        authContainer.classList.add('hidden');
        chatContainer.classList.remove('hidden');
        
        // Set user info
        userAvatar.src = user.photoURL;
        usernameSpan.textContent = user.displayName;
        
        // Load messages
        loadMessages();
    }

    function handleUserLogout() {
        // Clear UI
        chatContainer.classList.add('hidden');
        authContainer.classList.remove('hidden');
        messagesContainer.innerHTML = '';
        
        // Remove listeners
        off(messagesRef);
    }

    function loadMessages() {
        onValue(messagesRef, (snapshot) => {
            messagesContainer.innerHTML = '';
            const messages = snapshot.val();
            
            if (messages) {
                Object.keys(messages).forEach((key) => {
                    const message = messages[key];
                    displayMessage(message);
                });
                
                // Scroll to bottom
                setTimeout(() => {
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                }, 100);
            }
        });
    }

    function displayMessage(message) {
        const currentUser = auth.currentUser;
        const isOwnMessage = message.userId === currentUser.uid;
        
        const messageElement = document.createElement('div');
        messageElement.className = `message ${isOwnMessage ? 'own-message' : ''}`;
        
        if (!isOwnMessage) {
            // Play notification sound for new messages that aren't from the current user
            notificationSound.currentTime = 0;
            notificationSound.play().catch(e => console.log('Audio play failed:', e));
        }
        
        messageElement.innerHTML = `
            <img class="message-avatar" src="${message.photoURL}" alt="${message.name}">
            <div class="message-content">
                <div class="message-header">
                    <span class="message-sender">${message.name}</span>
                    <span class="message-time">${formatTime(message.timestamp)}</span>
                </div>
                <div class="message-text">${message.text}</div>
            </div>
        `;
        
        messagesContainer.appendChild(messageElement);
        
        // Scroll to bottom if the user is near the bottom
        const isNearBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < 100;
        if (isNearBottom) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }

    function sendMessage() {
        const text = messageInput.value.trim();
        if (text === '') return;
        
        const user = auth.currentUser;
        const newMessage = {
            text,
            name: user.displayName,
            userId: user.uid,
            photoURL: user.photoURL,
            timestamp: Date.now()
        };
        
        push(messagesRef, newMessage)
            .then(() => {
                messageInput.value = '';
            })
            .catch((error) => {
                console.error('Error sending message:', error);
                alert('Failed to send message. Please try again.');
            });
    }

    function formatTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    // WebRTC Functions
    async function startCall(withVideo) {
        try {
            // Get local media stream
            localStream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: withVideo
            });
            
            // Create peer connection
            peerConnection = new RTCPeerConnection(configuration);
            
            // Set up event handlers
            peerConnection.onicecandidate = handleICECandidateEvent;
            peerConnection.oniceconnectionstatechange = handleICEConnectionStateChangeEvent;
            peerConnection.onicegatheringstatechange = handleICEGatheringStateChangeEvent;
            peerConnection.onsignalingstatechange = handleSignalingStateChangeEvent;
            peerConnection.ontrack = handleTrackEvent;
            
            // Add local stream to peer connection
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
            });
            
            // Display local video
            localVideo.srcObject = localStream;
            
            // Show call UI
            chatContainer.classList.add('hidden');
            callContainer.classList.remove('hidden');
            
            // Set caller flag
            isCaller = true;
            
            // Create offer
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            
            // In a real app, you would send the offer to the other peer via a signaling server
            // For this demo, we'll just simulate a connection
            setTimeout(() => {
                if (peerConnection) {
                    simulateAnswer();
                }
            }, 1000);
            
        } catch (error) {
            console.error('Error starting call:', error);
            alert('Could not start call. Please check your microphone and camera permissions.');
            endCall();
        }
    }

    async function simulateAnswer() {
        try {
            // Create answer (simulated)
            const answer = {
                type: 'answer',
                sdp: 'simulated-answer-sdp'
            };
            
            await peerConnection.setRemoteDescription(answer);
            
        } catch (error) {
            console.error('Error simulating answer:', error);
            endCall();
        }
    }

    function endCall() {
        // Close peer connection
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
        
        // Stop local stream
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
        }
        
        // Clear video elements
        localVideo.srcObject = null;
        remoteVideo.srcObject = null;
        
        // Reset UI
        callContainer.classList.add('hidden');
        chatContainer.classList.remove('hidden');
        
        // Reset call states
        isCaller = false;
        isAudioMuted = false;
        isVideoOff = false;
        toggleAudioBtn.innerHTML = '<i class="fas fa-microphone"></i> Mute';
        toggleVideoBtn.innerHTML = '<i class="fas fa-video"></i> Video Off';
    }

    function toggleAudio() {
        if (localStream) {
            const audioTracks = localStream.getAudioTracks();
            if (audioTracks.length > 0) {
                isAudioMuted = !isAudioMuted;
                audioTracks[0].enabled = !isAudioMuted;
                toggleAudioBtn.innerHTML = isAudioMuted 
                    ? '<i class="fas fa-microphone-slash"></i> Unmute' 
                    : '<i class="fas fa-microphone"></i> Mute';
            }
        }
    }

    function toggleVideo() {
        if (localStream) {
            const videoTracks = localStream.getVideoTracks();
            if (videoTracks.length > 0) {
                isVideoOff = !isVideoOff;
                videoTracks[0].enabled = !isVideoOff;
                toggleVideoBtn.innerHTML = isVideoOff 
                    ? '<i class="fas fa-video-slash"></i> Video On' 
                    : '<i class="fas fa-video"></i> Video Off';
                
                // Show/hide local video element if video is turned on/off
                localVideo.style.display = isVideoOff ? 'none' : 'block';
            }
        }
    }

    // WebRTC Event Handlers
    function handleICECandidateEvent(event) {
        if (event.candidate) {
            // In a real app, you would send the ICE candidate to the other peer
            console.log('ICE candidate:', event.candidate);
        }
    }

    function handleICEConnectionStateChangeEvent() {
        if (peerConnection) {
            console.log('ICE connection state:', peerConnection.iceConnectionState);
            if (peerConnection.iceConnectionState === 'disconnected' || 
                peerConnection.iceConnectionState === 'failed') {
                endCall();
            }
        }
    }

    function handleICEGatheringStateChangeEvent() {
        if (peerConnection) {
            console.log('ICE gathering state:', peerConnection.iceGatheringState);
        }
    }

    function handleSignalingStateChangeEvent() {
        if (peerConnection) {
            console.log('Signaling state:', peerConnection.signalingState);
        }
    }

    function handleTrackEvent(event) {
        // Add remote stream to video element
        remoteStream = event.streams[0];
        remoteVideo.srcObject = remoteStream;
    }
});