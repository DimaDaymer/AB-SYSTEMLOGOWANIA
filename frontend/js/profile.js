// frontend/js/profile.js
document.addEventListener('DOMContentLoaded', async () => {
    const path = window.location.pathname;
    const isPublicProfile = path.startsWith('/user/');
    const urlIdentifier = isPublicProfile ? path.split('/')[2] : null;
    const token = localStorage.getItem('token');

    let targetUserId = null;
    let myUserId = null;
    let usernameForApi = urlIdentifier;

    // 1. Pobieramy ID z tokena
    if (token) {
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            myUserId = payload.id;
        } catch(e) { console.warn('Token error:', e); }
    }

    // 2. Określamy czyj profil
    if (!isPublicProfile || path === '/profile') {
        targetUserId = myUserId;
    } else if (urlIdentifier) {
        try {
            const res = await fetch(`/api/users/${urlIdentifier}`);
            if (res.ok) {
                const data = await res.json();
                targetUserId = data.id;
                usernameForApi = data.username;
            }
        } catch (e) { console.error('User fetch error:', e); }
    }

    if (!targetUserId && !isPublicProfile) {
        window.location.href = '/login.html';
        return;
    }

    // Inicjalizacja kontekstu
    window.profileContext = {
        isPublic: (myUserId !== targetUserId),
        targetId: targetUserId,
        username: usernameForApi,
        token: token,
        ready: true
    };

    // Funkcja ładowania komponentów (Teraz dostępna globalnie)
    window.loadComponent = async function(containerId, filePath) {
        const container = document.getElementById(containerId);
        if (!container) return;

        try {
            const response = await fetch(filePath);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const html = await response.text();

            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;

            const scripts = Array.from(tempDiv.querySelectorAll('script'));
            scripts.forEach(oldScript => oldScript.remove());

            container.innerHTML = tempDiv.innerHTML;

            for (const oldScript of scripts) {
                const newScript = document.createElement('script');
                Array.from(oldScript.attributes).forEach(attr => {
                    newScript.setAttribute(attr.name, attr.value);
                });
                if (oldScript.src) {
                    newScript.src = oldScript.src;
                } else {
                    newScript.textContent = oldScript.textContent;
                }
                document.body.appendChild(newScript);
            }
        } catch (error) {
            console.error(`Error loading component ${filePath}:`, error);
            container.innerHTML = `<div class="error">Błąd ładowania ${filePath}</div>`;
        }
    };

    async function updateDynamicBackground() {
        const bg = document.getElementById('dynamic-background');
        const avatarImg = document.querySelector('.avatar img');

        if (avatarImg && bg) {
            const setImage = () => {
                bg.style.backgroundImage = `url('${avatarImg.src}')`;
            };
            if (avatarImg.complete) {
                setImage();
            } else {
                avatarImg.addEventListener('load', setImage);
            }
        }
    }

    async function loadCommentsModule(userId) {
        try {
            const commentRes = await fetch('/components/comment-box.html');
            if (commentRes.ok) {
                const container = document.getElementById('comment-box-component');
                if (container) {
                    container.innerHTML = await commentRes.text();
                    if (window.CommentsCore) {
                        new window.CommentsCore({
                            mode: 'USER',
                            entityId: userId,
                            containerId: 'comments-system-root'
                        });
                    }
                }
            }
        } catch (e) { console.error("Błąd ładowania modułu komentarzy:", e); }
    }

    // Ładowanie głównych paneli
    await Promise.all([
        window.loadComponent('user-info-component', '/components/profile/user-info-panel.html'),
        window.loadComponent('tabs-component', '/components/profile/tabs-panel.html'),
        window.loadComponent('right-panel-component', '/components/profile/right-panel.html'),
    ]);

    if (targetUserId) {
        await loadCommentsModule(targetUserId);
    }

    updateDynamicBackground();

    if (window.SimilarLoader && targetUserId) {
        window.SimilarLoader.init('user', targetUserId, 'similar-users-container', 'compact');
    }
});