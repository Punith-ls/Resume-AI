import React, { useState } from "react";
import { 
  loadResumes, 
  analyzeResumesLogistic,
  analyzeResumesLLM,
  uploadFolder
} from "../api";

export default function RecruiterDashboard() {
  const [jobKeyword, setJobKeyword] = useState("any");
  const [loadedResumes, setLoadedResumes] = useState(null);
  const [logisticResults, setLogisticResults] = useState(null);
  const [llmResults, setLlmResults] = useState(null);
  const [loading, setLoading] = useState({
    load: false,
    upload: false,
    logistic: false,
    llm: false
  });

  const handleLoadResumes = async () => {
    setLoading(prev => ({ ...prev, load: true }));
    try {
      const res = await loadResumes(jobKeyword);
      console.log("Load resumes response:", res);
      // res is already response.data, so use res directly
      setLoadedResumes(res);
    } catch (error) {
      console.error("Load resumes error:", error);
      alert(`Failed to load resumes: ${error.message || error}`);
    } finally {
      setLoading(prev => ({ ...prev, load: false }));
    }
  };

  const handleUploadFolder = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    
    setLoading(prev => ({ ...prev, upload: true }));
    try {
      const res = await uploadFolder(files);
      console.log("Upload response:", res);
      // res is already response.data, so access res.msg directly
      alert(res?.msg || "Files uploaded successfully");
      // Reload resumes after upload
      await handleLoadResumes();
    } catch (error) {
      console.error("Upload error:", error);
      alert(`Failed to upload folder: ${error.response?.data?.detail || error.message || error}`);
    } finally {
      setLoading(prev => ({ ...prev, upload: false }));
      e.target.value = ""; // Reset file input
    }
  };

  const handleAnalyzeLogistic = async () => {
    if (!loadedResumes) {
      alert("Please load resumes first");
      return;
    }
    
    setLoading(prev => ({ ...prev, logistic: true }));
    try {
      const res = await analyzeResumesLogistic();
      console.log("Logistic Regression API Response:", res);
      // res is already response.data from the API, so it contains {msg, results}
      setLogisticResults(res);
    } catch (error) {
      console.error("Logistic Regression Error:", error);
      alert(`Logistic Regression analysis failed: ${error.response?.data?.detail || error.message || error}`);
    } finally {
      setLoading(prev => ({ ...prev, logistic: false }));
    }
  };

  const handleAnalyzeLLM = async () => {
    if (!loadedResumes) {
      alert("Please load resumes first");
      return;
    }
    
    setLoading(prev => ({ ...prev, llm: true }));
    try {
      const res = await analyzeResumesLLM();
      console.log("LLM API Response:", res);
      // res is already response.data from the API, so it contains {msg, results}
      setLlmResults(res);
    } catch (error) {
      console.error("LLM Error:", error);
      alert(`LLM analysis failed: ${error.response?.data?.detail || error.message || error}`);
    } finally {
      setLoading(prev => ({ ...prev, llm: false }));
    }
  };


  return (
    <div style={{ padding: "20px", maxWidth: "1400px", margin: "0 auto" }}>
      <h2>Recruiter Dashboard</h2>
      
      {/* Upload Section */}
      <div style={{ marginBottom: "30px", padding: "20px", border: "1px solid #ddd", borderRadius: "8px" }}>
        <h3>Upload Resumes</h3>
        <div style={{ marginBottom: "15px" }}>
          <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>
            Upload Folder (PDF, DOC, DOCX):
          </label>
          <input
            type="file"
            multiple
            onChange={handleUploadFolder}
            accept=".pdf,.doc,.docx"
            disabled={loading.upload}
            style={{ padding: "8px", border: "1px solid #ccc", borderRadius: "4px", width: "300px" }}
          />
          {loading.upload && <span style={{ marginLeft: "10px" }}>Uploading...</span>}
        </div>
      </div>

      {/* Load Resumes Section */}
      <div style={{ marginBottom: "30px", padding: "20px", border: "1px solid #ddd", borderRadius: "8px" }}>
        <h3>Load Resumes</h3>
        <div style={{ display: "flex", gap: "20px", marginBottom: "20px", flexWrap: "wrap" }}>
          <div>
            <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>
              Job Keyword:
            </label>
            <input
              type="text"
              value={jobKeyword}
              onChange={(e) => setJobKeyword(e.target.value)}
              placeholder="Enter job keyword or 'any'"
              style={{ padding: "8px", width: "200px", border: "1px solid #ccc", borderRadius: "4px" }}
            />
          </div>
        </div>
        
        <button
          onClick={handleLoadResumes}
          disabled={loading.load}
          style={{
            padding: "10px 20px",
            backgroundColor: "#007bff",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: loading.load ? "not-allowed" : "pointer"
          }}
        >
          {loading.load ? "Loading..." : "Load Resumes"}
        </button>
        
        {loadedResumes && (
          <div style={{ marginTop: "15px", padding: "10px", backgroundColor: "#d4edda", borderRadius: "4px" }}>
            <p><strong>Loaded:</strong> {loadedResumes.resume_count} resumes</p>
            <p><strong>Job Keyword:</strong> {loadedResumes.job_keyword}</p>
          </div>
        )}
      </div>

      {/* Analysis Section */}
      <div style={{ display: "flex", gap: "20px", flexWrap: "wrap", marginBottom: "30px" }}>
        
        {/* Logistic Regression Analysis */}
        <div style={{ flex: "1", minWidth: "300px", padding: "20px", border: "1px solid #ddd", borderRadius: "8px" }}>
          <h3>Logistic Regression Analysis</h3>
          <button
            onClick={handleAnalyzeLogistic}
            disabled={loading.logistic || !loadedResumes}
            style={{
              padding: "10px 20px",
              backgroundColor: "#28a745",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: loading.logistic || !loadedResumes ? "not-allowed" : "pointer",
              marginBottom: "10px",
              width: "100%"
            }}
          >
            {loading.logistic ? "Analyzing..." : "Analyze using Logistic Regression"}
          </button>
          
          {logisticResults && (
            <div style={{ marginTop: "15px", padding: "15px", backgroundColor: "#f8f9fa", borderRadius: "4px" }}>
              <h4>Results</h4>
              <p><strong>Analyzed:</strong> {logisticResults.results?.length || 0} resumes</p>
              <p><strong>Message:</strong> {logisticResults.msg || "N/A"}</p>
              
              {/* Debug: Show raw data structure */}
              {process.env.NODE_ENV === 'development' && (
                <details style={{ marginTop: "10px", padding: "10px", backgroundColor: "#fff3cd", borderRadius: "4px" }}>
                  <summary style={{ cursor: "pointer", fontWeight: "bold" }}>Debug: Raw Response Data</summary>
                  <pre style={{ marginTop: "10px", fontSize: "12px", overflow: "auto", maxHeight: "200px" }}>
                    {JSON.stringify(logisticResults, null, 2)}
                  </pre>
                </details>
              )}
              
              <div style={{ marginTop: "10px" }}>
                {logisticResults.results && Array.isArray(logisticResults.results) && logisticResults.results.length > 0 ? (
                  logisticResults.results.map((result, index) => {
                    // Debug: log the result to see what we're getting
                    console.log(`Logistic Result ${index}:`, result);
                    console.log(`Result keys:`, Object.keys(result));
                    
                    // Get the filename - try different possible field names
                    const filename = result["Resume File"] || result["resume_file"] || result.Filename || result.filename || result.name || "Unknown";
                    // Get the predicted label - try different possible field names  
                    const predictedLabel = result["Predicted Label"] || result["predicted_label"] || result["ML_Label"] || result.mlLabel || result.predictedLabel || result.label || "N/A";
                    
                    return (
                      <div key={index} style={{ 
                        marginBottom: "15px", 
                        padding: "15px", 
                        backgroundColor: "white", 
                        borderRadius: "8px",
                        border: "1px solid #e5e7eb"
                      }}>
                        <div style={{ display: "flex", alignItems: "center", marginBottom: "8px" }}>
                          <span style={{ 
                            fontSize: "18px", 
                            marginRight: "8px",
                            color: "#9333ea"
                          }}>📄</span>
                          <span style={{ color: "#b45309", fontWeight: "500" }}>Resume File:</span>
                          <span style={{ color: "#16a34a", marginLeft: "8px", fontWeight: "500" }}>
                            {filename}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center" }}>
                          <span style={{ 
                            fontSize: "18px", 
                            marginRight: "8px",
                            color: "#eab308"
                          }}>🏷️</span>
                          <span style={{ color: "#b45309", fontWeight: "500" }}>Predicted Label:</span>
                          <span style={{ color: "#16a34a", marginLeft: "8px", fontWeight: "500" }}>
                            {predictedLabel}
                          </span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ padding: "15px", backgroundColor: "#fee2e2", borderRadius: "4px", border: "1px solid #fca5a5" }}>
                    <p style={{ color: "#dc2626", fontWeight: "bold" }}>No results found</p>
                    <p style={{ color: "#991b1b", fontSize: "14px", marginTop: "5px" }}>
                      Results: {logisticResults.results ? (Array.isArray(logisticResults.results) ? `Array with ${logisticResults.results.length} items` : `Type: ${typeof logisticResults.results}`) : "undefined"}
                    </p>
                    <p style={{ color: "#991b1b", fontSize: "14px" }}>
                      Please check the browser console (F12) for detailed logs.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
          
        </div>

        {/* LLM Analysis */}
        <div style={{ flex: "1", minWidth: "300px", padding: "20px", border: "1px solid #ddd", borderRadius: "8px" }}>
          <h3>LLM Analysis</h3>
          <button
            onClick={handleAnalyzeLLM}
            disabled={loading.llm || !loadedResumes}
            style={{
              padding: "10px 20px",
              backgroundColor: "#17a2b8",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: loading.llm || !loadedResumes ? "not-allowed" : "pointer",
              marginBottom: "10px",
              width: "100%"
            }}
          >
            {loading.llm ? "Analyzing..." : "Analyze using LLM"}
          </button>
          
          {llmResults && (
            <div style={{ marginTop: "15px", padding: "15px", backgroundColor: "#f8f9fa", borderRadius: "4px" }}>
              <h4>Results</h4>
              <p><strong>Analyzed:</strong> {llmResults.results?.length || 0} resumes</p>
              <p><strong>Message:</strong> {llmResults.msg || "N/A"}</p>
              
              {/* Debug: Show raw data structure */}
              {process.env.NODE_ENV === 'development' && (
                <details style={{ marginTop: "10px", padding: "10px", backgroundColor: "#fff3cd", borderRadius: "4px" }}>
                  <summary style={{ cursor: "pointer", fontWeight: "bold" }}>Debug: Raw Response Data</summary>
                  <pre style={{ marginTop: "10px", fontSize: "12px", overflow: "auto", maxHeight: "200px" }}>
                    {JSON.stringify(llmResults, null, 2)}
                  </pre>
                </details>
              )}
              
              <div style={{ marginTop: "10px" }}>
                {llmResults.results && Array.isArray(llmResults.results) && llmResults.results.length > 0 ? (
                  llmResults.results.map((result, index) => {
                    // Debug: log the result to see what we're getting
                    console.log(`LLM Result ${index}:`, result);
                    console.log(`Result keys:`, Object.keys(result));
                    
                    // Get the filename - try different possible field names
                    const filename = result["Resume File"] || result["resume_file"] || result.Filename || result.filename || result.name || "Unknown";
                    // Get the predicted label - try different possible field names
                    const predictedLabel = result["Predicted Label"] || result["predicted_label"] || result["ML_Label"] || result.mlLabel || result.predictedLabel || result.label || "N/A";
                    
                    return (
                      <div key={index} style={{ 
                        marginBottom: "15px", 
                        padding: "15px", 
                        backgroundColor: "white", 
                        borderRadius: "8px",
                        border: "1px solid #e5e7eb"
                      }}>
                        <div style={{ display: "flex", alignItems: "center", marginBottom: "8px" }}>
                          <span style={{ 
                            fontSize: "18px", 
                            marginRight: "8px",
                            color: "#9333ea"
                          }}>📄</span>
                          <span style={{ color: "#b45309", fontWeight: "500" }}>Resume File:</span>
                          <span style={{ color: "#16a34a", marginLeft: "8px", fontWeight: "500" }}>
                            {filename}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center" }}>
                          <span style={{ 
                            fontSize: "18px", 
                            marginRight: "8px",
                            color: "#eab308"
                          }}>🏷️</span>
                          <span style={{ color: "#b45309", fontWeight: "500" }}>Predicted Label:</span>
                          <span style={{ color: "#16a34a", marginLeft: "8px", fontWeight: "500" }}>
                            {predictedLabel}
                          </span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ padding: "15px", backgroundColor: "#fee2e2", borderRadius: "4px", border: "1px solid #fca5a5" }}>
                    <p style={{ color: "#dc2626", fontWeight: "bold" }}>No results found</p>
                    <p style={{ color: "#991b1b", fontSize: "14px", marginTop: "5px" }}>
                      Results: {llmResults.results ? (Array.isArray(llmResults.results) ? `Array with ${llmResults.results.length} items` : `Type: ${typeof llmResults.results}`) : "undefined"}
                    </p>
                    <p style={{ color: "#991b1b", fontSize: "14px" }}>
                      Please check the browser console (F12) for detailed logs.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
          
        </div>
      </div>

    </div>
  );
}
