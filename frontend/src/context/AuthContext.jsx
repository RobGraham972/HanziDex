import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';

// Create the AuthContext
export const AuthContext = createContext(null);

// Create a custom hook for easy access to AuthContext
export const useAuth = () => {
  return useContext(AuthContext);
};

// AuthProvider component to wrap your app
export const AuthProvider = ({ children }) => {
  // Initialize state from localStorage on first load
  // Updated state initialization to avoid direct localStorage access during render phase
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  // Helper to check if token is expired
  const isTokenExpired = (token) => {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.exp * 1000 < Date.now();
    } catch (e) {
      return true;
    }
  };

  // Effect to load from localStorage on initial mount
  useEffect(() => {
    try {
      const storedUser = localStorage.getItem('user');
      const storedToken = localStorage.getItem('token');
      
      if (storedToken && !isTokenExpired(storedToken)) {
        if (storedUser) setUser(JSON.parse(storedUser));
        setToken(storedToken);
      } else {
        // Token invalid or expired
        localStorage.removeItem('user');
        localStorage.removeItem('token');
      }
    } catch (error) {
      console.error("Failed to load auth from localStorage", error);
      localStorage.removeItem('user');
      localStorage.removeItem('token');
    } finally {
      setLoadingAuth(false); // Auth loading is complete after initial check
    }
  }, []); // Empty dependency array ensures this runs only once on mount

  // Effect to update localStorage whenever user or token changes (after initial load is complete)
  useEffect(() => {
    // Only update localStorage if initial loading is finished to prevent overwriting during hydration
    if (!loadingAuth) {
      if (user) {
        localStorage.setItem('user', JSON.stringify(user));
      } else {
        localStorage.removeItem('user');
      }
      if (token) {
        localStorage.setItem('token', token);
      } else {
        localStorage.removeItem('token');
      }
    }
  }, [user, token, loadingAuth]);


  // Login function
  const login = useCallback(async (username, password) => {
    try {
      const response = await fetch('http://localhost:5000/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (response.ok) {
        setUser(data.user);
        setToken(data.token);
        return { success: true, message: data.message };
      } else {
        setUser(null);
        setToken(null);
        return { success: false, message: data.message || 'Login failed.' };
      }
    } catch (error) {
      console.error("Login API error:", error);
      return { success: false, message: 'Network error or server unavailable.' };
    }
  }, []);

  // Register function
  const register = useCallback(async (username, password) => {
    try {
      const response = await fetch('http://localhost:5000/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (response.ok) {
        return { success: true, message: data.message };
      } else {
        return { success: false, message: data.message || 'Registration failed.' };
      }
    } catch (error) {
      console.error("Registration API error:", error);
      return { success: false, message: 'Network error or server unavailable.' };
    }
  }, []);

  // Logout function
  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
  }, []);

  // Provide the context value to children
  const value = {
    user,
    token,
    loadingAuth, // Expose loading state
    login,
    register,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};