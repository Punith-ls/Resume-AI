import React, { useState } from "react";
import { uploadResume, analyzeLogisticRegression, analyzeZeroShot } from "../api";

export default function CandidateDashboard({ token }) {
  const [file, setFile] = useState(null);
  const [uploadResult, setUploadResult] = useState(null);
  const [logisticResult, setLogisticResult] = useState(null);
  const [zeroShotResult, setZeroShotResult] = useState(null);
  const [loading, setLoading] = useState({
    upload: false,
    logistic: false,
    zeroShot: false
  });

  const handleUpload = async () => {
    if (!file) {
      alert("Please select a file first");
      return;
    }
    
    setLoading(prev => ({ ...prev, upload: true }));
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await uploadResume(formData, token);
      setUploadResult(res.data);
    } catch (error) {
      alert(`Upload failed: ${error.message || error}`);
    } finally {
      setLoading(prev => ({ ...prev, upload: false }));
    }
  };

  const handleLogisticAnalysis = async () => {
    if (!uploadResult) {
      alert("Please upload a resume first");
      return;
    }
    
    setLoading(prev => ({ ...prev, logistic: true }));
    try {
      const res = await analyzeLogisticRegression();
      setLogisticResult(res.data);
    } catch (error) {
      alert(`Logistic Regression analysis failed: ${error.message || error}`);
    } finally {
      setLoading(prev => ({ ...prev, logistic: false }));
    }
  };

  const handleZeroShotAnalysis = async () => {
    if (!uploadResult) {
      alert("Please upload a resume first");
      return;
    }
    
    setLoading(prev => ({ ...prev, zeroShot: true }));
    try {
      const res = await analyzeZeroShot();
      setZeroShotResult(res.data);
    } catch (error) {
      alert(`Zero-shot analysis failed: ${error.message || error}`);
    } finally {
      setLoading(prev => ({ ...prev, zeroShot: false }));
    }
  };

  return (
    <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
      <h2>Candidate Dashboard</h2>
      
      {/* Upload Section */}
      <div style={{ marginBottom: "30px", padding: "20px", border: "1px solid #ddd", borderRadius: "8px" }}>
        <h3>Upload Resume</h3>
        <input 
          type="file" 
          onChange={(e) => setFile(e.target.files[0])} 
          accept=".pdf,.doc,.docx,.txt"
          style={{ marginBottom: "10px", padding: "8px" }}
        />
        <br />
        <button 
          onClick={handleUpload} 
          disabled={loading.upload}
          style={{ 
            padding: "10px 20px", 
            backgroundColor: "#007bff", 
            color: "white", 
            border: "none", 
            borderRadius: "4px",
            cursor: loading.upload ? "not-allowed" : "pointer"
          }}
        >
          {loading.upload ? "Uploading..." : "Upload Resume"}
        </button>
        
        {uploadResult && (
          <div style={{ marginTop: "15px", padding: "10px", backgroundColor: "#d4edda", borderRadius: "4px" }}>
            <p><strong>Upload Status:</strong> {uploadResult.msg}</p>
            <p><strong>Filename:</strong> {uploadResult.filename}</p>
            <p><strong>Text Length:</strong> {uploadResult.text_length} characters</p>
          </div>
        )}
      </div>

      {/* Analysis Section */}
      <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
        {/* Logistic Regression Analysis */}
        <div style={{ flex: "1", minWidth: "300px", padding: "20px", border: "1px solid #ddd", borderRadius: "8px" }}>
          <h3>Logistic Regression Analysis</h3>
          <button 
            onClick={handleLogisticAnalysis} 
            disabled={loading.logistic || !uploadResult}
            style={{ 
              padding: "10px 20px", 
              backgroundColor: "#28a745", 
              color: "white", 
              border: "none", 
              borderRadius: "4px",
              cursor: loading.logistic || !uploadResult ? "not-allowed" : "pointer",
              marginBottom: "15px"
            }}
          >
            {loading.logistic ? "Analyzing..." : "Analyze using Logistic Regression"}
          </button>
          
          {logisticResult && (
            <div style={{ padding: "15px", backgroundColor: "#f8f9fa", borderRadius: "4px" }}>
              <h4>Logistic Regression Results</h4>
              <p><strong>Score:</strong> {logisticResult.results.score}/10</p>
              <p><strong>Rating:</strong> {logisticResult.results.rating}</p>
              <p><strong>Confidence Score:</strong> {(logisticResult.results.confidence_score * 100).toFixed(1)}%</p>
              <p><strong>Success Probability:</strong> {(logisticResult.results.predicted_success_probability * 100).toFixed(1)}%</p>
              <p><strong>Skills Found:</strong> {logisticResult.results.skills_count}</p>
              <p><strong>Education:</strong> {logisticResult.results.education_count}</p>
              <p><strong>Experience:</strong> {logisticResult.results.experience_count}</p>
              <div style={{ marginTop: "10px" }}>
                <strong>Top Skills:</strong>
                <ul style={{ margin: "5px 0", paddingLeft: "20px" }}>
                  {logisticResult.results.skills.slice(0, 5).map((skill, index) => (
                    <li key={index}>{skill}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Zero-shot Analysis */}
        <div style={{ flex: "1", minWidth: "300px", padding: "20px", border: "1px solid #ddd", borderRadius: "8px" }}>
          <h3>Zero-shot Analysis</h3>
          <button 
            onClick={handleZeroShotAnalysis} 
            disabled={loading.zeroShot || !uploadResult}
            style={{ 
              padding: "10px 20px", 
              backgroundColor: "#17a2b8", 
              color: "white", 
              border: "none", 
              borderRadius: "4px",
              cursor: loading.zeroShot || !uploadResult ? "not-allowed" : "pointer",
              marginBottom: "15px"
            }}
          >
            {loading.zeroShot ? "Analyzing..." : "Analyze using Zero-shot"}
          </button>
          
          {zeroShotResult && (
            <div style={{ padding: "15px", backgroundColor: "#f8f9fa", borderRadius: "4px" }}>
              <h4>Zero-shot Results</h4>
              <p><strong>Score:</strong> {zeroShotResult.results.score}/10</p>
              <p><strong>Rating:</strong> {zeroShotResult.results.rating}</p>
              <p><strong>Best Match:</strong> {zeroShotResult.results.best_match}</p>
              <p><strong>Confidence Score:</strong> {(zeroShotResult.results.confidence_score * 100).toFixed(1)}%</p>
              <p><strong>Skills Found:</strong> {zeroShotResult.results.skills_count}</p>
              <p><strong>Education:</strong> {zeroShotResult.results.education_count}</p>
              <p><strong>Experience:</strong> {zeroShotResult.results.experience_count}</p>
              <div style={{ marginTop: "10px", color: "#111827" }}>
                <strong style={{ color: "#111827" }}>Job Classification:</strong>
                <ul style={{ margin: "5px 0", paddingLeft: "20px" }}>
                  {zeroShotResult.results.classification_labels.map((label, index) => (
                   <li key={index} style={{ color: "#111827" }}>
                      {label}: {(zeroShotResult.results.classification_scores[index] * 100).toFixed(1)}%
                    </li>
                  ))}
                </ul>
              </div>
              <div style={{ marginTop: "10px" }}>
                <strong>Top Skills:</strong>
                <ul style={{ margin: "5px 0", paddingLeft: "20px" }}>
                  {zeroShotResult.results.skills.slice(0, 5).map((skill, index) => (
                    <li key={index}>{skill}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
