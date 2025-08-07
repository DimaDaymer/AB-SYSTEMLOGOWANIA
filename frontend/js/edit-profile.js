// frontend/js/edit-profile.js

document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    const username = localStorage.getItem('username');
    const form = document.getElementById('editProfileForm');
    const updateMessage = document.getElementById('updateMessage');

    if (!token || !username) {
        window.location.href = '/login.html';
        return;
    }

    fetch(`/user/profile?username=${username}`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    })
        .then(res => res.json())
        .then(data => {
            if (data) {
                document.getElementById('firstName').value = data.firstName || '';
                document.getElementById('lastName').value = data.lastName || '';
                document.getElementById('birthDate').value = data.birthDate || '';
                document.getElementById('gender').value = data.gender || '';
                document.getElementById('location').value = data.location || '';
                document.getElementById('country').value = data.country || '';
                document.getElementById('social').value = data.social || '';
                document.getElementById('contactEmail').value = data.contactEmail || '';
                document.getElementById('description').value = data.description || '';
                document.getElementById('music').value = data.music || '';
                document.getElementById('movies').value = data.movies || '';
            }
        });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const profileData = {
            firstName: document.getElementById('firstName').value,
            lastName: document.getElementById('lastName').value,
            birthDate: document.getElementById('birthDate').value,
            gender: document.getElementById('gender').value,
            location: document.getElementById('location').value,
            country: document.getElementById('country').value,
            social: document.getElementById('social').value,
            contactEmail: document.getElementById('contactEmail').value,
            description: document.getElementById('description').value,
            music: document.getElementById('music').value,
            movies: document.getElementById('movies').value
        };

        try {
            const res = await fetch(`/user/profile/update`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(profileData)
            });

            const result = await res.json();
            if (res.ok) {
                updateMessage.textContent = 'Profile updated successfully.';
            } else {
                updateMessage.textContent = result.error || 'Update failed.';
            }
        } catch (err) {
            updateMessage.textContent = 'Error updating profile.';
        }
    });
});
