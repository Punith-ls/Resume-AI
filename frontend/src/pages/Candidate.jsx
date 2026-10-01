import React, { useState, useEffect } from "react";
import { uploadResume, getMyResume, analyzeLogisticRegression, analyzeZeroShot } from "../api";
import { useAuth } from "../context/AuthContext";

export default function Candidate() {
  const [file, setFile] = useState(null);
  const [uploadResult, setUploadResult] = useState(null);
  const [logisticResult, setLogisticResult] = useState(null);
  const [zeroShotResult, setZeroShotResult] = useState(null);
  const [loading, setLoading] = useState({
    upload: false,
    logistic: false,
    zeroShot: false
  });
  const [error, setError] = useState("");
  const [resumeData, setResumeData] = useState(null);
  const { user } = useAuth();

  useEffect(() => {
    fetchMyResume();
  }, []);

  const fetchMyResume = async () => {
    try {
      const response = await getMyResume();
      setResumeData(response);
    } catch (err) {
      console.log("No resume found:", err);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError("Please select a file first");
      return;
    }

    setLoading(prev => ({ ...prev, upload: true }));
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await uploadResume(formData);
      setUploadResult(res);
      await fetchMyResume();
    } catch (err) {
      setError(err.detail || err.message || "Upload failed. Please try again.");
    } finally {
      setLoading(prev => ({ ...prev, upload: false }));
    }
  };

  const handleLogisticAnalysis = async () => {
    if (!uploadResult && !resumeData) {
      setError("Please upload a resume first");
      return;
    }
    
    setLoading(prev => ({ ...prev, logistic: true }));
    setError("");
    try {
      const res = await analyzeLogisticRegression();
      setLogisticResult(res);
    } catch (err) {
      setError(err.detail || err.message || "Logistic Regression analysis failed. Please try again.");
    } finally {
      setLoading(prev => ({ ...prev, logistic: false }));
    }
  };

  const handleZeroShotAnalysis = async () => {
    if (!uploadResult && !resumeData) {
      setError("Please upload a resume first");
      return;
    }
    
    setLoading(prev => ({ ...prev, zeroShot: true }));
    setError("");
    try {
      const res = await analyzeZeroShot();
      setZeroShotResult(res);
    } catch (err) {
      setError(err.detail || err.message || "Zero-shot analysis failed. Please try again.");
    } finally {
      setLoading(prev => ({ ...prev, zeroShot: false }));
    }
  };

  return (
    <div className="main-container">
      <div className="dashboard-card">
        <h1 className="dashboard-title">Candidate Dashboard</h1>
        <p className="dashboard-subtitle">
          Upload your resume to get AI-powered analysis and scoring
        </p>

        {user && (
          <div
            style={{
              marginBottom: "2rem",
              padding: "1rem",
              backgroundColor: "#f0f9ff",
              borderRadius: "8px",
              border: "1px solid #bae6fd",
            }}
          >
            <p style={{ margin: 0, color: "#0369a1", fontSize: "0.875rem" }}>
              Welcome, <strong>{user.name || user.role || "Candidate"}</strong>! Upload or update your
              resume below.
            </p>
          </div>
        )}

        {/* ✅ Show Current Resume Analysis */}
        {resumeData && (
          <div
            style={{
              marginBottom: "2rem",
              padding: "1.5rem",
              backgroundColor: "#f0fdf4",
              borderRadius: "12px",
              border: "1px solid #bbf7d0",
            }}
          >
            <h3
              style={{
                fontSize: "1.25rem",
                fontWeight: "600",
                color: "#166534",
                marginBottom: "1rem",
              }}
            >
              📄 Current Resume Analysis
            </h3>

            <div className="responsive-grid">
              <InfoCard
                title="Overall Score"
                value={`${resumeData.resume_analysis.score}/10`}
                color="#059669"
              />
              <InfoCard
                title="Rating"
                value={resumeData.resume_analysis.rating}
                color={
                  resumeData.resume_analysis.rating === "strong"
                    ? "#059669"
                    : resumeData.resume_analysis.rating === "intermediate"
                    ? "#d97706"
                    : "#dc2626"
                }
              />
              <InfoCard
                title="Skills Found"
                value={resumeData.resume_analysis.skills_count}
                color="#3b82f6"
              />
              <InfoCard
                title="Experience (Years)"
                value={
                  resumeData.resume_analysis.experience_years ??
                  resumeData.resume_analysis.experience_count ??
                  0
                }
                color="#0ea5a4"
              />
              <InfoCard
                title="Upload Date"
                value={new Date(
                  resumeData.resume_analysis.uploaded_at
                ).toLocaleDateString()}
                color="#6b7280"
              />
            </div>

            {/* ✅ Skills */}
            {resumeData.resume_analysis.skills &&
              resumeData.resume_analysis.skills.length > 0 && (
                <Section title="Skills Identified">
                  {resumeData.resume_analysis.skills.map((skill, i) => (
                    <Tag key={i} text={skill} color="#1e40af" bg="#dbeafe" />
                  ))}
                </Section>
              )}

            {/* ✅ Education */}
            {resumeData.resume_analysis.education &&
              resumeData.resume_analysis.education.length > 0 && (
                <Section title="Education Background">
                  {resumeData.resume_analysis.education.map((edu, i) => (
                    <Tag key={i} text={edu} color="#166534" bg="#dcfce7" />
                  ))}
                </Section>
              )}

            {/* ✅ Experience (phrases/roles) */}
            {resumeData.resume_analysis.experience &&
              resumeData.resume_analysis.experience.length > 0 && (
                <Section title="Experience Roles">
                  {resumeData.resume_analysis.experience.map((exp, i) => (
                    <Tag key={i} text={exp} color="#92400e" bg="#fef3c7" />
                  ))}
                </Section>
              )}
          </div>
        )}

        {/* ✅ File Upload Section */}
        <div className="form-section">
          <label
            style={{
              display: "block",
              fontSize: "1rem",
              fontWeight: "600",
              color: "#374151",
              marginBottom: "0.5rem",
            }}
          >
            Select Resume File
          </label>
          <input
            type="file"
            accept=".pdf,.doc,.docx,.txt"
            onChange={(e) => setFile(e.target.files[0])}
            style={{
              width: "100%",
              padding: "0.75rem",
              border: "2px solid #e5e7eb",
              borderRadius: "8px",
              fontSize: "1rem",
              backgroundColor: "#ffffff",
            }}
          />
          {file && (
            <p style={{ marginTop: "0.5rem", color: "#10b981" }}>
              Selected: {file.name}
            </p>
          )}

          {error && (
            <div
              style={{
                marginTop: "1rem",
                backgroundColor: "#fef2f2",
                color: "#dc2626",
                padding: "1rem",
                borderRadius: "8px",
                border: "1px solid #fecaca",
              }}
            >
              ⚠️ {error}
            </div>
          )}

          {/* Three Buttons */}
          <div style={{ display: "flex", gap: "1rem", marginTop: "1rem", flexWrap: "wrap" }}>
            <button
              onClick={handleUpload}
              disabled={loading.upload || !file}
              className="btn btn-primary"
              style={{
                flex: "1",
                minWidth: "200px",
                opacity: loading.upload || !file ? 0.6 : 1,
                cursor: loading.upload || !file ? "not-allowed" : "pointer",
                backgroundColor: "#3b82f6",
                color: "white",
                border: "none",
                padding: "0.75rem 1.5rem",
                borderRadius: "8px",
                fontSize: "1rem",
                fontWeight: "600",
              }}
            >
              {loading.upload ? "Uploading..." : "1. Upload Resume"}
            </button>

            <button
              onClick={handleLogisticAnalysis}
              disabled={loading.logistic || (!uploadResult && !resumeData)}
              className="btn btn-secondary"
              style={{
                flex: "1",
                minWidth: "200px",
                opacity: loading.logistic || (!uploadResult && !resumeData) ? 0.6 : 1,
                cursor: loading.logistic || (!uploadResult && !resumeData) ? "not-allowed" : "pointer",
                backgroundColor: "#10b981",
                color: "white",
                border: "none",
                padding: "0.75rem 1.5rem",
                borderRadius: "8px",
                fontSize: "1rem",
                fontWeight: "600",
              }}
            >
              {loading.logistic ? "Analyzing..." : "2. Analyze using Logistic Regression"}
            </button>

            <button
              onClick={handleZeroShotAnalysis}
              disabled={loading.zeroShot || (!uploadResult && !resumeData)}
              className="btn btn-tertiary"
              style={{
                flex: "1",
                minWidth: "200px",
                opacity: loading.zeroShot || (!uploadResult && !resumeData) ? 0.6 : 1,
                cursor: loading.zeroShot || (!uploadResult && !resumeData) ? "not-allowed" : "pointer",
                backgroundColor: "#8b5cf6",
                color: "white",
                border: "none",
                padding: "0.75rem 1.5rem",
                borderRadius: "8px",
                fontSize: "1rem",
                fontWeight: "600",
              }}
            >
              {loading.zeroShot ? "Analyzing..." : "3. Analyze using Zero-shot"}
            </button>
          </div>
        </div>

        {/* ✅ Show Upload Status */}
        {uploadResult && (
          <div
            style={{
              marginTop: "2rem",
              padding: "1.5rem",
              backgroundColor: "#f0fdf4",
              borderRadius: "12px",
              border: "1px solid #bbf7d0",
            }}
          >
            <h3 style={{ color: "#166534", marginBottom: "1rem" }}>📄 Upload Status</h3>
            <p><strong>Status:</strong> {uploadResult.msg}</p>
            <p><strong>Filename:</strong> {uploadResult.filename}</p>
            <p><strong>Text Length:</strong> {uploadResult.text_length} characters</p>
          </div>
        )}

        {/* ✅ Show Analysis Results Side by Side */}
        {(logisticResult || zeroShotResult) && (
          <div style={{ marginTop: "2rem" }}>
            <h3 style={{ color: "#374151", marginBottom: "1.5rem", textAlign: "center" }}>
              Analysis Results
            </h3>
            <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap" }}>
              {/* Logistic Regression Results */}
              {logisticResult && (
                <div
                  style={{
                    flex: "1",
                    minWidth: "300px",
                    padding: "1.5rem",
                    backgroundColor: "#f0f9ff",
                    borderRadius: "12px",
                    border: "1px solid #bae6fd",
                  }}
                >
                  <h4 style={{ color: "#0369a1", marginBottom: "1rem" }}>
                    📊 Logistic Regression Results
                  </h4>
                  <div style={{ marginBottom: "1rem", color: "#111827" }}>
                    <p><strong>Score:</strong> {logisticResult.results.score}/10</p>
                    <p><strong>Rating:</strong> {logisticResult.results.rating}</p>
                    <p><strong>Confidence Score:</strong> {(logisticResult.results.confidence_score * 100).toFixed(1)}%</p>
                    <p><strong>Success Probability:</strong> {(logisticResult.results.predicted_success_probability * 100).toFixed(1)}%</p>
                    <p><strong>Skills Found:</strong> {logisticResult.results.skills_count}</p>
                    <p><strong>Education:</strong> {logisticResult.results.education_count}</p>
                    <p><strong>Experience:</strong> {logisticResult.results.experience_count}</p>
                  </div>
                  {logisticResult.results.skills && logisticResult.results.skills.length > 0 && (
                    <Section title="Top Skills">
                      {logisticResult.results.skills.slice(0, 5).map((skill, i) => (
                        <Tag key={i} text={skill} color="#1e40af" bg="#dbeafe" />
                      ))}
                    </Section>
                  )}
                </div>
              )}

              {/* Zero-shot Results */}
              {zeroShotResult && (
                <div
                  style={{
                    flex: "1",
                    minWidth: "300px",
                    padding: "1.5rem",
                    backgroundColor: "#faf5ff",
                    borderRadius: "12px",
                    border: "1px solid #e9d5ff",
                  }}
                >
                  <h4 style={{ color: "#7c3aed", marginBottom: "1rem" }}>
                    🎯 Zero-shot Results
                  </h4>
                  <div style={{ marginBottom: "1rem", color: "#111827" }}>
                    <p><strong>Score:</strong> {zeroShotResult.results.score}/10</p>
                    <p><strong>Rating:</strong> {zeroShotResult.results.rating}</p>
                    <p><strong>Best Match:</strong> {zeroShotResult.results.best_match}</p>
                    <p><strong>Confidence Score:</strong> {(zeroShotResult.results.confidence_score * 100).toFixed(1)}%</p>
                    <p><strong>Skills Found:</strong> {zeroShotResult.results.skills_count}</p>
                    <p><strong>Education:</strong> {zeroShotResult.results.education_count}</p>
                    <p><strong>Experience:</strong> {zeroShotResult.results.experience_count}</p>
                  </div>
                  
                  {zeroShotResult.results.classification_labels && (
                    <div style={{ marginBottom: "1rem", color: "#111827" }}>
                      <h5 style={{ color: "#111827", marginBottom: "0.5rem" }}>Job Classification:</h5>
                      {zeroShotResult.results.classification_labels.map((label, index) => (
                        <div key={index} style={{ marginBottom: "0.25rem" }}>
                          <span style={{ fontWeight: "600" }}>{label}:</span>{" "}
                          <span>{(zeroShotResult.results.classification_scores[index] * 100).toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {zeroShotResult.results.skills && zeroShotResult.results.skills.length > 0 && (
                    <Section title="Top Skills">
                      {zeroShotResult.results.skills.slice(0, 5).map((skill, i) => (
                        <Tag key={i} text={skill} color="#7c3aed" bg="#f3e8ff" />
                      ))}
                    </Section>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ✅ Small reusable components */
function InfoCard({ title, value, color }) {
  return (
    <div
      style={{
        backgroundColor: "white",
        padding: "1rem",
        borderRadius: "8px",
        border: "1px solid #e5e7eb",
      }}
    >
      <h4 style={{ fontSize: "0.875rem", color: "#8B5CF6" }}>{title}</h4>
      <p style={{ fontSize: "1.25rem", fontWeight: "700", color: color }}>
        {value}
      </p>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginTop: "1.5rem" }}>
      <h4 style={{ fontSize: "1rem", fontWeight: "600", marginBottom: "0.75rem" }}>
        {title}
      </h4>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        {children}
      </div>
    </div>
  );
}

function Tag({ text, color, bg }) {
  return (
    <span
      style={{
        backgroundColor: bg,
        color: color,
        padding: "0.25rem 0.75rem",
        borderRadius: "9999px",
        fontSize: "0.875rem",
        fontWeight: "500",
      }}
    >
      {text}
    </span>
  );
}
