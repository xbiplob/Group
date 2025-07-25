document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const authContainer = document.getElementById('auth-container');
    const chatContainer = document.getElementById('chat-container');
    const googleLoginBtn = document.getElementById('google-login');
    const logoutBtn = document.getElementById('logout-btn');
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');
    const messagesContainer = document.getElementById('messages');
    const userAvatar = document.getElementById('user-avatar');
    const usernameSpan = document.getElementById('username');
    const notificationSound = document.getElementById('notification-sound');

    // Firebase references
    const { auth, provider, database, ref, push, onValue, off, set, signInWithPopup, signOut, onAuthStateChanged } = window.firebase;
    const messagesRef = ref(database, 'messages');
    
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

    // Functions
    function signInWithGoogle() {
        signInWithPopup(auth, provider)
            .catch((error) => {
                console.error('Error during sign in:', error);
                alert('Error during sign in. Please try again.');
            });
    }

    function signOutUser() {
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
});
