// JWT utility functions for authentication management

export const getToken = () => {
  return localStorage.getItem('token');
};

export const setToken = (token) => {
  localStorage.setItem('token', token);
  
  // Extract and store role from token
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (payload.role) {
      localStorage.setItem('role', payload.role);
    }
  } catch (error) {
    console.error('Error extracting role from token:', error);
  }
};

export const removeToken = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('role');
};

export const isAuthenticated = () => {
  const token = getToken();
  if (!token) return false;
  
  try {
    // Basic JWT payload parsing (without verification)
    const payload = JSON.parse(atob(token.split('.')[1]));
    const currentTime = Date.now() / 1000;
    
    // Check if token is expired
    if (payload.exp && payload.exp < currentTime) {
      removeToken();
      return false;
    }
    
    return true;
  } catch (error) {
    removeToken();
    return false;
  }
};

export const getUserRole = () => {
  const token = getToken();
  if (!token) return null;
  
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.role || null;
  } catch (error) {
    return null;
  }
};

export const getUserName = () => {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.name || null;
  } catch (error) {
    return null;
  }
};

export const getUserId = () => {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.sub || null;
  } catch (error) {
    return null;
  }
};

export const logout = () => {
  removeToken();
  window.location.href = '/login';
};

