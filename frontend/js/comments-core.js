/* frontend/js/comments-core.js */

(function() {
    if (window.CommentsCore) return;

    window.CommentsCore = class {
        constructor(config) {
            this.mode = config.mode;
            this.entityId = config.entityId;
            this.containerId = config.containerId;
            this.currentUser = this.parseJwt(localStorage.getItem('token'));
            this.currentPage = 1;
            this.activeThreadId = null;
            this.limit = 5; // Фиксированный лимит для комментариев

            if (!this.entityId) return console.error("CommentsCore Error: entityId missing!");

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
            if (!this.dom.root) return console.error(`Container #${this.containerId} not found`);
            if (this.dom.postBtn) this.dom.postBtn.onclick = () => this.postComment();
            if (this.dom.sort) this.dom.sort.onchange = () => this.loadComments(1);
            if(this.dom.threadCloseBtn) this.dom.threadCloseBtn.onclick = () => this.closeThread();
            window['CommentSys_' + this.containerId] = this;
            this.loadComments(1);
        }

        getApiEndpoints() {
            const type = this.mode.toLowerCase();
            return {
                fetchList: (page, sort) => `/api/reviews/${type}/${this.entityId}?page=${page}&limit=${this.limit}&sort=${sort}`,
                fetchThread: (parentId) => `/api/reviews/thread/${parentId}`,
                post: `/api/reviews/${type}`,
                edit: (id) => `/api/reviews/${type}/${id}`,
                vote: (id) => `/api/reviews/${type}/${id}/vote`,
                delete: (id) => `/api/reviews/${type}/${id}`
            };
        }

        async loadComments(page) {
            this.currentPage = page;
            const sort = this.dom.sort ? this.dom.sort.value : 'newest';
            const api = this.getApiEndpoints();

            if (this.dom.list) this.dom.list.innerHTML = '<div style="padding:20px; text-align:center;">Loading...</div>';

            try {
                const res = await fetch(api.fetchList(page, sort));
                if (!res.ok) throw new Error((await res.json()).error || "API Error");
                const data = await res.json();

                this.renderList(data.comments, this.dom.list);

                if (window.PaginationUtils && this.dom.pagination) {
                    window.PaginationUtils.render(
                        this.dom.pagination,
                        {
                            page: data.page,
                            total_pages: data.totalPages,
                            total: data.total,
                            limit: this.limit
                        },
                        (p) => this.loadComments(p),
                        {
                            scrollToTop: false,
                            showInfo: true
                        }
                    );
                } else {
                    this.renderPaginationFallback(data.page, data.totalPages);
                }

            } catch (e) {
                console.error(e);
                if (this.dom.list) this.dom.list.innerHTML = `<div style="color:red; text-align:center;">Error: ${e.message}</div>`;
            }
        }

        renderList(comments, container, isThread = false) {
            container.innerHTML = '';
            if (!comments || comments.length === 0) {
                if (!isThread) container.innerHTML = '<div style="padding:20px; text-align:center; color:#888;">No comments yet.</div>';
                return;
            }
            comments.forEach(c => container.appendChild(this.createCommentElement(c, isThread)));
        }

        createCommentElement(c, isThread) {
            const div = document.createElement('div');
            div.className = 'comment-item' + (isThread && c.id !== this.activeThreadId ? ' reply-item' : ' top-level-comment');
            div.id = `comment-${c.id}`;

            const authorId = c.user_id;
            const isAuthor = (this.currentUser && authorId === this.currentUser.id);
            const globalRef = `window['CommentSys_${this.containerId}']`;
            const ratingVal = c.user_rating || 0;
            const ratingHtml = (ratingVal > 0) ? `<span class="user-rating-badge" style="background:#444; color:#fb0; padding:2px 6px; border-radius:4px; font-size:0.8em; margin-left:8px;">★ ${ratingVal}</span>` : '';

            let actionBtns = '';
            if (isAuthor) {
                actionBtns = `
                    <span style="cursor:pointer; margin-left:10px; font-size:0.9em; opacity:0.7;" onclick="${globalRef}.toggleEdit(${c.id})">✎</span>
                    <span style="cursor:pointer; margin-left:8px; font-size:0.9em; opacity:0.7; color:#ff4d4d;" onclick="${globalRef}.deleteComment(${c.id})">🗑</span>
                `;
            }

            const avatarUrl = c.profile_pic || '/uploads/avatars/default.png';
            const replyButton = `<div style="cursor:pointer;" onclick="${globalRef}.openThread(${c.id})"><span>💬</span> <span id="replies-count-${c.id}">${(c.replies_count > 0) ? c.replies_count + ' replies' : 'Reply'}</span></div>`;
            const threadReplyButton = `<div style="cursor:pointer;" onclick="${globalRef}.toggleReplyForm(${c.id})"><span>💬</span> Reply</div>`;

            const nestedContainer = `<div id="nested-replies-container-${c.id}" class="nested-replies-container"></div>`;
            const replyForm = `<div id="reply-form-container-${c.id}" class="reply-form-container" style="margin-top: 10px; display:none;"><textarea id="reply-input-${c.id}" class="comment-textarea" placeholder="Write a reply..." style="width:100%; min-height:40px; background:#222; color:#fff; border:1px solid #444; padding:5px;"></textarea><button onclick="${globalRef}.postNestedReply(${c.id})" style="padding:4px 10px; background:#007bff; border:none; color:#fff; cursor:pointer; margin-top: 5px;">Post Reply</button><button onclick="${globalRef}.toggleReplyForm(${c.id})" style="padding:4px 10px; background:#555; border:none; color:#fff; cursor:pointer; margin-left: 5px;">Cancel</button></div>`;

            let controls;
            let showNested = '';

            if (isThread) {
                if (c.id === this.activeThreadId) {
                    controls = replyButton;
                } else {
                    const repliesCountText = (c.replies_count > 0) ? `${c.replies_count} more replies` : 'Show replies';
                    showNested = (c.replies_count > 0) ? `<div class="show-replies-btn" style="cursor:pointer;" onclick="${globalRef}.openNestedThread(${c.id}, this)"><span>${repliesCountText}</span></div>` : '';
                    controls = threadReplyButton + showNested;
                }
            } else {
                controls = replyButton;
            }

            const nestedContent = `${(isThread && c.id !== this.activeThreadId) ? replyForm : ''}${(isThread && c.id !== this.activeThreadId) ? nestedContainer : ''}`;

            div.innerHTML = `
                <div class="comment-content-container" style="display:flex; gap:10px;">
                    <a href="/user/${c.username}"><img src="${avatarUrl}" class="user-avatar-small" style="width:40px; height:40px; border-radius:50%; object-fit: cover;"></a>
                    <div class="comment-body-wrapper" style="flex:1;">
                        <div style="margin-bottom:5px;">
                            <a href="/user/${c.username}" style="color:#eee; font-weight:bold; text-decoration:none;">${c.username || 'User'}</a>
                            ${ratingHtml}
                            <span style="color:#888; font-size:0.8em; margin-left:8px;">• ${new Date(c.created_at).toLocaleDateString()}</span>
                            ${actionBtns}
                        </div>
                        <div id="text-${c.id}" style="white-space:pre-wrap; color:#ddd; font-size: 0.95em;">${this.escapeHtml(c.content)}</div>
                        <div id="edit-box-${c.id}" style="display:none; margin-top:10px;">
                            <textarea id="edit-input-${c.id}" class="comment-textarea" style="width:100%; min-height:60px; background:#222; color:#fff; border:1px solid #444; padding:5px;">${this.escapeHtml(c.content)}</textarea>
                            <div style="margin-top:5px;"><button onclick="${globalRef}.toggleEdit(${c.id})" style="padding:4px 10px; background:#555; border:none; color:#fff; margin-right: 5px;">Cancel</button><button onclick="${globalRef}.saveEdit(${c.id})" style="padding:4px 10px; background:#007bff; border:none; color:#fff;">Save</button></div>
                        </div>
                        <div style="margin-top:8px; display:flex; gap:15px; font-size:0.9em; color:#aaa;">
                            <div style="cursor:pointer;" onclick="${globalRef}.vote(${c.id}, this)"><span>♥</span> <span class="likes-count">${c.likes_count || 0}</span></div>
                            ${controls}
                        </div>
                        ${nestedContent}
                    </div>
                </div>
            `;
            return div;
        }

        async deleteComment(id) {
            if (!confirm("Are you sure you want to delete this comment?")) return;
            const token = localStorage.getItem('token');
            try {
                const res = await fetch(this.getApiEndpoints().delete(id), {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    if (this.activeThreadId === id) this.closeThread();
                    this.loadComments(this.currentPage);
                }
            } catch (e) { console.error(e); }
        }

        toggleReplyForm(parentId) {
            const formContainer = document.getElementById(`reply-form-container-${parentId}`);
            if (formContainer) formContainer.style.display = formContainer.style.display === 'none' ? 'block' : 'none';
        }

        async postNestedReply(parentId) {
            const input = document.getElementById(`reply-input-${parentId}`);
            if (!input || !input.value.trim()) return;
            await this.send(input.value, parentId);
            input.value = '';
            this.toggleReplyForm(parentId);
            this.openNestedThread(parentId);
        }

        async openNestedThread(parentId, btn) {
            const container = document.getElementById(`nested-replies-container-${parentId}`);
            if (!container) return;
            if (container.children.length > 0 && container.getAttribute('data-loaded') === 'true') {
                container.innerHTML = '';
                container.removeAttribute('data-loaded');
                if (btn) btn.querySelector('span').innerText = `${container.dataset.count || 0} more replies`;
                return;
            }
            container.innerHTML = '<div style="padding:10px; text-align:center;">Loading...</div>';
            try {
                const res = await fetch(this.getApiEndpoints().fetchThread(parentId));
                const comments = await res.json();
                const replies = comments.filter(c => c.id != parseInt(parentId));
                container.dataset.count = replies.length;
                this.renderList(replies, container, true);
                container.setAttribute('data-loaded', 'true');
                if (btn) btn.querySelector('span').innerText = `Hide replies`;
            } catch (e) { container.innerHTML = 'Error'; }
        }

        async postComment() {
            if (!this.dom.mainInput || !this.dom.mainInput.value.trim()) return;
            await this.send(this.dom.mainInput.value, null);
            this.dom.mainInput.value = '';
            this.loadComments(1);
        }

        async send(content, parentId) {
            const token = localStorage.getItem('token');
            if (!token) return window.location.href = '/login.html';
            try {
                const res = await fetch(this.getApiEndpoints().post, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ content, parentId: parentId || null, entityId: parseInt(this.entityId) })
                });
                if (!res.ok) alert((await res.json()).error);
            } catch (e) { console.error(e); }
        }

        async vote(id, btn) {
            const token = localStorage.getItem('token');
            if (!token) return window.location.href = '/login.html';
            try {
                const res = await fetch(this.getApiEndpoints().vote(id), { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
                if (res.ok) {
                    const data = await res.json();
                    const counter = btn.querySelector('.likes-count');
                    let current = parseInt(counter.innerText) || 0;
                    counter.innerText = data.action === 'added' ? current + 1 : Math.max(0, current - 1);
                    btn.style.color = data.action === 'added' ? 'red' : '';
                }
            } catch (e) {}
        }

        toggleEdit(id) {
            const text = document.getElementById(`text-${id}`);
            const box = document.getElementById(`edit-box-${id}`);
            if (box.style.display === 'none') { box.style.display = 'block'; text.style.display = 'none'; }
            else { box.style.display = 'none'; text.style.display = 'block'; }
        }

        async saveEdit(id) {
            const newVal = document.getElementById(`edit-input-${id}`).value;
            const token = localStorage.getItem('token');
            try {
                const res = await fetch(this.getApiEndpoints().edit(id), {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ content: newVal })
                });
                if (res.ok) {
                    document.getElementById(`text-${id}`).innerText = (await res.json()).content;
                    this.toggleEdit(id);
                }
            } catch (e) {}
        }

        async openThread(parentId) {
            this.activeThreadId = parentId;
            if (this.dom.threadOverlay) this.dom.threadOverlay.style.display = 'flex';
            if (this.dom.threadContent) this.dom.threadContent.innerHTML = 'Loading...';
            if (this.dom.threadSendBtn) this.dom.threadSendBtn.onclick = async () => {
                if (!this.dom.threadInput.value.trim()) return;
                await this.send(this.dom.threadInput.value, this.activeThreadId);
                this.dom.threadInput.value = '';
                this.openThread(this.activeThreadId);
            };

            try {
                const res = await fetch(this.getApiEndpoints().fetchThread(parentId));
                const comments = await res.json();
                const mainCommentIndex = comments.findIndex(c => c.id === parseInt(parentId));
                let mainComment = null;
                if(mainCommentIndex !== -1) mainComment = comments.splice(mainCommentIndex, 1)[0];

                if(this.dom.threadContent) this.dom.threadContent.innerHTML = '';
                if(mainComment) {
                    const mainElem = this.createCommentElement(mainComment, true);
                    mainElem.className += ' main-thread-comment';
                    this.dom.threadContent.appendChild(mainElem);
                }
                const repliesWrapper = document.createElement('div');
                repliesWrapper.className = 'thread-replies-list-wrapper';
                this.dom.threadContent.appendChild(repliesWrapper);
                this.renderList(comments, repliesWrapper, true);
            } catch (e) { if (this.dom.threadContent) this.dom.threadContent.innerHTML = 'Error'; }
        }

        closeThread() {
            if (this.dom.threadOverlay) this.dom.threadOverlay.style.display = 'none';
        }

        renderPaginationFallback(curr, total) {
            const p = this.dom.pagination;
            if (!p) return;
            p.innerHTML = '';
            if (total <= 1) return;
            for (let i = 1; i <= total; i++) {
                const btn = document.createElement('button');
                btn.className = `page-btn ${i === curr ? 'active' : ''}`;
                btn.innerText = i;
                btn.onclick = () => this.loadComments(i);
                p.appendChild(btn);
            }
        }

        parseJwt(token) {
            try { return JSON.parse(decodeURIComponent(window.atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''))); } catch (e) { return null; }
        }

        escapeHtml(text) { return text ? text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;") : ''; }
    };
})();