import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AuthPage from './AuthPage';
import ProfilePage from './ProfilePage';

const PrivateRoute = ({ children }) => {
    const token = localStorage.getItem('token');
    return token ? children : <Navigate to="/" />;
};

function App() {
    return (
        <Router>
            <div className="App">
                <Routes>
                    <Route path="/" element={<AuthPage />} />
                    <Route path="/profile" element={
                        <PrivateRoute>
                            <ProfilePage />
                        </PrivateRoute>
                    } />
                </Routes>
            </div>
        </Router>
    );
}

export default App;