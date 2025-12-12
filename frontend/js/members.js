// public/js/members.js
(function() {
    let currentHostArtistId = null;
    let currentHostArtistType = 'group'; // 'solo' or 'group'
    let isAdminUser = false;

    // Главная функция инициализации
    window.initMembersModule = async function(artistId, artistType = 'group') {
        currentHostArtistId = artistId;
        currentHostArtistType = artistType;

        // Логика смены заголовков
        const titleEl = document.getElementById('members-module-title');
        const inputNameEl = document.getElementById('member-artist-input');
        const btnAddEl = document.getElementById('btn-add-member');

        if (currentHostArtistType === 'solo') {
            if (titleEl) titleEl.textContent = 'Appears in Groups';
            if (inputNameEl) inputNameEl.placeholder = 'Group Name (e.g. The Beatles)...';
            if (btnAddEl) btnAddEl.textContent = 'Add Group';
        } else {
            if (titleEl) titleEl.textContent = 'Members';
            if (inputNameEl) inputNameEl.placeholder = 'Artist Name...';
            if (btnAddEl) btnAddEl.textContent = 'Add Member';
        }

        await checkAdmin();
        loadMembers();
        setupEditor();
    };

    async function checkAdmin() {
        const token = localStorage.getItem('token');
        if (!token) return;
        try {
            const res = await fetch('/api/users/me', { headers: { 'Authorization': `Bearer ${token}` }});
            if (res.ok) {
                const user = await res.json();
                if (user.role === 'admin') {
                    isAdminUser = true;
                    const editBtn = document.getElementById('btn-edit-members');
                    if(editBtn) {
                        editBtn.style.display = 'block';
                        editBtn.onclick = toggleEditor;
                    }
                }
            }
        } catch (e) { console.error(e); }
    }

    function toggleEditor() {
        const editor = document.getElementById('members-editor');
        if(editor) editor.style.display = editor.style.display === 'none' ? 'block' : 'none';
    }

    async function loadMembers() {
        const listContainer = document.getElementById('members-list');
        if(!listContainer || !currentHostArtistId) return;

        try {
            const mode = currentHostArtistType === 'solo' ? 'groups' : 'members';
            const res = await fetch(`/api/members/related/${currentHostArtistId}?mode=${mode}`);

            if (!res.ok) throw new Error(`Server returned ${res.status}`);

            const rawData = await res.json();

            listContainer.innerHTML = '';
            if (rawData.length === 0) {
                listContainer.innerHTML = '<div style="color:#888; font-style:italic; padding:5px;">None listed.</div>';
                return;
            }

            // === ЛОГИКА ГРУППИРОВКИ ===
            const groupedData = {};

            rawData.forEach(item => {
                // Ключ для группировки: ID артиста + Роль (например, "5_Гитарист")
                const key = `${item.target_id}_${item.role_name}`;

                if (!groupedData[key]) {
                    groupedData[key] = {
                        target_name: item.target_name,
                        target_slug: item.target_slug,
                        role_name: item.role_name,
                        periods: [] // Здесь будем хранить все периоды
                    };
                }

                // Добавляем ID связи (для удаления) и период
                groupedData[key].periods.push({
                    id: item.id,
                    start_year: item.start_year,
                    end_year: item.end_year
                });
            });

            // Сортировка периодов внутри каждой группы по начальному году
            Object.values(groupedData).forEach(group => {
                group.periods.sort((a, b) => (a.start_year || Infinity) - (b.start_year || Infinity));
            });

            // === РЕНДЕРИНГ ГРУППИРОВАННЫХ ДАННЫХ ===
            Object.values(groupedData).forEach(group => {
                const div = document.createElement('div');
                div.className = 'member-item';

                // Формируем строку с периодами: (1990 - 2000), (2003 - 2010)
                const periodsString = group.periods.map(p => {
                    let period = '';
                    if (p.start_year) {
                        period = `${p.start_year}`;
                        if (p.end_year) period += ` - ${p.end_year}`;
                        else period += ' - Present';
                    }
                    return period ? `(${period})` : '';
                }).filter(s => s).join(', ');

                // Собираем все ID записей artist_members для этой группы
                const idsToDelete = group.periods.map(p => p.id);

                div.innerHTML = `
                    <span class="member-role">${group.role_name || ''}</span>
                    <span class="member-artist">
                        <a href="/artist/${group.target_slug}">${group.target_name}</a>
                        <span class="member-period">${periodsString}</span>
                    </span>
                    ${isAdminUser ? `<button class="delete-member-btn" 
                                            data-ids="${idsToDelete.join(',')}" 
                                            onclick="window.deleteMemberGroup(this)">×</button>` : ''}
                `;
                listContainer.appendChild(div);
            });

        } catch (e) {
            console.error('Error loading members:', e);
            listContainer.innerHTML = '<div style="color:red; font-size:0.8em;">Error loading data.</div>';
        }
    }

    // === НОВАЯ ФУНКЦИЯ ДЛЯ УДАЛЕНИЯ ГРУППЫ СВЯЗЕЙ ===
    // Удаляет ВСЕ записи artist_members, соответствующие артисту и роли.
    window.deleteMemberGroup = async function(buttonElement) {
        const idsString = buttonElement.getAttribute('data-ids');
        // Преобразуем строку с ID в массив чисел
        const ids = idsString.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));

        if (ids.length === 0) return;

        if (!confirm(`Remove ${ids.length} relations? This will delete ALL periods for this member and role.`)) return;

        const token = localStorage.getItem('token');

        let allSuccessful = true;
        // Удаляем каждую запись по отдельности
        for (const id of ids) {
            try {
                const res = await fetch(`/api/members/${id}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!res.ok) {
                    allSuccessful = false;
                    console.error(`Failed to delete ID ${id}`);
                }
            } catch (e) {
                allSuccessful = false;
                console.error(`Request failed for ID ${id}:`, e);
            }
        }

        if (allSuccessful) {
            loadMembers(); // Обновляем список
        } else {
            alert('Some deletions failed. The list will be refreshed to show remaining entries.');
            loadMembers(); // Обновляем список, чтобы показать, что осталось
        }
    };


    function setupEditor() {
        const btnAdd = document.getElementById('btn-add-member');
        const btnClose = document.getElementById('btn-close-editor');
        const artistInput = document.getElementById('member-artist-input');
        const artistSuggestions = document.getElementById('artist-suggestions');
        const roleInput = document.getElementById('member-role-input');
        const roleSuggestions = document.getElementById('role-suggestions');

        // Инициализация автодополнения для Артиста/Группы и Роли
        if (typeof window.Autocomplete !== 'undefined') {
            // Предполагаем, что класс Autocomplete определен глобально
            new Autocomplete(artistInput, artistSuggestions, '/api/members/autocomplete/artist');
            new Autocomplete(roleInput, roleSuggestions, '/api/members/autocomplete/role');
        } else {
            console.warn('Autocomplete class not found. Did you include autocomplete.js?');
        }

        if(btnClose) btnClose.onclick = () => document.getElementById('members-editor').style.display = 'none';

        if(btnAdd) {
            // Удаляем старые обработчики, клонируя кнопку
            const newBtn = btnAdd.cloneNode(true);
            btnAdd.parentNode.replaceChild(newBtn, btnAdd);

            newBtn.onclick = async () => {
                const startInput = document.getElementById('member-start-year-input');
                const endInput = document.getElementById('member-end-year-input');

                const targetName = artistInput.value.trim();
                const roleName = roleInput.value.trim();

                if (!targetName || !roleName) {
                    alert('Please enter Name and Role');
                    return;
                }

                const token = localStorage.getItem('token');
                try {
                    const res = await fetch('/api/members', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({
                            hostArtistId: currentHostArtistId,
                            hostType: currentHostArtistType, // Отправляем тип!
                            targetName: targetName,
                            roleName: roleName,
                            startYear: startInput.value || null,
                            endYear: endInput.value || null
                        })
                    });

                    if (res.ok) {
                        artistInput.value = '';
                        roleInput.value = '';
                        startInput.value = '';
                        endInput.value = '';
                        loadMembers();
                    } else {
                        const err = await res.json();
                        alert('Error: ' + err.error);
                    }
                } catch (e) {
                    console.error(e);
                    alert('Request failed');
                }
            };
        }
    }
})();