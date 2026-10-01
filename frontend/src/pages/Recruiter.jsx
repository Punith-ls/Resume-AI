import React, { useState, useEffect } from "react";
import {
  getRankedCandidates,
  postJob,
  getCandidateResume,
  downloadResume,
  loadResumes,
  analyzeResumesLogistic,
  analyzeResumesLLM,
  analyzeSentimentLogistic,
  analyzeSentimentLLM,
  uploadFolder,
  clearShortlistedCandidates,
  exportShortlistedCSV,
  saveShortlistedLogistic,
  saveShortlistedLLM
} from "../api";
import { useAuth } from "../context/AuthContext";

export default function Recruiter() {
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showJobForm, setShowJobForm] = useState(false);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [resumeData, setResumeData] = useState(null);
  const [jobForm, setJobForm] = useState({
    title: "",
    description: "",
    experience: "",
    education: "",
    skills: "",
    location: "",
    salary: ""
  });
 
  // New state for resume analysis
  const [jobKeyword, setJobKeyword] = useState("any");
  const [numCandidates, setNumCandidates] = useState(3);
  const [loadedResumes, setLoadedResumes] = useState(null);
  const [logisticResults, setLogisticResults] = useState(null);
  const [llmResults, setLlmResults] = useState(null);
  const [sentimentLogisticResults, setSentimentLogisticResults] = useState(null);
  const [sentimentLLMResults, setSentimentLLMResults] = useState(null);
  const [shortlistedLogistic, setShortlistedLogistic] = useState(null);
  const [shortlistedLLM, setShortlistedLLM] = useState(null);
  const [activeResultsTab, setActiveResultsTab] = useState('logistic'); // 'logistic' or 'llm'
  const [analysisLoading, setAnalysisLoading] = useState({
    load: false,
    upload: false,
    logistic: false,
    llm: false,
    sentimentLogistic: false,
    sentimentLLM: false,
    clear: false,
    exportCSV: false,
    shortlistLogistic: false,
    shortlistLLM: false
  });
  const [notifications, setNotifications] = useState([]);
 
  const { user } = useAuth();

  useEffect(() => {
    fetchCandidates();
  }, []);

  // Notification system
  const addNotification = (message, type = 'success') => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, message, type }]);
   
    // Auto remove notification after 5 seconds
    setTimeout(() => {
      setNotifications(prev => prev.filter(notif => notif.id !== id));
    }, 5000);
  };

  const fetchCandidates = async () => {
    try {
      const data = await getRankedCandidates(10);
      setCandidates(data);
    } catch (error) {
      console.error("Failed to fetch candidates:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleJobFormChange = (e) => {
    const { name, value } = e.target;
    setJobForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleJobSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
   
    try {
      const response = await postJob(jobForm);
      alert(`Job posted successfully! Found ${response.matching_candidates} matching candidates.`);
     
      // Reset form
      setJobForm({
        title: "",
        description: "",
        experience: "",
        education: "",
        skills: "",
        location: "",
        salary: ""
      });
     
      // Show top candidates if any
      if (response.top_candidates && response.top_candidates.length > 0) {
        setCandidates(response.top_candidates);
        setShowJobForm(false);
      }
    } catch (error) {
      console.error("Failed to post job:", error);
      alert(`Failed to post job: ${error.detail || error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const handleViewResume = async (candidate) => {
    setLoading(true);
    try {
      const resume = await getCandidateResume(candidate._id);
      setSelectedCandidate(candidate);
      setResumeData(resume);
      setShowResumeModal(true);
    } catch (error) {
      console.error("Failed to fetch resume:", error);
      alert(`Failed to fetch resume: ${error.detail || error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadResume = async (candidate) => {
    try {
      const blob = await downloadResume(candidate._id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${candidate.name}_resume.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to download resume:", error);
      alert(`Failed to download resume: ${error.detail || error.message || "Unknown error"}`);
    }
  };

  const closeResumeModal = () => {
    setShowResumeModal(false);
    setSelectedCandidate(null);
    setResumeData(null);
  };

  // New handler functions for resume analysis
  const handleLoadResumes = async () => {
    setAnalysisLoading(prev => ({ ...prev, load: true }));
    try {
      const res = await loadResumes(jobKeyword);
      setLoadedResumes(res);
     
      addNotification(`📄 Loaded ${res.resume_count} resumes successfully`, 'success');
     
    } catch (error) {
      alert(`Failed to load resumes: ${error.message || error}`);
    } finally {
      setAnalysisLoading(prev => ({ ...prev, load: false }));
    }
  };

  const handleUploadFolder = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }

    // Clear previous results when uploading new files
    setLogisticResults(null);
    setLlmResults(null);
    setSentimentLogisticResults(null);
    setSentimentLLMResults(null);
    setShortlistedLogistic(null);
    setShortlistedLLM(null);

    setAnalysisLoading(prev => ({ ...prev, upload: true }));
    try {
      // Convert FileList to Array for uploadFolder API
      const filesArray = Array.from(files);
      const res = await uploadFolder(filesArray);
      
      // Format the uploaded resumes to match loadedResumes format
      // The backend already stores them in loaded_resumes, so we need to fetch them
      // But format them properly without calling loadResumes (which loads from DB)
      const formattedResumes = {
        msg: res.msg,
        resume_count: res.resume_count,
        job_keyword: "uploaded_folder",
        uploaded_files: res.uploaded_files || [],
        resumes: res.uploaded_files?.map((filename, idx) => ({
          name: filename.replace(/\.pdf$/i, "").replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
          filename: filename,
          index: idx + 1
        })) || []
      };
      
      setLoadedResumes(formattedResumes);
      
      // Show notification with rejection info if any
      let notificationMsg = `📁 Uploaded ${res.resume_count} PDF resume(s) successfully`;
      if (res.rejected_count > 0) {
        notificationMsg += ` (${res.rejected_count} file(s) rejected)`;
      }
      addNotification(notificationMsg, res.rejected_count > 0 ? 'warning' : 'success');
      
      // Show rejected files if any
      if (res.rejected_files && res.rejected_files.length > 0) {
        const rejectedMsg = res.rejected_files.map(f => `• ${f.filename}: ${f.reason}`).join('\n');
        alert(`Some files were rejected:\n\n${rejectedMsg}`);
      }
      
      // Reset file input
      event.target.value = '';
    } catch (error) {
      alert(`Failed to upload folder: ${error.response?.data?.detail || error.message || error}`);
    } finally {
      setAnalysisLoading(prev => ({ ...prev, upload: false }));
    }
  };

  const handleAnalyzeLogistic = async () => {
    if (!loadedResumes) {
      alert("Please load or upload resumes first");
      return;
    }
 
    setAnalysisLoading(prev => ({ ...prev, logistic: true }));
    try {
      const res = await analyzeResumesLogistic();
      console.log("Logistic Regression API Response:", res);
      
      // Backend now returns: {msg, results: [{ "Resume File": "...", "Predicted Label": "..." }]}
      // Use the response directly without mapping
      setLogisticResults(res);
      addNotification(`📊 Logistic Regression analysis completed`, "success");
    } catch (error) {
      console.error("Logistic Regression analysis failed:", error);
 
      const msg =
        error.response?.data?.detail ||
        error.message ||
        JSON.stringify(error);
 
      alert(`Logistic Regression analysis failed: ${msg}`);
    } finally {
      setAnalysisLoading(prev => ({ ...prev, logistic: false }));
    }
  };
 

  const handleAnalyzeLLM = async () => {
    if (!loadedResumes) {
      alert("Please load or upload resumes first");
      return;
    }

    setAnalysisLoading(prev => ({ ...prev, llm: true }));
    try {
      const res = await analyzeResumesLLM();
      console.log("LLM API Response:", res);
      
      // Backend now returns: {msg, results: [{ "Resume File": "...", "Predicted Label": "..." }]}
      // Use the response directly without mapping
      setLlmResults(res);
      addNotification(`🤖 LLM analysis completed`, "success");
    } catch (error) {
      console.error("LLM analysis failed:", error);
      alert(`LLM analysis failed: ${error.response?.data?.detail || error.message || error}`);
    } finally {
      setAnalysisLoading(prev => ({ ...prev, llm: false }));
    }
  };

  const handleAnalyzeSentimentLogistic = async () => {
    if (!loadedResumes) {
      alert("Please load or upload resumes first");
      return;
    }

    setAnalysisLoading(prev => ({ ...prev, sentimentLogistic: true }));
    try {
      const res = await analyzeSentimentLogistic();
      setSentimentLogisticResults(res);
      addNotification(`📊 Sentiment analysis (Logistic) completed for ${res.results?.length || 0} resumes`, 'success');
    } catch (error) {
      alert(`Failed to analyze sentiment (Logistic): ${error.response?.data?.detail || error.message || error}`);
    } finally {
      setAnalysisLoading(prev => ({ ...prev, sentimentLogistic: false }));
    }
  };

  const handleAnalyzeSentimentLLM = async () => {
    if (!loadedResumes) {
      alert("Please load or upload resumes first");
      return;
    }

    setAnalysisLoading(prev => ({ ...prev, sentimentLLM: true }));
    try {
      const res = await analyzeSentimentLLM();
      setSentimentLLMResults(res);
      addNotification(`📊 Sentiment analysis (LLM) completed for ${res.results?.length || 0} resumes`, 'success');
    } catch (error) {
      alert(`Failed to analyze sentiment (LLM): ${error.response?.data?.detail || error.message || error}`);
    } finally {
      setAnalysisLoading(prev => ({ ...prev, sentimentLLM: false }));
    }
  };

  const handleClearShortlistedCandidates = async () => {
    if (!window.confirm("Are you sure you want to clear all shortlisted candidates? This action cannot be undone.")) {
      return;
    }
   
    setAnalysisLoading(prev => ({ ...prev, clear: true }));
    try {
      const res = await clearShortlistedCandidates();
      setSentimentLogisticResults(null);
      setSentimentLLMResults(null);
      setShortlistedLogistic(null);
      setShortlistedLLM(null);
      addNotification(`🗑️ ${res.deleted_count} shortlisted candidate records cleared`, 'success');
    } catch (error) {
      alert(`Failed to clear shortlisted candidates: ${error.message || error}`);
    } finally {
      setAnalysisLoading(prev => ({ ...prev, clear: false }));
    }
  };

  const handleSaveShortlistedLogistic = async () => {
    setAnalysisLoading(prev => ({ ...prev, shortlistLogistic: true }));
    try {
      const res = await saveShortlistedLogistic(numCandidates);
      setShortlistedLogistic(res);
      addNotification(res.msg || "Shortlisted logistic candidates", "success");
    } catch (error) {
      alert(`Failed to shortlist: ${error.detail || error.message || error}`);
    } finally {
      setAnalysisLoading(prev => ({ ...prev, shortlistLogistic: false }));
    }
  };

  const handleSaveShortlistedLLM = async () => {
    setAnalysisLoading(prev => ({ ...prev, shortlistLLM: true }));
    try {
      const res = await saveShortlistedLLM(numCandidates);
      setShortlistedLLM(res);
      addNotification(res.msg || "Shortlisted text-classifier candidates", "success");
    } catch (error) {
      alert(`Failed to shortlist: ${error.detail || error.message || error}`);
    } finally {
      setAnalysisLoading(prev => ({ ...prev, shortlistLLM: false }));
    }
  };

  const handleExportAllCandidatesCSV = async () => {
    if (!logisticResults && !llmResults) {
      alert("Please analyze resumes first before exporting");
      return;
    }
    
    setAnalysisLoading(prev => ({ ...prev, exportCSV: true }));
    try {
      const blob = await exportShortlistedCSV();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `all_candidates_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      addNotification('📊 All analyzed candidates exported to CSV', 'success');
    } catch (error) {
      alert(`Failed to export CSV: ${error.response?.data?.detail || error.message}`);
    } finally {
      setAnalysisLoading(prev => ({ ...prev, exportCSV: false }));
    }
  };

  return (
    <>
      <style>
        {`
          @keyframes slideIn {
            from {
              transform: translateX(100%);
              opacity: 0;
            }
            to {
              transform: translateX(0);
              opacity: 1;
            }
          }
        `}
      </style>
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: '0',
        margin: '0',
        width: '100vw'
      }}>
      {/* Header Section */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(10px)',
        padding: '2rem 0',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{
          maxWidth: '1400px',
          margin: '0 auto',
          padding: '0 2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h1 style={{
              fontSize: '2.5rem',
              fontWeight: '800',
              color: '#1f2937',
              margin: '0 0 0.5rem 0',
              letterSpacing: '-0.025em'
            }}>
              Recruiter Dashboard
            </h1>
            <p style={{
              fontSize: '1.125rem',
              color: '#6b7280',
              margin: '0'
            }}>
              Welcome back, {user?.name || user?.role}! Manage your recruitment process.
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button
              onClick={() => setShowJobForm(false)}
              style={{
                background: showJobForm ? "#e5e7eb" : "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                color: showJobForm ? "#374151" : "white",
                border: "none",
                padding: "0.75rem 1.25rem",
                borderRadius: "10px",
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              Resume Analysis
            </button>
            <button
              onClick={() => setShowJobForm(true)}
              style={{
                background: showJobForm ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" : "#e5e7eb",
                color: showJobForm ? "white" : "#374151",
                border: "none",
                padding: "0.75rem 1.25rem",
                borderRadius: "10px",
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              Post a Job
            </button>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {notifications.length > 0 && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem'
        }}>
          {notifications.map(notification => (
            <div
              key={notification.id}
              style={{
                background: notification.type === 'success' ? '#10b981' : '#ef4444',
                color: 'white',
                padding: '1rem 1.5rem',
                borderRadius: '8px',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                fontSize: '0.875rem',
                fontWeight: '500',
                maxWidth: '300px',
                animation: 'slideIn 0.3s ease-out'
              }}
            >
              {notification.message}
            </div>
          ))}
        </div>
      )}

      {/* Main Content */}
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto',
        padding: '2rem',
        width: '100%'
      }}>
        {showJobForm ? (
          /* Job Posting Form */
          <div style={{
            background: 'white',
            borderRadius: '20px',
            padding: '3rem',
            boxShadow: '0 25px 50px rgba(0, 0, 0, 0.15)',
            marginBottom: '2rem'
          }}>
            <h2 style={{
              fontSize: '2rem',
              fontWeight: '700',
              color: '#1f2937',
              marginBottom: '2rem',
              textAlign: 'center'
            }}>
              Post New Job Opportunity
            </h2>
           
            <form onSubmit={handleJobSubmit} style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '2rem'
            }}>
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  color: '#374151',
                  marginBottom: '0.5rem'
                }}>
                  Job Title *
                </label>
                <input
                  type="text"
                  name="title"
                  value={jobForm.title}
                  onChange={handleJobFormChange}
                  required
                  style={{
                    width: '100%',
                    padding: '0.875rem',
                    border: '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    transition: 'border-color 0.3s ease'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#667eea'}
                  onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                />
              </div>

              <div>
                <label style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  color: '#374151',
                  marginBottom: '0.5rem'
                }}>
                  Location *
                </label>
                <input
                  type="text"
                  name="location"
                  value={jobForm.location}
                  onChange={handleJobFormChange}
                  required
                  style={{
                    width: '100%',
                    padding: '0.875rem',
                    border: '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    transition: 'border-color 0.3s ease'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#667eea'}
                  onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  color: '#374151',
                  marginBottom: '0.5rem'
                }}>
                  Job Description *
                </label>
                <textarea
                  name="description"
                  value={jobForm.description}
                  onChange={handleJobFormChange}
                  required
                  rows="4"
                  style={{
                    width: '100%',
                    padding: '0.875rem',
                    border: '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    resize: 'vertical',
                    transition: 'border-color 0.3s ease'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#667eea'}
                  onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                />
              </div>

              <div>
                <label style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  color: '#374151',
                  marginBottom: '0.5rem'
                }}>
                  Required Experience *
                </label>
                <select
                  name="experience"
                  value={jobForm.experience}
                  onChange={handleJobFormChange}
                  required
                  style={{
                    width: '100%',
                    padding: '0.875rem',
                    border: '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    transition: 'border-color 0.3s ease'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#667eea'}
                  onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                >
                  <option value="">Select Experience Level</option>
                  <option value="0-1">0-1 years (Entry Level)</option>
                  <option value="2-3">2-3 years (Junior)</option>
                  <option value="4-6">4-6 years (Mid Level)</option>
                  <option value="7-10">7-10 years (Senior)</option>
                  <option value="10+">10+ years (Expert)</option>
                </select>
              </div>

              <div>
                <label style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  color: '#374151',
                  marginBottom: '0.5rem'
                }}>
                  Education Level *
                </label>
                <select
                  name="education"
                  value={jobForm.education}
                  onChange={handleJobFormChange}
                  required
                  style={{
                    width: '100%',
                    padding: '0.875rem',
                    border: '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    transition: 'border-color 0.3s ease'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#667eea'}
                  onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                >
                  <option value="">Select Education Level</option>
                  <option value="high-school">High School</option>
                  <option value="diploma">Diploma</option>
                  <option value="bachelor">Bachelor's Degree</option>
                  <option value="master">Master's Degree</option>
                  <option value="phd">PhD</option>
                </select>
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  color: '#374151',
                  marginBottom: '0.5rem'
                }}>
                  Required Skills (comma-separated) *
                </label>
                <input
                  type="text"
                  name="skills"
                  value={jobForm.skills}
                  onChange={handleJobFormChange}
                  required
                  placeholder="e.g., Python, React, Machine Learning, SQL"
                  style={{
                    width: '100%',
                    padding: '0.875rem',
                    border: '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    transition: 'border-color 0.3s ease'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#667eea'}
                  onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                />
              </div>

              <div style={{ gridColumn: '1 / -1', textAlign: 'center' }}>
                <button
                  type="submit"
                  style={{
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    color: 'white',
                    border: 'none',
                    padding: '1rem 3rem',
                    borderRadius: '12px',
                    fontSize: '1.125rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                    transition: 'all 0.3s ease'
                  }}
                  onMouseOver={(e) => {
                    e.target.style.transform = 'translateY(-2px)';
                    e.target.style.boxShadow = '0 8px 16px rgba(102, 126, 234, 0.2)';
                  }}
                  onMouseOut={(e) => {
                    e.target.style.transform = 'translateY(0)';
                    e.target.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
                  }}
                >
                  Post Job & Find Candidates
                </button>
              </div>
            </form>
          </div>
        ) : (
          /* Resume Analysis Section */
          <div style={{
            background: 'white',
            borderRadius: '20px',
            padding: '3rem',
            boxShadow: '0 25px 50px rgba(0, 0, 0, 0.15)',
            marginBottom: '2rem'
          }}>
            <h2 style={{
              fontSize: '2rem',
              fontWeight: '700',
              color: '#1f2937',
              marginBottom: '2rem',
              textAlign: 'center'
            }}>
              Resume Analysis & Shortlisting
            </h2>
           
            {/* Input Section */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '2rem',
              marginBottom: '2rem'
            }}>
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  color: '#374151',
                  marginBottom: '0.5rem'
                }}>
                  Job Keyword (case-insensitive)
                </label>
                <input
                  type="text"
                  value={jobKeyword}
                  onChange={(e) => setJobKeyword(e.target.value)}
                  placeholder="e.g., 'developer', 'engineer', 'any'"
                  style={{
                    width: '100%',
                    padding: '0.875rem',
                    border: '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    transition: 'border-color 0.3s ease'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#10b981'}
                  onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                />
              </div>

              <div>
                <label style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  color: '#374151',
                  marginBottom: '0.5rem'
                }}>
                  Number of Candidates to Shortlist
                </label>
                <input
                  type="number"
                  value={numCandidates}
                  onChange={(e) => setNumCandidates(parseInt(e.target.value) || 3)}
                  min="1"
                  max="10"
                  style={{
                    width: '100%',
                    padding: '0.875rem',
                    border: '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    transition: 'border-color 0.3s ease'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#10b981'}
                  onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                />
              </div>
            </div>

            {/* Buttons 1: Load Resumes and Upload Folder */}
            <div style={{ 
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: '1rem',
              marginBottom: '2rem'
            }}>
              <button
                onClick={handleLoadResumes}
                disabled={analysisLoading.load}
                style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: 'white',
                  border: 'none',
                  padding: '1rem 2rem',
                  borderRadius: '12px',
                  fontSize: '1.125rem',
                  fontWeight: '600',
                  cursor: analysisLoading.load ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                  transition: 'all 0.3s ease',
                  opacity: analysisLoading.load ? 0.6 : 1
                }}
                onMouseOver={(e) => {
                  if (!analysisLoading.load) {
                    e.target.style.transform = 'translateY(-2px)';
                    e.target.style.boxShadow = '0 8px 16px rgba(16, 185, 129, 0.2)';
                  }
                }}
                onMouseOut={(e) => {
                  e.target.style.transform = 'translateY(0)';
                  e.target.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
                }}
              >
                {analysisLoading.load ? 'Loading...' : '1. Load Resumes'}
              </button>

              <label style={{
                background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
                color: 'white',
                border: 'none',
                padding: '1rem 2rem',
                borderRadius: '12px',
                fontSize: '1.125rem',
                fontWeight: '600',
                cursor: analysisLoading.upload ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                transition: 'all 0.3s ease',
                opacity: analysisLoading.upload ? 0.6 : 1,
                textAlign: 'center',
                display: 'block'
              }}
              onMouseOver={(e) => {
                if (!analysisLoading.upload) {
                  e.target.style.transform = 'translateY(-2px)';
                  e.target.style.boxShadow = '0 8px 16px rgba(139, 92, 246, 0.2)';
                }
              }}
              onMouseOut={(e) => {
                e.target.style.transform = 'translateY(0)';
                e.target.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
              }}
              >
                {analysisLoading.upload ? 'Uploading...' : '1. Upload PDF Resumes'}
                <input
                  type="file"
                  multiple
                  accept=".pdf,application/pdf"
                  onChange={handleUploadFolder}
                  disabled={analysisLoading.upload}
                  style={{ display: 'none' }}
                />
              </label>
            </div>

            {/* Loaded Resumes Display */}
            {loadedResumes && (
              <div style={{
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '12px',
                padding: '1.5rem',
                marginBottom: '2rem'
              }}>
                <h3 style={{ color: '#166534', marginBottom: '1rem' }}>
                  📄 Loaded Resumes ({loadedResumes.resume_count})
                </h3>
                <p><strong>Job Keyword:</strong> {loadedResumes.job_keyword}</p>
                <p><strong>Message:</strong> {loadedResumes.msg}</p>
               
                {loadedResumes.resumes && loadedResumes.resumes.length > 0 && (
                  <div style={{ marginTop: '1rem' }}>
                    <h4 style={{ color: '#166534', marginBottom: '0.5rem' }}>Resume List:</h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {loadedResumes.resumes.map((resume, index) => (
                        <span key={index} style={{
                          backgroundColor: '#10b981',
                          color: 'white',
                          padding: '0.5rem 1rem',
                          borderRadius: '8px',
                          fontSize: '0.875rem',
                          fontWeight: '500'
                        }}>
                          {resume.name} ({resume.filename})
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Analysis Buttons */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: '1rem',
              marginBottom: '2rem'
            }}>
              <button
                onClick={handleAnalyzeLogistic}
                disabled={analysisLoading.logistic || !loadedResumes}
                style={{
                  background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                  color: 'white',
                  border: 'none',
                  padding: '1rem 1.5rem',
                  borderRadius: '12px',
                  fontSize: '1rem',
                  fontWeight: '600',
                  cursor: (analysisLoading.logistic || !loadedResumes) ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                  transition: 'all 0.3s ease',
                  opacity: (analysisLoading.logistic || !loadedResumes) ? 0.6 : 1
                }}
              >
                {analysisLoading.logistic ? 'Analyzing...' : '2. Analyze using Logistic Regression'}
              </button>

              <button
                onClick={handleAnalyzeLLM}
                disabled={analysisLoading.llm || !loadedResumes}
                style={{
                  background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                  color: 'white',
                  border: 'none',
                  padding: '1rem 1.5rem',
                  borderRadius: '12px',
                  fontSize: '1rem',
                  fontWeight: '600',
                  cursor: (analysisLoading.llm || !loadedResumes) ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                  transition: 'all 0.3s ease',
                  opacity: (analysisLoading.llm || !loadedResumes) ? 0.6 : 1
                }}
              >
                {analysisLoading.llm ? 'Analyzing...' : '4. Analyze using LLM'}
              </button>
            </div>

            {/* Sentiment Analysis Buttons */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '1rem',
              marginBottom: '2rem'
            }}>
              <button
                onClick={handleAnalyzeSentimentLogistic}
                disabled={analysisLoading.sentimentLogistic || !loadedResumes}
                style={{
                  background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                  color: 'white',
                  border: 'none',
                  padding: '1rem 2rem',
                  borderRadius: '12px',
                  fontSize: '1.125rem',
                  fontWeight: '600',
                  cursor: (analysisLoading.sentimentLogistic || !loadedResumes) ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                  transition: 'all 0.3s ease',
                  opacity: (analysisLoading.sentimentLogistic || !loadedResumes) ? 0.6 : 1
                }}
                onMouseOver={(e) => {
                  if (!analysisLoading.sentimentLogistic && loadedResumes) {
                    e.target.style.transform = 'translateY(-2px)';
                    e.target.style.boxShadow = '0 8px 16px rgba(245, 158, 11, 0.2)';
                  }
                }}
                onMouseOut={(e) => {
                  e.target.style.transform = 'translateY(0)';
                  e.target.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
                }}
              >
                {analysisLoading.sentimentLogistic ? 'Analyzing...' : '📊 Sentiment Analysis (Logistic)'}
              </button>

              <button
                onClick={handleAnalyzeSentimentLLM}
                disabled={analysisLoading.sentimentLLM || !loadedResumes}
                style={{
                  background: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
                  color: 'white',
                  border: 'none',
                  padding: '1rem 2rem',
                  borderRadius: '12px',
                  fontSize: '1.125rem',
                  fontWeight: '600',
                  cursor: (analysisLoading.sentimentLLM || !loadedResumes) ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                  transition: 'all 0.3s ease',
                  opacity: (analysisLoading.sentimentLLM || !loadedResumes) ? 0.6 : 1
                }}
                onMouseOver={(e) => {
                  if (!analysisLoading.sentimentLLM && loadedResumes) {
                    e.target.style.transform = 'translateY(-2px)';
                    e.target.style.boxShadow = '0 8px 16px rgba(6, 182, 212, 0.2)';
                  }
                }}
                onMouseOut={(e) => {
                  e.target.style.transform = 'translateY(0)';
                  e.target.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
                }}
              >
                {analysisLoading.sentimentLLM ? 'Analyzing...' : '📊 Sentiment Analysis (LLM)'}
              </button>
              <button
                onClick={handleSaveShortlistedLogistic}
                disabled={analysisLoading.shortlistLogistic || !logisticResults}
                style={{
                  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                  color: 'white',
                  border: 'none',
                  padding: '1rem 2rem',
                  borderRadius: '12px',
                  fontSize: '1.125rem',
                  fontWeight: '600',
                  cursor: (analysisLoading.shortlistLogistic || !logisticResults) ? 'not-allowed' : 'pointer',
                  opacity: (analysisLoading.shortlistLogistic || !logisticResults) ? 0.6 : 1
                }}
              >
                {analysisLoading.shortlistLogistic ? 'Saving...' : `Shortlist Top ${numCandidates} (Logistic)`}
              </button>
              <button
                onClick={handleSaveShortlistedLLM}
                disabled={analysisLoading.shortlistLLM || !llmResults}
                style={{
                  background: 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)',
                  color: 'white',
                  border: 'none',
                  padding: '1rem 2rem',
                  borderRadius: '12px',
                  fontSize: '1.125rem',
                  fontWeight: '600',
                  cursor: (analysisLoading.shortlistLLM || !llmResults) ? 'not-allowed' : 'pointer',
                  opacity: (analysisLoading.shortlistLLM || !llmResults) ? 0.6 : 1
                }}
              >
                {analysisLoading.shortlistLLM ? 'Saving...' : `Shortlist Top ${numCandidates} (Text Classifier)`}
              </button>
              <button
                onClick={handleExportAllCandidatesCSV}
                disabled={analysisLoading.exportCSV || (!logisticResults && !llmResults)}
                style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: 'white',
                  border: 'none',
                  padding: '1rem 2rem',
                  borderRadius: '12px',
                  fontSize: '1.125rem',
                  fontWeight: '600',
                  cursor: (analysisLoading.exportCSV || (!logisticResults && !llmResults)) ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                  transition: 'all 0.3s ease',
                  opacity: (analysisLoading.exportCSV || (!logisticResults && !llmResults)) ? 0.6 : 1
                }}
                onMouseOver={(e) => {
                  if (!analysisLoading.exportCSV && (logisticResults || llmResults)) {
                    e.target.style.transform = 'translateY(-2px)';
                    e.target.style.boxShadow = '0 8px 16px rgba(16, 185, 129, 0.2)';
                  }
                }}
                onMouseOut={(e) => {
                  e.target.style.transform = 'translateY(0)';
                  e.target.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
                }}
              >
                {analysisLoading.exportCSV ? 'Exporting...' : '📊 Export All Candidates to CSV'}
              </button>
              <button
                onClick={handleClearShortlistedCandidates}
                disabled={analysisLoading.clear}
                style={{
                  background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                  color: 'white',
                  border: 'none',
                  padding: '1rem 2rem',
                  borderRadius: '12px',
                  fontSize: '1.125rem',
                  fontWeight: '600',
                  cursor: analysisLoading.clear ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                  transition: 'all 0.3s ease',
                  opacity: analysisLoading.clear ? 0.6 : 1
                }}
                onMouseOver={(e) => {
                  if (!analysisLoading.clear) {
                    e.target.style.transform = 'translateY(-2px)';
                    e.target.style.boxShadow = '0 8px 16px rgba(239, 68, 68, 0.2)';
                  }
                }}
                onMouseOut={(e) => {
                  e.target.style.transform = 'translateY(0)';
                  e.target.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
                }}
              >
                {analysisLoading.clear ? 'Clearing...' : '🗑️ Clear Shortlisted Candidates'}
              </button>
            </div>


            {/* Results Display with Tabs */}
            {(logisticResults || llmResults) && (
              <div style={{ marginTop: '2rem' }}>
                <h3 style={{ color: '#374151', marginBottom: '1.5rem', textAlign: 'center' }}>
                  Analysis Results
                </h3>
               
                {/* Tab Navigation */}
                <div style={{ 
                  display: 'flex', 
                  gap: '1rem', 
                  justifyContent: 'center',
                  marginBottom: '2rem',
                  borderBottom: '2px solid #e5e7eb'
                }}>
                  <button
                    onClick={() => setActiveResultsTab('logistic')}
                    disabled={!logisticResults}
                    style={{
                      padding: '0.75rem 2rem',
                      background: activeResultsTab === 'logistic' ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' : '#f3f4f6',
                      color: activeResultsTab === 'logistic' ? 'white' : '#6b7280',
                      border: 'none',
                      borderRadius: '8px 8px 0 0',
                      fontSize: '1rem',
                      fontWeight: '600',
                      cursor: logisticResults ? 'pointer' : 'not-allowed',
                      opacity: logisticResults ? 1 : 0.5,
                      transition: 'all 0.3s ease',
                      borderBottom: activeResultsTab === 'logistic' ? '3px solid #2563eb' : '3px solid transparent'
                    }}
                  >
                    📊 Logistic Regression {logisticResults && `(${logisticResults.results?.length || 0} candidates)`}
                  </button>
                  <button
                    onClick={() => setActiveResultsTab('llm')}
                    disabled={!llmResults}
                    style={{
                      padding: '0.75rem 2rem',
                      background: activeResultsTab === 'llm' ? 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)' : '#f3f4f6',
                      color: activeResultsTab === 'llm' ? 'white' : '#6b7280',
                      border: 'none',
                      borderRadius: '8px 8px 0 0',
                      fontSize: '1rem',
                      fontWeight: '600',
                      cursor: llmResults ? 'pointer' : 'not-allowed',
                      opacity: llmResults ? 1 : 0.5,
                      transition: 'all 0.3s ease',
                      borderBottom: activeResultsTab === 'llm' ? '3px solid #7c3aed' : '3px solid transparent'
                    }}
                  >
                    🤖 LLM Analysis {llmResults && `(${llmResults.results?.length || 0} candidates)`}
                  </button>
                </div>

                {/* Tab Content */}
                <div style={{ 
                  background: 'white',
                  borderRadius: '12px',
                  padding: '2rem',
                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                  minHeight: '400px'
                }}>
                  {/* Logistic Regression Screen */}
                  {activeResultsTab === 'logistic' && logisticResults && logisticResults.results && (
                    <div style={{ width: "100%" }}>
                      <h4 style={{ marginBottom: "1rem", color: "#1f2937", display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '1.5rem' }}>📊</span>
                        <span>Logistic Regression Analysis Results</span>
                      </h4>
                      
                      {logisticResults.msg && (
                        <p style={{ marginBottom: '1rem', color: '#6b7280' }}><strong>Message:</strong> {logisticResults.msg}</p>
                      )}
                      
                      {/* Simplified results display - only Resume File and Predicted Label */}
                      <div style={{ 
                        marginTop: "1rem",
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(350px, 1fr))",
                        gap: "1rem"
                      }}>
                        {logisticResults.results && Array.isArray(logisticResults.results) && logisticResults.results.length > 0 ? (
                          logisticResults.results.map((result, idx) => {
                            console.log(`Logistic Result ${idx}:`, result);
                            
                            // Get the filename - try different possible field names
                            const filename = result["Resume File"] || result["resume_file"] || result.Filename || result.filename || "Unknown";
                            // Get the predicted label - try different possible field names  
                            const predictedLabel = result["Predicted Label"] || result["predicted_label"] || result["ML_Label"] || result.mlLabel || result.predictedLabel || result.label || "N/A";
                            
                            return (
                              <div key={idx} style={{
                                background: "white",
                                padding: "1.5rem",
                                borderRadius: "12px",
                                border: "1px solid #e5e7eb",
                                boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
                              }}>
                                <div style={{ display: "flex", alignItems: "center", marginBottom: "12px" }}>
                                  <span style={{ 
                                    fontSize: "20px", 
                                    marginRight: "10px",
                                    color: "#9333ea"
                                  }}>📄</span>
                                  <span style={{ color: "#b45309", fontWeight: "500", fontSize: "14px" }}>Resume File:</span>
                                  <span style={{ color: "#16a34a", marginLeft: "8px", fontWeight: "600", fontSize: "14px" }}>
                                    {filename}
                                  </span>
                                </div>
                                <div style={{ display: "flex", alignItems: "center" }}>
                                  <span style={{ 
                                    fontSize: "20px", 
                                    marginRight: "10px",
                                    color: "#eab308"
                                  }}>🏷️</span>
                                  <span style={{ color: "#b45309", fontWeight: "500", fontSize: "14px" }}>Predicted Label:</span>
                                  <span style={{ color: "#16a34a", marginLeft: "8px", fontWeight: "600", fontSize: "14px" }}>
                                    {predictedLabel}
                                  </span>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div style={{ padding: "2rem", textAlign: "center", color: "#6b7280" }}>
                            <p>No results found. Results: {logisticResults.results ? (Array.isArray(logisticResults.results) ? `Array with ${logisticResults.results.length} items` : `Type: ${typeof logisticResults.results}`) : "undefined"}</p>
                            <p style={{ fontSize: "12px", marginTop: "10px" }}>Check browser console (F12) for details.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* LLM Screen */}
                  {activeResultsTab === 'llm' && llmResults && (
                    <div style={{ width: "100%" }}>
                      <h4 style={{ marginBottom: "1rem", color: "#7c3aed", display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '1.5rem' }}>🤖</span>
                        <span>LLM Analysis Results</span>
                      </h4>
                      {llmResults.msg && (
                        <p style={{ marginBottom: '1rem', color: '#6b7280' }}><strong>Message:</strong> {llmResults.msg}</p>
                      )}
                      
                      {/* Simplified results display - only Resume File and Predicted Label */}
                      <div style={{ 
                        marginTop: "1rem",
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(350px, 1fr))",
                        gap: "1rem"
                      }}>
                        {llmResults.results && Array.isArray(llmResults.results) && llmResults.results.length > 0 ? (
                          llmResults.results.map((result, idx) => {
                            console.log(`LLM Result ${idx}:`, result);
                            
                            // Get the filename - try different possible field names
                            const filename = result["Resume File"] || result["resume_file"] || result.Filename || result.filename || "Unknown";
                            // Get the predicted label - try different possible field names
                            const predictedLabel = result["Predicted Label"] || result["predicted_label"] || result["ML_Label"] || result.mlLabel || result.predictedLabel || result.label || "N/A";
                            
                            return (
                              <div key={idx} style={{
                                background: "white",
                                padding: "1.5rem",
                                borderRadius: "12px",
                                border: "1px solid #e5e7eb",
                                boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
                              }}>
                                <div style={{ display: "flex", alignItems: "center", marginBottom: "12px" }}>
                                  <span style={{ 
                                    fontSize: "20px", 
                                    marginRight: "10px",
                                    color: "#9333ea"
                                  }}>📄</span>
                                  <span style={{ color: "#b45309", fontWeight: "500", fontSize: "14px" }}>Resume File:</span>
                                  <span style={{ color: "#16a34a", marginLeft: "8px", fontWeight: "600", fontSize: "14px" }}>
                                    {filename}
                                  </span>
                                </div>
                                <div style={{ display: "flex", alignItems: "center" }}>
                                  <span style={{ 
                                    fontSize: "20px", 
                                    marginRight: "10px",
                                    color: "#eab308"
                                  }}>🏷️</span>
                                  <span style={{ color: "#b45309", fontWeight: "500", fontSize: "14px" }}>Predicted Label:</span>
                                  <span style={{ color: "#16a34a", marginLeft: "8px", fontWeight: "600", fontSize: "14px" }}>
                                    {predictedLabel}
                                  </span>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div style={{ padding: "2rem", textAlign: "center", color: "#6b7280" }}>
                            <p>No results found. Results: {llmResults.results ? (Array.isArray(llmResults.results) ? `Array with ${llmResults.results.length} items` : `Type: ${typeof llmResults.results}`) : "undefined"}</p>
                            <p style={{ fontSize: "12px", marginTop: "10px" }}>Check browser console (F12) for details.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* No results message */}
                  {activeResultsTab === 'logistic' && !logisticResults && (
                    <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
                      <p style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>📊 No Logistic Regression Results</p>
                      <p>Please analyze resumes using Logistic Regression to see results here.</p>
                    </div>
                  )}

                  {activeResultsTab === 'llm' && !llmResults && (
                    <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
                      <p style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>🤖 No LLM Results</p>
                      <p>Please analyze resumes using LLM to see results here.</p>
                </div>
                  )}
                </div>
              </div>
            )}

                {/* Sentiment Analysis Results */}
                {(sentimentLogisticResults || sentimentLLMResults) && (
                  <div style={{ marginTop: '2rem' }}>
                    <h3 style={{ color: '#374151', marginBottom: '1rem', textAlign: 'center' }}>
                      Sentiment Analysis Results
                    </h3>
                   
                    <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                      {sentimentLogisticResults && (
                        <div style={{
                          flex: '1',
                          minWidth: '300px',
                          background: '#fef3c7',
                          border: '1px solid #fde68a',
                          borderRadius: '12px',
                          padding: '1.5rem'
                        }}>
                          <h4 style={{ color: '#92400e', marginBottom: '1rem' }}>
                            📊 Sentiment Analysis (Logistic Model)
                          </h4>
                          <p><strong>Message:</strong> {sentimentLogisticResults.msg}</p>
                         
                          {sentimentLogisticResults.results && sentimentLogisticResults.results.length > 0 && (
                            <div style={{ marginTop: '1rem' }}>
                              {sentimentLogisticResults.results.map((result, index) => (
                                <div key={index} style={{
                                  background: 'white',
                                  padding: '0.75rem',
                                  borderRadius: '8px',
                                  marginBottom: '0.5rem',
                                  border: '1px solid #e5e7eb'
                                }}>
                                  <div><strong>{result.Name}</strong></div>
                                  <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
                                    {result.Filename}
                                  </div>
                                  <div style={{ marginTop: '0.5rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                      <span style={{
                                        padding: '0.25rem 0.5rem',
                                        borderRadius: '4px',
                                        fontSize: '0.75rem',
                                        fontWeight: '600',
                                      backgroundColor: (result.Rating_Category || (result.Confidence_Percent > 80 ? "Strong" : result.Confidence_Percent >= 60 ? "Intermediate" : "Weak")) === "Strong" ? "#10b981" : (result.Rating_Category || (result.Confidence_Percent > 80 ? "Strong" : result.Confidence_Percent >= 60 ? "Intermediate" : "Weak")) === "Intermediate" ? "#f59e0b" : "#ef4444",
                                      color: 'white',
                                      textTransform: 'capitalize'
                                      }}>
                                      {result.Rating_Category || (result.Confidence_Percent > 80 ? "Strong" : result.Confidence_Percent >= 60 ? "Intermediate" : "Weak")}
                                      </span>
                                      <span style={{
                                        padding: '0.25rem 0.5rem',
                                        borderRadius: '4px',
                                        fontSize: '0.75rem',
                                        fontWeight: '600',
                                        backgroundColor: '#6b7280',
                                      color: 'white'
                                    }}>
                                      Confidence: {result.Confidence_Percent}%
                                    </span>
                                    {result.Sentiment_Score !== undefined && (
                                      <span style={{
                                        padding: '0.25rem 0.5rem',
                                        borderRadius: '4px',
                                        fontSize: '0.75rem',
                                        fontWeight: '600',
                                        backgroundColor: '#10b981',
                                        color: 'white'
                                      }}>
                                        Score: {result.Sentiment_Score}
                                      </span>
                                    )}
                                    <span style={{
                                      padding: '0.25rem 0.5rem',
                                      borderRadius: '4px',
                                      fontSize: '0.75rem',
                                      fontWeight: '600',
                                      backgroundColor: (result.Selected === "Selected") ? "#10b981" : "#ef4444",
                                      color: 'white'
                                    }}>
                                      {result.Selected || "Not Selected"}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {sentimentLLMResults && (
                        <div style={{
                          flex: '1',
                          minWidth: '300px',
                          background: '#dbeafe',
                          border: '1px solid #93c5fd',
                          borderRadius: '12px',
                          padding: '1.5rem'
                        }}>
                          <h4 style={{ color: '#1e40af', marginBottom: '1rem' }}>
                            📊 Sentiment Analysis (LLM Model)
                          </h4>
                          <p><strong>Message:</strong> {sentimentLLMResults.msg}</p>
                         
                          {sentimentLLMResults.results && sentimentLLMResults.results.length > 0 && (
                            <div style={{ marginTop: '1rem' }}>
                              {sentimentLLMResults.results.map((result, index) => (
                                <div key={index} style={{
                                  background: 'white',
                                  padding: '0.75rem',
                                  borderRadius: '8px',
                                  marginBottom: '0.5rem',
                                  border: '1px solid #e5e7eb'
                                }}>
                                  <div><strong>{result.Name}</strong></div>
                                  <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
                                    {result.Filename}
                                  </div>
                                  <div style={{ marginTop: '0.5rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <span style={{
                                      padding: '0.25rem 0.5rem',
                                      borderRadius: '4px',
                                      fontSize: '0.75rem',
                                      fontWeight: '600',
                                      backgroundColor: (result.Rating_Category || (result.Confidence_Percent > 80 ? "Strong" : result.Confidence_Percent >= 60 ? "Intermediate" : "Weak")) === "Strong" ? "#10b981" : (result.Rating_Category || (result.Confidence_Percent > 80 ? "Strong" : result.Confidence_Percent >= 60 ? "Intermediate" : "Weak")) === "Intermediate" ? "#f59e0b" : "#ef4444",
                                        color: 'white',
                                        textTransform: 'capitalize'
                                      }}>
                                      {result.Rating_Category || (result.Confidence_Percent > 80 ? "Strong" : result.Confidence_Percent >= 60 ? "Intermediate" : "Weak")}
                                    </span>
                                    <span style={{
                                      padding: '0.25rem 0.5rem',
                                      borderRadius: '4px',
                                      fontSize: '0.75rem',
                                      fontWeight: '600',
                                      backgroundColor: '#6b7280',
                                      color: 'white'
                                    }}>
                                      Confidence: {result.Confidence_Percent}%
                                    </span>
                                    <span style={{
                                      padding: '0.25rem 0.5rem',
                                      borderRadius: '4px',
                                      fontSize: '0.75rem',
                                      fontWeight: '600',
                                      backgroundColor: (result.Selected === "Selected") ? "#10b981" : "#ef4444",
                                      color: 'white'
                                    }}>
                                      {result.Selected || "Not Selected"}
                                      </span>
                                    </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
          </div>
        )}
        {!showJobForm && (
          <div>
            <div style={{
              background: 'white',
              borderRadius: '20px',
              padding: '2rem',
              boxShadow: '0 25px 50px rgba(0, 0, 0, 0.15)',
              marginBottom: '2rem'
            }}>
              <h2 style={{
                fontSize: '1.875rem',
                fontWeight: '700',
                color: '#1f2937',
                marginBottom: '1rem',
                textAlign: 'center'
              }}>
                Top Ranked Candidates
              </h2>
              <p style={{
                fontSize: '1rem',
                color: '#6b7280',
                textAlign: 'center',
                marginBottom: '2rem'
              }}>
                Candidates are ranked by AI analysis of their resumes
              </p>
            </div>

            {loading ? (
              <div style={{
                background: 'white',
                borderRadius: '20px',
                padding: '3rem',
                boxShadow: '0 25px 50px rgba(0, 0, 0, 0.15)',
                textAlign: 'center'
              }}>
                <div style={{
                  fontSize: '1.125rem',
                  color: '#6b7280'
                }}>
                  Loading candidates...
                </div>
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
                gap: '2rem'
              }}>
                {candidates.slice(0, 3).map((candidate, index) => (
                  <div key={candidate._id} style={{
                    background: 'white',
                    borderRadius: '20px',
                    padding: '2rem',
                    boxShadow: '0 25px 50px rgba(0, 0, 0, 0.15)',
                    transition: 'all 0.3s ease',
                    border: index === 0 ? '3px solid #10b981' : '1px solid #e5e7eb',
                    position: 'relative'
                  }}>
                    {index === 0 && (
                      <div style={{
                        position: 'absolute',
                        top: '-10px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        color: 'white',
                        padding: '0.5rem 1.5rem',
                        borderRadius: '9999px',
                        fontSize: '0.875rem',
                        fontWeight: '600',
                        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                      }}>
                        🏆 BEST MATCH
                      </div>
                    )}
                   
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '1.5rem'
                    }}>
                      <h3 style={{
                        margin: '0',
                        color: '#1f2937',
                        fontSize: '1.5rem',
                        fontWeight: '700'
                      }}>
                        {candidate.name}
                      </h3>
                      <span style={{
                        backgroundColor: '#667eea',
                        color: 'white',
                        padding: '0.5rem 1rem',
                        borderRadius: '9999px',
                        fontSize: '0.875rem',
                        fontWeight: '600'
                      }}>
                        #{index + 1}
                      </span>
                    </div>
                   
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '1rem',
                      marginBottom: '1.5rem'
                    }}>
                      <div style={{
                        padding: '1rem',
                        background: '#f8fafc',
                        borderRadius: '12px',
                        textAlign: 'center'
                      }}>
                        <div style={{
                          fontSize: '2rem',
                          fontWeight: '800',
                          color: '#667eea',
                          marginBottom: '0.25rem'
                        }}>
                          {candidate.match_score || candidate.resume?.score || 'N/A'}
                        </div>
                        <div style={{
                          fontSize: '0.875rem',
                          color: '#6b7280',
                          fontWeight: '500'
                        }}>
                          {candidate.match_score ? 'Match Score /10' : 'AI Score /10'}
                        </div>
                      </div>
                      <div style={{
                        padding: '1rem',
                        background: '#f8fafc',
                        borderRadius: '12px',
                        textAlign: 'center'
                      }}>
                        <div style={{
                          fontSize: '1.25rem',
                          fontWeight: '700',
                          color: candidate.resume?.rating === 'strong' ? '#10b981' :
                                candidate.resume?.rating === 'intermediate' ? '#f59e0b' : '#ef4444',
                          marginBottom: '0.25rem',
                          textTransform: 'capitalize'
                        }}>
                          {candidate.resume?.rating || 'N/A'}
                        </div>
                        <div style={{
                          fontSize: '0.875rem',
                          color: '#6b7280',
                          fontWeight: '500'
                        }}>
                          Rating
                        </div>
                      </div>
                    </div>

                    {candidate.resume?.skills && candidate.resume.skills.length > 0 && (
                      <div style={{ marginBottom: '1.5rem' }}>
                        <div style={{
                          color: '#374151',
                          fontSize: '0.875rem',
                          fontWeight: '600',
                          marginBottom: '0.75rem'
                        }}>
                          Key Skills:
                        </div>
                        <div style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: '0.5rem'
                        }}>
                          {candidate.resume.skills.slice(0, 6).map((skill, idx) => (
                            <span key={idx} style={{
                              backgroundColor: '#667eea',
                              color: 'white',
                              padding: '0.375rem 0.75rem',
                              borderRadius: '8px',
                              fontSize: '0.75rem',
                              fontWeight: '500'
                            }}>
                              {skill}
                            </span>
                          ))}
                          {candidate.resume.skills.length > 6 && (
                            <span style={{
                              backgroundColor: '#e5e7eb',
                              color: '#6b7280',
                              padding: '0.375rem 0.75rem',
                              borderRadius: '8px',
                              fontSize: '0.75rem'
                            }}>
                              +{candidate.resume.skills.length - 6}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    <div style={{
                      padding: '1rem',
                      backgroundColor: '#f8fafc',
                      borderRadius: '12px',
                      border: '1px solid #e5e7eb',
                      marginBottom: '1rem'
                    }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        marginBottom: '0.5rem'
                      }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                          <polyline points="22,6 12,13 2,6"/>
                        </svg>
                        <span style={{
                          fontSize: '0.875rem',
                          fontWeight: '600',
                          color: '#374151'
                        }}>
                          Contact
                        </span>
                      </div>
                      <div style={{
                        fontSize: '0.875rem',
                        color: '#6b7280',
                        wordBreak: 'break-all'
                      }}>
                        {candidate.email}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div style={{
                      display: 'flex',
                      gap: '0.75rem'
                    }}>
                      <button
                        onClick={() => handleViewResume(candidate)}
                        style={{
                          flex: 1,
                          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                          color: 'white',
                          border: 'none',
                          padding: '0.75rem 1rem',
                          borderRadius: '8px',
                          fontSize: '0.875rem',
                          fontWeight: '600',
                          cursor: 'pointer',
                          transition: 'all 0.3s ease'
                        }}
                        onMouseOver={(e) => {
                          e.target.style.transform = 'translateY(-1px)';
                          e.target.style.boxShadow = '0 4px 8px rgba(102, 126, 234, 0.3)';
                        }}
                        onMouseOut={(e) => {
                          e.target.style.transform = 'translateY(0)';
                          e.target.style.boxShadow = 'none';
                        }}
                      >
                        📄 View Resume
                      </button>
                      <button
                        onClick={() => handleDownloadResume(candidate)}
                        style={{
                          flex: 1,
                          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                          color: 'white',
                          border: 'none',
                          padding: '0.75rem 1rem',
                          borderRadius: '8px',
                          fontSize: '0.875rem',
                          fontWeight: '600',
                          cursor: 'pointer',
                          transition: 'all 0.3s ease'
                        }}
                        onMouseOver={(e) => {
                          e.target.style.transform = 'translateY(-1px)';
                          e.target.style.boxShadow = '0 4px 8px rgba(16, 185, 129, 0.3)';
                        }}
                        onMouseOut={(e) => {
                          e.target.style.transform = 'translateY(0)';
                          e.target.style.boxShadow = 'none';
                        }}
                      >
                        ⬇️ Download
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Resume Modal */}
      {showResumeModal && resumeData && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '2rem'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '20px',
            maxWidth: '800px',
            width: '100%',
            maxHeight: '90vh',
            overflow: 'hidden',
            boxShadow: '0 25px 50px rgba(0, 0, 0, 0.25)'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '2rem 2rem 1rem 2rem',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
    <div>
                <h2 style={{
                  fontSize: '1.5rem',
                  fontWeight: '700',
                  color: '#1f2937',
                  margin: '0 0 0.25rem 0'
                }}>
                  {resumeData.name}'s Resume
                </h2>
                <p style={{
                  fontSize: '0.875rem',
                  color: '#6b7280',
                  margin: 0
                }}>
                  {resumeData.email}
                </p>
              </div>
              <button
                onClick={closeResumeModal}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: '#6b7280',
                  padding: '0.5rem',
                  borderRadius: '50%',
                  transition: 'all 0.3s ease'
                }}
                onMouseOver={(e) => {
                  e.target.style.backgroundColor = '#f3f4f6';
                  e.target.style.color = '#374151';
                }}
                onMouseOut={(e) => {
                  e.target.style.backgroundColor = 'transparent';
                  e.target.style.color = '#6b7280';
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div style={{
              padding: '2rem',
              maxHeight: 'calc(90vh - 120px)',
              overflow: 'auto'
            }}>
              {/* Resume Summary */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '1rem',
                marginBottom: '2rem'
              }}>
                <div style={{
                  padding: '1rem',
                  background: '#f8fafc',
                  borderRadius: '12px',
                  textAlign: 'center'
                }}>
                  <div style={{
                    fontSize: '1.5rem',
                    fontWeight: '700',
                    color: '#667eea',
                    marginBottom: '0.25rem'
                  }}>
                    {resumeData.resume_details.score}/10
                  </div>
                  <div style={{
                    fontSize: '0.875rem',
                    color: '#6b7280',
                    fontWeight: '500'
                  }}>
                    AI Score
                  </div>
                </div>
                <div style={{
                  padding: '1rem',
                  background: '#f8fafc',
                  borderRadius: '12px',
                  textAlign: 'center'
                }}>
                  <div style={{
                    fontSize: '1.25rem',
                    fontWeight: '700',
                    color: resumeData.resume_details.rating === 'strong' ? '#10b981' :
                          resumeData.resume_details.rating === 'intermediate' ? '#f59e0b' : '#ef4444',
                    marginBottom: '0.25rem',
                    textTransform: 'capitalize'
                  }}>
                    {resumeData.resume_details.rating}
                  </div>
                  <div style={{
                    fontSize: '0.875rem',
                    color: '#6b7280',
                    fontWeight: '500'
                  }}>
                    Rating
                  </div>
                </div>
                <div style={{
                  padding: '1rem',
                  background: '#f8fafc',
                  borderRadius: '12px',
                  textAlign: 'center'
                }}>
                  <div style={{
                    fontSize: '1.25rem',
                    fontWeight: '700',
                    color: '#667eea',
                    marginBottom: '0.25rem'
                  }}>
                    {resumeData.resume_details.skills.length}
                  </div>
                  <div style={{
                    fontSize: '0.875rem',
                    color: '#6b7280',
                    fontWeight: '500'
                  }}>
                    Skills Found
                  </div>
                </div>
              </div>

              {/* Skills */}
              {resumeData.resume_details.skills && resumeData.resume_details.skills.length > 0 && (
                <div style={{ marginBottom: '2rem' }}>
                  <h3 style={{
                    fontSize: '1.125rem',
                    fontWeight: '600',
                    color: '#374151',
                    marginBottom: '1rem'
                  }}>
                    Skills Identified:
                  </h3>
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.5rem'
                  }}>
                    {resumeData.resume_details.skills.map((skill, idx) => (
                      <span key={idx} style={{
                        backgroundColor: '#667eea',
                        color: 'white',
                        padding: '0.5rem 1rem',
                        borderRadius: '8px',
                        fontSize: '0.875rem',
                        fontWeight: '500'
                      }}>
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Education */}
              {resumeData.resume_details.education && resumeData.resume_details.education.length > 0 && (
                <div style={{ marginBottom: '2rem' }}>
                  <h3 style={{
                    fontSize: '1.125rem',
                    fontWeight: '600',
                    color: '#374151',
                    marginBottom: '1rem'
                  }}>
                    Education:
                  </h3>
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.5rem'
                  }}>
                    {resumeData.resume_details.education.map((edu, idx) => (
                      <span key={idx} style={{
                        backgroundColor: '#10b981',
                        color: 'white',
                        padding: '0.5rem 1rem',
                        borderRadius: '8px',
                        fontSize: '0.875rem',
                        fontWeight: '500'
                      }}>
                        {edu}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Experience */}
              {resumeData.resume_details.experience && resumeData.resume_details.experience.length > 0 && (
                <div style={{ marginBottom: '2rem' }}>
                  <h3 style={{
                    fontSize: '1.125rem',
                    fontWeight: '600',
                    color: '#374151',
                    marginBottom: '1rem'
                  }}>
                    Experience:
                  </h3>
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.5rem'
                  }}>
                    {resumeData.resume_details.experience.map((exp, idx) => (
                      <span key={idx} style={{
                        backgroundColor: '#f59e0b',
                        color: 'white',
                        padding: '0.5rem 1rem',
                        borderRadius: '8px',
                        fontSize: '0.875rem',
                        fontWeight: '500'
                      }}>
                        {exp}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Resume Content */}
              <div>
                <h3 style={{
                  fontSize: '1.125rem',
                  fontWeight: '600',
                  color: '#374151',
                  marginBottom: '1rem'
                }}>
                  Resume Content:
                </h3>
                <div style={{
                  background: '#f8fafc',
                  border: '1px solid #e5e7eb',
                  borderRadius: '12px',
                  padding: '1.5rem',
                  maxHeight: '300px',
                  overflow: 'auto',
                  fontFamily: 'monospace',
                  fontSize: '0.875rem',
                  lineHeight: '1.6',
                  color: '#374151',
                  whiteSpace: 'pre-wrap'
                }}>
                  {resumeData.resume_details.content || 'No resume content available'}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '1rem 2rem 2rem 2rem',
              borderTop: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '1rem'
            }}>
              <button
                onClick={() => handleDownloadResume(selectedCandidate)}
                style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: 'white',
                  border: 'none',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease'
                }}
                onMouseOver={(e) => {
                  e.target.style.transform = 'translateY(-1px)';
                  e.target.style.boxShadow = '0 4px 8px rgba(16, 185, 129, 0.3)';
                }}
                onMouseOut={(e) => {
                  e.target.style.transform = 'translateY(0)';
                  e.target.style.boxShadow = 'none';
                }}
              >
                ⬇️ Download Resume
              </button>
              <button
                onClick={closeResumeModal}
                style={{
                  background: '#6b7280',
                  color: 'white',
                  border: 'none',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease'
                }}
                onMouseOver={(e) => {
                  e.target.style.backgroundColor = '#4b5563';
                  e.target.style.transform = 'translateY(-1px)';
                }}
                onMouseOut={(e) => {
                  e.target.style.backgroundColor = '#6b7280';
                  e.target.style.transform = 'translateY(0)';
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}