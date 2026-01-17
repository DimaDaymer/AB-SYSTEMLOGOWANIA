document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    if (!token) { window.location.href = '/login.html'; return; }

    const form = document.getElementById('editProfileForm');
    const msg = document.getElementById('updateMessage');
    const socialContainer = document.getElementById('social-inputs-container');
    const addSocialBtn = document.getElementById('add-social-btn');

    // Переменная для хранения ссылки на текущий аватар
    let currentProfilePic = null;

    // --- ФУНКЦИИ ДЛЯ РАБОТЫ С ПОЛЯМИ СОЦСЕТЕЙ ---
    function createSocialRow(platform = '', link = '') {
        const row = document.createElement('div');
        row.className = 'social-row';
        row.innerHTML = `
        <input type="text" placeholder="Platforma" class="form-control social-platform" value="${platform}">
        <input type="text" placeholder="Link (url)" class="form-control social-link" value="${link}">
        <button type="button" class="remove-social-btn" title="Usuń">
            <i class="fas fa-trash-alt"></i> 
        </button>
    `;
        row.querySelector('.remove-social-btn').onclick = () => row.remove();
        return row;
    }

    addSocialBtn.onclick = () => socialContainer.appendChild(createSocialRow());

    function getSocialDataAsObject() {
        const rows = socialContainer.querySelectorAll('.social-row');
        const socialObj = {};
        rows.forEach(row => {
            const platform = row.querySelector('.social-platform').value.trim();
            const link = row.querySelector('.social-link').value.trim();
            if (platform && link) socialObj[platform] = link;
        });
        return socialObj;
    }

    // --- 1. ЗАГРУЗКА ДАННЫХ ---
    try {
        const res = await fetch('/api/users/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const user = await res.json();

        if (res.ok) {
            // Сохраняем фото профиля, чтобы отправить его обратно при сохранении
            currentProfilePic = user.profile_pic || null;

            document.getElementById('firstName').value = user.first_name || '';
            document.getElementById('lastName').value = user.last_name || '';
            if (user.birth_date) {
                document.getElementById('birthDate').value = user.birth_date.split('T')[0];
            }
            document.getElementById('gender').value = user.gender || '';
            document.getElementById('location').value = user.location || '';
            document.getElementById('country').value = user.country || '';
            document.getElementById('contactEmail').value = user.contact_email || '';
            document.getElementById('description').value = user.description || '';
            document.getElementById('music').value = user.music || '';
            document.getElementById('movies').value = user.movies || '';

            if (user.social) {
                let socialData = user.social;
                if (typeof socialData === 'string') {
                    try { socialData = JSON.parse(socialData); } catch(e) { socialData = {}; }
                }
                Object.entries(socialData).forEach(([p, l]) => socialContainer.appendChild(createSocialRow(p, l)));
            }
            if (socialContainer.children.length === 0) socialContainer.appendChild(createSocialRow());
        }
    } catch (e) { console.error("Błąd ładowania danych", e); }

    // --- 2. СОХРАНЕНИЕ ---
    form.onsubmit = async (e) => {
        e.preventDefault();

        const formData = {
            firstName: document.getElementById('firstName').value,
            lastName: document.getElementById('lastName').value,
            birthDate: document.getElementById('birthDate').value || null,
            gender: document.getElementById('gender').value,
            location: document.getElementById('location').value,
            country: document.getElementById('country').value,
            social: getSocialDataAsObject(),
            contactEmail: document.getElementById('contactEmail').value,
            description: document.getElementById('description').value,
            music: document.getElementById('music').value,
            movies: document.getElementById('movies').value,
            profilePic: currentProfilePic // Теперь поле отправляется и бэкенд не выдаст 500
        };

        try {
            const res = await fetch('/api/users/profile/update', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(formData)
            });

            if (res.ok) {
                msg.textContent = "Profil został zaktualizowany!";
                msg.style.color = "green";
                setTimeout(() => window.location.href = 'profile.html', 1000);
            } else {
                const errData = await res.json();
                msg.textContent = "Błąd: " + (errData.error || "Nie udało się zaktualizować");
                msg.style.color = "red";
            }
        } catch (err) {
            msg.textContent = "Błąd serwera";
            msg.style.color = "red";
        }
    };
});