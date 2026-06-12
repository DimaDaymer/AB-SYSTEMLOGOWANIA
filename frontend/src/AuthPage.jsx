import React, { useState, useEffect } from 'react';
import axios from 'axios';

const AuthPage = () => {
    const [isLogin, setIsLogin] = useState(true);
    const [formData, setFormData] = useState({ username: '', email: '', password: '', totpToken: '' });
    const [status, setStatus] = useState({ message: '', type: '' });
    const [show2FA, setShow2FA] = useState(false);
    const [entropy, setEntropy] = useState(0);

    const [showPassword, setShowPassword] = useState(false);

    useEffect(() => {
        if (!isLogin && formData.password) {
            const pwd = formData.password;
            let charsetSize = 0;
            if (/[a-z]/.test(pwd)) charsetSize += 26;
            if (/[A-Z]/.test(pwd)) charsetSize += 26;
            if (/[0-9]/.test(pwd)) charsetSize += 10;
            if (/[^a-zA-Z0-9]/.test(pwd)) charsetSize += 32;
            let res = pwd.length * (charsetSize > 0 ? Math.log2(charsetSize) : 0);

            if (/^\d+$/.test(pwd) || /^[a-z]+$/.test(pwd)) res -= 10;

            const uniqueChars = new Set(pwd).size;
            if (uniqueChars < pwd.length / 2) res -= 15;
            if (/(123|abc|qwerty|qwer|asdf)/i.test(pwd)) res -= 20;

            setEntropy(Math.max(0, Math.round(res)));
        }
    }, [formData.password, isLogin]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setStatus({ message: 'Procesowanie...', type: 'info' });

        try {
            const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
            const res = await axios.post(endpoint, formData);

            if (isLogin && res.status === 206) {
                setShow2FA(true);
                setStatus({ message: 'Wprowadź kod TOTP z aplikacji', type: 'info' });
                return;
            }

            if (isLogin) {
                localStorage.setItem('token', res.data.token);
                setStatus({ message: 'Zalogowano pomyślnie!', type: 'success' });
                window.location.href = '/profile';
            } else {
                setStatus({ message: 'Zarejestrowano! Możesz się zalogować.', type: 'success' });
                setIsLogin(true);
            }
        } catch (err) {
            setStatus({ message: err.response?.data?.error || 'Błąd serwera', type: 'error' });
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4 font-sans">
            <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8">
                <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">
                    {isLogin ? 'Logowanie do Systemu' : 'Rejestracja Użytkownika'}
                </h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <input
                        type="text"
                        placeholder="Nazwa użytkownika"
                        className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        onChange={(e) => setFormData({...formData, username: e.target.value})}
                        required
                    />

                    {!isLogin && (
                        <input
                            type="email"
                            placeholder="Email"
                            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            onChange={(e) => setFormData({...formData, email: e.target.value})}
                            required
                        />
                    )}

                    <div className="relative">
                        <input
                            type={showPassword ? "text" : "password"}
                            placeholder="Hasło (min. 12 znaków)"
                            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none pr-12"
                            onChange={(e) => setFormData({...formData, password: e.target.value})}
                            minLength="12"
                            required
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-3.5 text-gray-400 hover:text-blue-600 transition-colors"
                        >
                            {showPassword ? (
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.822 7.822L21 21m-2.228-2.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                                </svg>
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                            )}
                        </button>
                    </div>

                    {!isLogin && formData.password && (
                        <div className="space-y-1">
                            <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                                <div
                                    className={`h-full transition-all ${entropy < 50 ? 'bg-red-500' : entropy < 80 ? 'bg-yellow-500' : 'bg-green-500'}`}
                                    style={{ width: `${Math.min(entropy, 100)}%` }}
                                />
                            </div>
                            <p className="text-xs text-gray-500 text-right">Entropia: {entropy} bits</p>
                        </div>
                    )}

                    {show2FA && (
                        <input
                            type="text"
                            placeholder="Kod TOTP (6 cyfr)"
                            maxLength="6"
                            className="w-full p-3 border-2 border-blue-400 rounded-lg animate-pulse"
                            onChange={(e) => setFormData({...formData, totpToken: e.target.value})}
                            required
                        />
                    )}

                    <button className="w-full bg-blue-600 text-white p-3 rounded-lg font-semibold hover:bg-blue-700 transition">
                        {isLogin ? 'Zaloguj się' : 'Utwórz konto'}
                    </button>
                </form>

                {status.message && (
                    <div className={`mt-4 p-3 rounded-lg text-center text-sm ${
                        status.type === 'error' ? 'bg-red-100 text-red-700' :
                            status.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                        {status.message}
                    </div>
                )}

                <p className="mt-6 text-center text-gray-600 text-sm">
                    {isLogin ? 'Nie masz konta?' : 'Masz już konto?'}
                    <button
                        onClick={() => {
                            setIsLogin(!isLogin);
                            setStatus({message:'', type:''});
                            setShow2FA(false);
                            setShowPassword(false);
                        }}
                        className="ml-2 text-blue-600 font-bold hover:underline"
                    >
                        {isLogin ? 'Zarejestruj się' : 'Zaloguj się'}
                    </button>
                </p>
            </div>
        </div>
    );
};

export default AuthPage;