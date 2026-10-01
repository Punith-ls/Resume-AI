import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Navbar from "./components/Navbar";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Candidate from "./pages/Candidate";
import Recruiter from "./pages/Recruiter";
import RecruiterSignup from "./pages/RecruiterSignup";
import "./styles/GlobalStyles.css";

// Protected Route Component
const ProtectedRoute = ({ children, allowedRoles = [] }) => {
  const { isAuthenticated, user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-container">
        <div style={{ fontSize: '18px' }}>
          Loading...
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user?.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
};

// Public Route Component (redirects authenticated users)
const PublicRoute = ({ children }) => {
  const { isAuthenticated, user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-container">
        <div style={{ fontSize: '18px' }}>
          Loading...
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    // Redirect based on user role
    if (user?.role === 'candidate') {
      return <Navigate to="/candidate" replace />;
    } else if (user?.role === 'recruiter') {
      return <Navigate to="/recruiter" replace />;
    }
  }

  return children;
};

// Unauthorized Page Component
const UnauthorizedPage = () => (
  <div style={{ 
    display: 'flex', 
    flexDirection: 'column',
    justifyContent: 'center', 
    alignItems: 'center', 
    height: '100vh',
    fontSize: '18px',
    color: '#666',
    textAlign: 'center'
  }}>
    <h1>403 - Unauthorized</h1>
    <p>You don't have permission to access this page.</p>
    <button 
      onClick={() => window.history.back()}
      style={{
        marginTop: '20px',
        padding: '10px 20px',
        backgroundColor: '#667eea',
        color: 'white',
        border: 'none',
        borderRadius: '5px',
        cursor: 'pointer'
      }}
    >
      Go Back
    </button>
  </div>
);

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Public Routes */}
          <Route 
            path="/login" 
            element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            } 
          />
          <Route 
            path="/signup" 
            element={
              <PublicRoute>
                <Signup />
              </PublicRoute>
            } 
          />
          <Route
            path="/recruiter-signup"
            element={
              <PublicRoute>
                <RecruiterSignup />
              </PublicRoute>
            }
          />
          
          {/* Protected Routes */}
          <Route 
            path="/candidate" 
            element={
              <ProtectedRoute allowedRoles={['candidate']}>
                <Navbar />
                <Candidate />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/recruiter" 
            element={
              <ProtectedRoute allowedRoles={['recruiter']}>
                <Navbar />
                <Recruiter />
              </ProtectedRoute>
            } 
          />
          
          {/* Utility Routes */}
          <Route path="/unauthorized" element={<UnauthorizedPage />} />
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
