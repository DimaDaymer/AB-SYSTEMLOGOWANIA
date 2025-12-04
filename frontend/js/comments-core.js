/* js/comments-core.js */

(function() {
    // Проверка: если класс уже объявлен, не объявляем его снова
    if (window.CommentsCore) {
        return;
    }

    window.CommentsCore = class {
        constructor(config) {
            /**
             * config: {
             * mode: 'ALBUM' | 'PROFILE',
             * entityId: string | number, (albumId или username)
             * containerId: string, (ID DOM элемента обертки)
             * currentUser: object | null
             * }
             */
            this.mode = config.mode;
            this.entityId = config.entityId;
            this.containerId = config.containerId;
            this.currentUser = config.currentUser || this.parseJwt(localStorage.getItem('token'));

            this.currentPage = 1;
            this.activeThreadId = null;

            // DOM Elements Cache
            this.dom = {
                root: document.getElementById(this.containerId),
                list: document.querySelector(`#${this.containerId} .comments-list`),
                sort: document.querySelector(`#${this.containerId} .sort-select`),
                pagination: document.querySelector(`#${this.containerId} .pagination`),
                mainInput: document.querySelector(`#${this.containerId} .main-input`),
                postBtn: document.querySelector(`#${this.containerId} .main-post-btn`),
                threadOverlay: document.getElementById('thread-overlay-shared'),
                threadContent: document.getElementById('thread-content-shared'),
                threadInput: document.getElementById('thread-reply-input'),
                threadSendBtn: document.getElementById('thread-send-btn'),
                threadCloseBtn: document.getElementById('thread-close-btn')
            };

            this.init();
        }

        init() {
            if (!this.dom.root) {
                console.error(`Container #${this.containerId} not found`);
                return;
            }

            // Event Listeners
            if (this.dom.postBtn) this.dom.postBtn.addEventListener('click', () => this.postComment());
            if (this.dom.sort) this.dom.sort.addEventListener('change', () => this.loadComments(1));

            // Global Thread Listeners (Only bind once if possible, but safe here due to ID check)
            if (this.dom.threadSendBtn) {
                this.dom.threadSendBtn.onclick = () => this.postReply();
            }
            if (this.dom.threadCloseBtn) {
                this.dom.threadCloseBtn.onclick = () => this.closeThread();
            }

            // Expose instance to global scope for inline onclick handlers (edit, like, open thread)
            window['CommentSys_' + this.containerId] = this;

            this.loadComments(1);
        }

        /* --- API Strategies based on Mode --- */
        getApiEndpoints() {
            if (this.mode === 'ALBUM') {
                return {
                    fetchList: (page, sort) => `/api/reviews/album/${this.entityId}?page=${page}&limit=5&sort=${sort}`,
                    fetchThread: (parentId) => `/api/reviews/thread/${parentId}`,
                    post: '/api/reviews', // Body: { albumId, content, parentId }
                    edit: (id) => `/api/reviews/${id}`,
                    vote: (id) => `/api/reviews/${id}/vote`
                };
            } else {
                // PROFILE
                return {
                    fetchList: (page, sort) => `/api/users/${this.entityId}/comments?page=${page}&limit=10&sort=${sort}`,
                    fetchThread: (parentId) => `/api/users/comments/thread/${parentId}`,
                    post: `/api/users/${this.entityId}/comments`, // Body: { content, parentId }
                    edit: (id) => `/api/users/comments/${id}`,
                    vote: (id) => `/api/users/comments/${id}/vote`
                };
            }
        }

        /* --- Logic --- */

        async loadComments(page) {
            this.currentPage = page;
            const sort = this.dom.sort ? this.dom.sort.value : 'newest';
            const api = this.getApiEndpoints();

            if(this.dom.list) this.dom.list.innerHTML = '<div style="text-align:center; padding:20px;">Loading...</div>';

            try {
                const res = await fetch(api.fetchList(page, sort));
                if(!res.ok) throw new Error("API Error");
                const data = await res.json();

                this.renderList(data.comments, this.dom.list);
                this.renderPagination(data.page, data.totalPages);
            } catch (e) {
                console.error(e);
                if(this.dom.list) this.dom.list.innerHTML = '<div style="color:red; text-align:center">Error loading comments.</div>';
            }
        }

        renderList(comments, container, isThread = false) {
            if(!container) return;
            container.innerHTML = '';
            if (!comments || comments.length === 0) {
                container.innerHTML = '<div style="color:#666; font-style:italic; text-align:center; padding:10px;">No comments yet.</div>';
                return;
            }
            comments.forEach(c => {
                container.appendChild(this.createCommentElement(c, isThread));
            });
        }

        createCommentElement(c, isThread) {
            const div = document.createElement('div');
            div.className = 'comment-item';
            div.id = `comment-${c.id}`;

            const authorId = c.user_id || c.author_id;
            const isAuthor = (this.currentUser && authorId === this.currentUser.id);
            const globalRef = `window['CommentSys_${this.containerId}']`;

            const ratingHtml = (this.mode === 'ALBUM' && c.user_album_rating > 0)
                ? `<span class="user-rating-badge">Rated ${c.user_album_rating}★</span>`
                : '';

            const editBtn = isAuthor
                ? `<span class="edit-btn-icon" onclick="${globalRef}.toggleEdit(${c.id})">✎ Edit</span>`
                : '';

            const editedLabel = (c.updated_at && c.updated_at !== c.created_at)
                ? `<span style="font-size:0.7em; color:#666; margin-left:5px;">(edited)</span>` : '';

            // Определяем ссылку на профиль
            const profileLink = c.username ? `/profile/${c.username}` : '#';

            div.innerHTML = `
                <a href="${profileLink}">
                    <img src="${c.profile_pic || '/uploads/avatars/default.png'}" class="user-avatar-small">
                </a>
                <div class="comment-content">
                    <div class="comment-meta">
                        <a href="${profileLink}" style="color:#fff;font-weight:bold;text-decoration:none;">${c.username || 'User'}</a>
                        ${ratingHtml}
                        <span>• ${new Date(c.created_at).toLocaleDateString()}</span>
                        ${editedLabel}
                        ${editBtn}
                    </div>

                    <div class="comment-text" id="text-${c.id}">${this.escapeHtml(c.content)}</div>

                    <div class="edit-wrapper" id="edit-box-${c.id}">
                        <textarea class="comment-textarea" id="edit-input-${c.id}">${this.escapeHtml(c.content)}</textarea>
                        <div class="edit-actions">
                            <button class="btn-cancel" onclick="${globalRef}.toggleEdit(${c.id})">Cancel</button>
                            <button class="btn-save" onclick="${globalRef}.saveEdit(${c.id})">Save</button>
                        </div>
                    </div>

                    <div class="comment-actions">
                        <div class="action-btn" onclick="${globalRef}.vote(${c.id}, this)">
                            <span>♥</span> <span class="likes-count">${c.likes_count || 0}</span>
                        </div>
                        ${!isThread ? `
                        <div class="action-btn" onclick="${globalRef}.openThread(${c.id})">
                            <span>💬</span> <span>${(c.replies_count > 0) ? c.replies_count + ' replies' : 'Reply'}</span>
                        </div>` : ''}
                    </div>
                </div>
            `;
            return div;
        }

        async postComment() {
            if(!this.dom.mainInput) return;
            const content = this.dom.mainInput.value;
            await this.send(content, null);
            this.dom.mainInput.value = '';
            this.loadComments(1);
        }

        async postReply() {
            if(!this.activeThreadId || !this.dom.threadInput) return;
            const content = this.dom.threadInput.value;
            await this.send(content, this.activeThreadId);
            this.dom.threadInput.value = '';
            this.openThread(this.activeThreadId);
            this.loadComments(this.currentPage);
        }

        async send(content, parentId) {
            if(!content.trim()) return;
            const token = localStorage.getItem('token');
            if(!token) return window.location.href = '/login.html';

            const api = this.getApiEndpoints();
            let body = { content, parentId };

            if(this.mode === 'ALBUM') body.albumId = this.entityId;

            try {
                await fetch(api.post, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify(body)
                });
            } catch(e) { console.error(e); alert('Error sending comment'); }
        }

        async vote(id, btn) {
            const token = localStorage.getItem('token');
            if(!token) return window.location.href = '/login.html';

            const api = this.getApiEndpoints();
            try {
                const res = await fetch(api.vote(id), {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if(res.ok) {
                    const data = await res.json();
                    const counter = btn.querySelector('.likes-count');
                    let current = parseInt(counter.textContent) || 0;
                    if(data.action === 'added') {
                        counter.textContent = current + 1;
                        btn.classList.add('liked');
                    } else {
                        counter.textContent = current - 1;
                        btn.classList.remove('liked');
                    }
                }
            } catch(e) { console.error(e); }
        }

        toggleEdit(id) {
            const text = document.getElementById(`text-${id}`);
            const box = document.getElementById(`edit-box-${id}`);
            if(box.classList.contains('active')) {
                box.classList.remove('active'); text.classList.remove('hidden');
            } else {
                box.classList.add('active'); text.classList.add('hidden');
            }
        }

        async saveEdit(id) {
            const token = localStorage.getItem('token');
            const newVal = document.getElementById(`edit-input-${id}`).value;
            const api = this.getApiEndpoints();

            try {
                const res = await fetch(api.edit(id), {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ content: newVal })
                });
                if(res.ok) {
                    const data = await res.json();
                    document.getElementById(`text-${id}`).innerHTML = this.escapeHtml(data.content);
                    this.toggleEdit(id);
                }
            } catch(e) { console.error(e); }
        }

        async openThread(parentId) {
            this.activeThreadId = parentId;
            if(this.dom.threadOverlay) this.dom.threadOverlay.style.display = 'flex';
            document.body.style.overflow = 'hidden';
            if(this.dom.threadContent) this.dom.threadContent.innerHTML = 'Loading...';

            const api = this.getApiEndpoints();
            try {
                const res = await fetch(api.fetchThread(parentId));
                const replies = await res.json();
                this.renderList(replies, this.dom.threadContent, true);
            } catch(e) { console.error(e); }
        }

        closeThread() {
            if(this.dom.threadOverlay) this.dom.threadOverlay.style.display = 'none';
            document.body.style.overflow = 'auto';
            this.activeThreadId = null;
        }

        renderPagination(curr, total) {
            const p = this.dom.pagination;
            if(!p) return;
            p.innerHTML = '';
            if(total <= 1) return;
            for(let i=1; i<=total; i++) {
                const btn = document.createElement('button');
                btn.className = `page-btn ${i===curr ? 'active' : ''}`;
                btn.textContent = i;
                btn.onclick = () => this.loadComments(i);
                p.appendChild(btn);
            }
        }

        parseJwt(token) {
            try {
                const base64Url = token.split('.')[1];
                const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
                const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
                    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
                }).join(''));
                return JSON.parse(jsonPayload);
            } catch (e) { return null; }
        }

        escapeHtml(text) {
            if(!text) return '';
            return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
        }
    };
})();