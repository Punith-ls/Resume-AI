import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login, recruiterLogin } from "../api";
import { useAuth } from "../context/AuthContext";
import { getUserRole } from "../utils/auth";
import "../styles/AuthStyles.css";

export default function Login() {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    role: "candidate"
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { login: authLogin, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // Redirect if already authenticated - but check role first
  useEffect(() => {
    if (isAuthenticated) {
      const role = getUserRole();
      if (role === 'recruiter') {
        navigate("/recruiter", { replace: true });
      } else {
        navigate("/candidate", { replace: true });
      }
    }
  }, [isAuthenticated, navigate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear error when user starts typing
    if (error) setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Prevent multiple submissions
    if (loading) return;
    
    setLoading(true);
    setError("");

    try {
      let response;
      if (formData.role === "candidate") {
        response = await login({ email: formData.email, password: formData.password });
      } else {
        response = await recruiterLogin({ email: formData.email, password: formData.password });
      }
      
      console.log("Login response:", response);
      
      // Check if response has token
      if (!response || (!response.access_token && !response.token)) {
        throw new Error("Invalid response from server. No token received.");
      }
      
      const token = response.access_token || response.token;
      
      if (!token) {
        throw new Error("No token received from server.");
      }
      
      // Store token and update auth state
      authLogin(token);
      
      // Small delay to ensure token is stored
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Redirect based on role
      if (formData.role === "candidate") {
        navigate("/candidate", { replace: true });
      } else {
        navigate("/recruiter", { replace: true });
      }
    } catch (err) {
      console.error("Login error:", err);
      
      // Extract error message
      let errorMessage = "Login failed. Please try again.";
      
      if (typeof err === 'string') {
        errorMessage = err;
      } else if (err?.response?.data) {
        const errorData = err.response.data;
        if (typeof errorData === 'string') {
          errorMessage = errorData;
        } else if (errorData.detail) {
          errorMessage = errorData.detail;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        } else if (errorData.error) {
          errorMessage = errorData.error;
        }
      } else if (err?.message) {
        errorMessage = err.message;
      } else if (err?.detail) {
        errorMessage = err.detail;
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        {/* Welcome Section (Left Panel) */}
        <div className="auth-welcome">
          <h1 className="welcome-title">Welcome to ResumeAI</h1>
          <p className="welcome-subtitle">
            Transform your recruitment process with AI-powered resume analysis and candidate matching.
          </p>
        </div>

        {/* Form Section (Right Panel) */}
        <div className="auth-form-section">
          <div className="auth-header">
            <h1 className="auth-title">User Login</h1>
            <p className="auth-subtitle">Sign in to your account</p>
          </div>

          {error && <div className="error-message">{error}</div>}

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label htmlFor="role" className="form-label">Account Type</label>
              <select
                id="role"
                name="role"
                value={formData.role}
                onChange={handleChange}
                className="form-select"
                required
              >
                <option value="candidate">Candidate</option>
                <option value="recruiter">Recruiter</option>
              </select>
            </div>

                   <div className="form-group">
                     <label htmlFor="email" className="form-label">
                       {formData.role === "candidate" ? "Email Address" : "Email Address"}
                     </label>
                     <div className="form-input-with-icon">
                       <svg className="form-input-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                       </svg>
                       <input
                         id="email"
                         name="email"
                         type="email"
                         placeholder={formData.role === "candidate" ? "Enter your email" : "Enter admin email"}
                         value={formData.email}
                         onChange={handleChange}
                         className="form-input"
                         required
                       />
                     </div>
                   </div>

            <div className="form-group">
              <label htmlFor="password" className="form-label">Password</label>
              <div className="form-input-with-icon">
                <svg className="form-input-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="Enter your password"
                  value={formData.password}
                  onChange={handleChange}
                  className="form-input"
                  required
                />
              </div>
            </div>

            <div className="auth-options">
              <label className="remember-me">
                <input type="checkbox" />
                Remember
              </label>
              <a href="#" className="forgot-password">Forgot password?</a>
            </div>

            <button
              type="submit"
              className="auth-button"
              disabled={loading || !formData.email || !formData.password}
            >
              {loading ? (
                <>
                  <span className="loading-spinner"></span>
                  Signing In...
                </>
              ) : (
                "Login"
              )}
            </button>
          </form>

          <div className="auth-links">
            <p>
              Don't have an account?{" "}
              <Link to="/signup" className="auth-link">
                Sign up as candidate
              </Link>
              {" | "}
              <Link to="/recruiter-signup" className="auth-link">
                Register as recruiter
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
