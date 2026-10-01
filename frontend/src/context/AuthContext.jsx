import React, { createContext, useContext, useState, useEffect } from 'react';
import { getToken, setToken, removeToken, isAuthenticated, getUserRole, getUserId, getUserName } from '../utils/auth';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initializeAuth = () => {
      const token = getToken();
      if (token && isAuthenticated()) {
        const role = getUserRole();
        const userId = getUserId();
        const name = getUserName();
        setUser({ token, role, userId, name });
      }
      setLoading(false);
    };

    initializeAuth();
  }, []);

  const login = (token) => {
    if (!token) {
      console.error('No token provided to login');
      return;
    }
    
    setToken(token);
    const role = getUserRole();
    const userId = getUserId();
    const name = getUserName();
    setUser({ token, role, userId, name });
  };

  const logout = () => {
    removeToken();
    setUser(null);
    window.location.href = '/login';
  };

  const value = {
    user,
    login,
    logout,
    isAuthenticated: !!user,
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

