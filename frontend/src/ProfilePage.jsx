import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';
import Cropper from 'react-easy-crop';

const getCroppedImg = async (imageSrc, pixelCrop) => {
    try {
        const image = new Image();
        image.src = imageSrc;
        await new Promise((resolve, reject) => {
            image.onload = resolve;
            image.onerror = reject;
        });

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) return null;

        canvas.width = pixelCrop.width;
        canvas.height = pixelCrop.height;

        ctx.drawImage(
            image,
            pixelCrop.x, pixelCrop.y,
            pixelCrop.width, pixelCrop.height,
            0, 0,
            pixelCrop.width, pixelCrop.height
        );

        return new Promise((resolve) => {
            canvas.toBlob((blob) => resolve(blob), 'image/jpeg');
        });
    } catch (e) {
        console.error("Błąd w getCroppedImg:", e);
        return null;
    }
};

const ProfilePage = () => {
    const [user, setUser] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState({ first_name: '', last_name: '', description: '' });

    const [imageToCrop, setImageToCrop] = useState(null);
    const [cropType, setCropType] = useState(null);
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

    const [twoFactorData, setTwoFactorData] = useState(null);
    const [totpCode, setTotpCode] = useState('');
    const [msg, setMsg] = useState({ text: '', type: '' });
    const [passwords, setPasswords] = useState({ current: '', next: '' });
    const [passMsg, setPassMsg] = useState('');
    const [entropy, setEntropy] = useState(0);

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const token = localStorage.getItem('token');
                if (!token) { window.location.href = '/'; return; }
                const res = await axios.get('/api/users/me', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                setUser(res.data);
                setFormData({
                    first_name: res.data.first_name || '',
                    last_name: res.data.last_name || '',
                    description: res.data.description || ''
                });
            } catch (err) {
                console.error("Błąd AXIOS:", err);
                if (err.response?.status === 401) window.location.href = '/';
                setMsg({ text: "Błąd połączenia z serwerem!", type: "error" });
            }
        };
        fetchProfile();
    }, []);

    useEffect(() => {
        if (!passwords.next) { setEntropy(0); return; }
        const pwd = passwords.next;
        let size = 0;
        if (/[a-z]/.test(pwd)) size += 26;
        if (/[A-Z]/.test(pwd)) size += 26;
        if (/[0-9]/.test(pwd)) size += 10;
        if (/[^a-zA-Z0-9]/.test(pwd)) size += 32;

        if (size > 0) {
            const e = Math.round(pwd.length * Math.log2(size));
            setEntropy(isNaN(e) ? 0 : e);
        }
    }, [passwords.next]);

    const onFileChange = (e, type) => {
        if (e.target.files && e.target.files.length > 0) {
            setCropType(type);
            const reader = new FileReader();
            reader.onload = () => setImageToCrop(reader.result);
            reader.readAsDataURL(e.target.files[0]);
        }
    };

    const onCropComplete = useCallback((_area, pixels) => {
        setCroppedAreaPixels(pixels);
    }, []);

    const handleCropSave = async () => {
        if (!croppedAreaPixels || !imageToCrop) return;
        try {
            const blob = await getCroppedImg(imageToCrop, croppedAreaPixels);
            if (!blob) return;
            const file = new File([blob], "upload.jpg", { type: "image/jpeg" });
            const data = new FormData();
            data.append(cropType === 'avatar' ? 'avatar' : 'banner', file);

            const token = localStorage.getItem('token');
            const endpoint = cropType === 'avatar' ? '/api/users/upload-avatar' : '/api/users/upload-banner';

            await axios.post(endpoint, data, { headers: { Authorization: `Bearer ${token}` } });
            setImageToCrop(null);
            window.location.reload();
        } catch (e) {
            console.error(e);
            setMsg({ text: "Błąd zapisu zdjęcia", type: "error" });
        }
    };

    if (!user) {
        return (
            <div className="flex flex-col h-screen items-center justify-center bg-gray-50">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                <p className="font-bold text-gray-500">Ładowanie profilu i systemów bezpieczeństwa...</p>
                <p className="text-xs text-red-400 mt-2">Upewnij się, że serwer Node.js (port 3000) działa.</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#f0f2f5] py-10 px-4">
            {imageToCrop && (
                <div className="fixed inset-0 z-[999] bg-black/95 flex flex-col items-center justify-center p-4">
                    <div className="relative w-full max-w-2xl h-[400px] bg-gray-900 rounded-xl overflow-hidden">
                        <Cropper
                            image={imageToCrop}
                            crop={crop}
                            zoom={zoom}
                            aspect={cropType === 'avatar' ? 1 : 16 / 6}
                            onCropChange={setCrop}
                            onZoomChange={setZoom}
                            onCropComplete={onCropComplete}
                        />
                    </div>
                    <div className="mt-6 w-full max-w-sm flex flex-col gap-4">
                        <input type="range" value={zoom} min={1} max={3} step={0.1} onChange={(e) => setZoom(e.target.value)} className="w-full" />
                        <div className="flex gap-2">
                            <button onClick={handleCropSave} className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold">Zapisz zdjęcie</button>
                            <button onClick={() => setImageToCrop(null)} className="flex-1 bg-gray-700 text-white py-3 rounded-xl font-bold">Anuluj</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="max-w-4xl mx-auto space-y-6">
                <div className="bg-white rounded-3xl shadow-xl overflow-hidden relative border border-gray-100">
                    <label className="block h-64 w-full relative group cursor-pointer bg-gray-100">
                        <input type="file" hidden accept="image/*" onChange={(e) => onFileChange(e, 'banner')} />
                        <img
                            src={user.banner_pic ? `http://localhost:3000${user.banner_pic}` : 'https://images.unsplash.com/photo-1557683316-973673baf926'}
                            className="w-full h-full object-cover"
                            alt="banner"
                        />
                        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white font-bold backdrop-blur-sm">Zmień banner</div>
                    </label>

                    <div className="px-8 pb-8">
                        <div className="relative flex justify-between items-end -mt-20">
                            <label className="relative group cursor-pointer z-10">
                                <input type="file" hidden accept="image/*" onChange={(e) => onFileChange(e, 'avatar')} />
                                <img
                                    src={user.profile_pic ? `http://localhost:3000${user.profile_pic}` : 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}
                                    className="w-40 h-40 rounded-3xl border-8 border-white shadow-2xl object-cover bg-white"
                                    alt="avatar"
                                />
                                <div className="absolute inset-0 bg-black/40 rounded-3xl opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[10px] font-bold uppercase">Zmień foto</div>
                            </label>

                            <div className="flex gap-2 mb-2">
                                <button
                                    onClick={async () => {
                                        if (isEditing) {
                                            const token = localStorage.getItem('token');
                                            await axios.put('/api/users/update', formData, { headers: { Authorization: `Bearer ${token}` } });
                                            setIsEditing(false);
                                            setMsg({ text: 'Zapisano!', type: 'success' });
                                        } else setIsEditing(true);
                                    }}
                                    className={`px-6 py-2 rounded-xl font-bold ${isEditing ? 'bg-green-600 text-white' : 'bg-gray-900 text-white'}`}
                                >
                                    {isEditing ? 'Zapisz dane' : 'Edytuj profil'}
                                </button>
                                <button onClick={() => {localStorage.clear(); window.location.href='/';}} className="px-4 py-2 text-red-500 font-bold hover:bg-red-50 rounded-xl transition">Wyloguj</button>
                            </div>
                        </div>
                        <div className="mt-4">
                            <h1 className="text-3xl font-black text-gray-900">{user.first_name ? `${user.first_name} ${user.last_name}` : user.username}</h1>
                            <p className="text-gray-500">@{user.username} • {user.email}</p>
                        </div>
                    </div>
                </div>

                <div className="grid md:grid-cols-3 gap-6">
                    <div className="md:col-span-2 space-y-6">
                        <div className="bg-white p-8 rounded-3xl shadow-lg border">
                            <h2 className="text-xl font-bold mb-6 flex items-center"><span className="w-2 h-6 bg-blue-600 rounded-full mr-3"></span>Dane osobowe</h2>
                            <div className="grid grid-cols-2 gap-4">
                                <input disabled={!isEditing} className="p-3 bg-gray-50 border rounded-xl outline-none" value={formData.first_name} onChange={e => setFormData({...formData, first_name: e.target.value})} placeholder="Imię" />
                                <input disabled={!isEditing} className="p-3 bg-gray-50 border rounded-xl outline-none" value={formData.last_name} onChange={e => setFormData({...formData, last_name: e.target.value})} placeholder="Nazwisko" />
                                <textarea disabled={!isEditing} className="col-span-2 p-3 bg-gray-50 border rounded-xl outline-none" rows="3" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Biogram" />
                            </div>
                        </div>

                        {isEditing && (
                            <div className="bg-white p-8 rounded-3xl shadow-lg border-2 border-blue-50">
                                <h2 className="text-lg font-bold mb-4 text-blue-600">🛡️ Zmiana hasła (ASVS 4.0)</h2>
                                <form className="space-y-4" onSubmit={async (e) => {
                                    e.preventDefault();
                                    try {
                                        const token = localStorage.getItem('token');
                                        await axios.put('/api/users/change-password', { currentPassword: passwords.current, newPassword: passwords.next }, { headers: { Authorization: `Bearer ${token}` } });
                                        setPassMsg('Hasło zmienione!');
                                        setPasswords({current:'', next:''});
                                    } catch (err) { setPassMsg(err.response?.data?.error || 'Błąd'); }
                                }}>
                                    <div className="grid grid-cols-2 gap-4">
                                        <input type="password" placeholder="Stare hasło" className="p-3 bg-gray-50 border rounded-xl outline-none" value={passwords.current} onChange={e => setPasswords({...passwords, current: e.target.value})} required />
                                        <div className="space-y-2">
                                            <input type="password" placeholder="Nowe (min. 12 znaków)" className="w-full p-3 bg-gray-50 border rounded-xl outline-none" value={passwords.next} onChange={e => setPasswords({...passwords, next: e.target.value})} required />
                                            {passwords.next && (
                                                <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                                                    <div className={`h-full transition-all ${entropy < 50 ? 'bg-red-500' : entropy < 85 ? 'bg-yellow-500' : 'bg-green-500'}`} style={{width: `${Math.min(entropy, 100)}%`}}></div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <button type="submit" className="bg-blue-600 text-white px-8 py-2 rounded-xl font-bold">Zaktualizuj hasło</button>
                                        <span className="text-sm font-bold text-blue-500">{passMsg}</span>
                                    </div>
                                </form>
                            </div>
                        )}
                    </div>

                    <div className="bg-white p-8 rounded-3xl shadow-lg border h-fit">
                        <h2 className="text-xl font-bold mb-4 text-indigo-600">🛡️ Autoryzacja 2FA</h2>
                        <div className={`p-4 rounded-2xl text-center font-black text-[10px] mb-6 ${user.two_factor_enabled ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {user.two_factor_enabled ? 'TOTP AKTYWNE' : '2FA NIEAKTYWNE'}
                        </div>

                        {user.two_factor_enabled ? (
                            <button onClick={async () => {
                                if(window.confirm("Wyłączyć 2FA?")){
                                    const token = localStorage.getItem('token');
                                    await axios.post('/api/auth/2fa/disable', {}, { headers: { Authorization: `Bearer ${token}` } });
                                    window.location.reload();
                                }
                            }} className="w-full bg-red-50 text-red-600 font-bold py-3 rounded-2xl transition hover:bg-red-600 hover:text-white">Wyłącz 2FA</button>
                        ) : (
                            !twoFactorData ? (
                                <button onClick={async () => {
                                    const token = localStorage.getItem('token');
                                    const res = await axios.post('/api/auth/2fa/setup', {}, { headers: { Authorization: `Bearer ${token}` } });
                                    setTwoFactorData(res.data);
                                }} className="w-full bg-indigo-600 text-white font-bold py-3 rounded-2xl">Aktywuj TOTP</button>
                            ) : (
                                <div className="text-center space-y-4">
                                    <div className="bg-white p-2 border rounded-xl inline-block shadow-inner">
                                        <QRCodeSVG value={twoFactorData.otpauth_url} size={150} />
                                    </div>
                                    <input type="text" maxLength="6" placeholder="KOD" className="w-full p-3 text-center text-2xl font-black bg-gray-50 border rounded-2xl" onChange={(e) => setTotpCode(e.target.value)} />
                                    <button onClick={async () => {
                                        try {
                                            const token = localStorage.getItem('token');
                                            await axios.post('/api/auth/2fa/verify', { token: totpCode }, { headers: { Authorization: `Bearer ${token}` } });
                                            window.location.reload();
                                        } catch { alert("Błędny kod!"); }
                                    }} className="w-full bg-indigo-600 text-white font-bold py-3 rounded-2xl">Potwierdź</button>
                                </div>
                            )
                        )}
                    </div>
                </div>
            </div>
            {msg.text && <div className={`fixed bottom-6 right-6 px-8 py-4 rounded-xl text-white font-bold ${msg.type === 'success' ? 'bg-green-500' : 'bg-red-500'} animate-bounce`}>{msg.text}</div>}
        </div>
    );
};

export default ProfilePage;