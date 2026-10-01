import axios from "axios";
import { getToken } from "./utils/auth";

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://127.0.0.1:3000",
});

// Add request interceptor to include auth token
API.interceptors.request.use(
  (config) => {
    const token = getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor to handle auth errors
API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Authentication API calls
export const signup = async (data) => {
  try {
    const response = await API.post("/auth/signup", data);
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const login = async (data) => {
  try {
    const response = await API.post("/auth/login", data);
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const recruiterLogin = async (data) => {
  try {
    const response = await API.post("/recruiter/login", data);
    return response.data;
  } catch (error) {
    console.error("Recruiter login API error:", error);
    console.error("Error response:", error.response);
    console.error("Error response data:", error.response?.data);
    
    // Return error object with proper structure
    if (error.response?.data) {
      const errorData = error.response.data;
      // If it's already an object with detail, return it
      if (errorData.detail) {
        throw { detail: errorData.detail, response: error.response };
      }
      // If it's a string, wrap it
      if (typeof errorData === 'string') {
        throw { detail: errorData, response: error.response };
      }
      // Otherwise return the whole object
      throw { ...errorData, response: error.response };
    }
    
    // If no response, throw the error message
    throw { detail: error.message || "Login failed. Please check your credentials.", response: error.response };
  }
};

export const recruiterSignup = async (data) => {
  try {
    const response = await API.post("/recruiter/signup", data);
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

// Candidate API calls
export const uploadResume = async (formData) => {
  try {
    const response = await API.post("/candidate/upload-resume", formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const getMyResume = async () => {
  try {
    const response = await API.get("/candidate/my-resume");
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

// Recruiter API calls
export const getRankedCandidates = async (topN = 10) => {
  try {
    const response = await API.get(`/recruiter/candidates?topN=${topN}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const postJob = async (data) => {
  try {
    const response = await API.post("/recruiter/post-job", data);
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const getMyJobs = async () => {
  try {
    const response = await API.get("/recruiter/my-jobs");
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const getJobCandidates = async (jobId) => {
  try {
    const response = await API.get(`/recruiter/job-candidates/${jobId}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const getCandidateResume = async (candidateId) => {
  try {
    const response = await API.get(`/recruiter/candidate-resume/${candidateId}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const downloadResume = async (candidateId) => {
  try {
    const response = await API.get(`/recruiter/download-resume/${candidateId}`, {
      responseType: 'blob'
    });
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

// New candidate analysis endpoints
export const analyzeLogisticRegression = async () => {
  try {
    const response = await API.post("/candidate/analyze-logistic-regression");
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const analyzeZeroShot = async () => {
  try {
    const response = await API.post("/candidate/analyze-zero-shot");
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

// New recruiter endpoints
export const loadResumes = async (jobKeyword = "any") => {
  try {
    const response = await API.post("/recruiter/load-resumes", { job_keyword: jobKeyword });
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const analyzeResumesLogistic = async () => {
  try {
    const response = await API.post("/recruiter/analyze-resumes-logistic");
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const analyzeResumesLLM = async () => {
  try {
    const response = await API.post("/recruiter/analyze-resumes-llm");
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const analyzeSentimentLogistic = async () => {
  try {
    const response = await API.post("/recruiter/analyze-sentiment-logistic");
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const analyzeSentimentLLM = async () => {
  try {
    const response = await API.post("/recruiter/analyze-sentiment-llm");
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const uploadFolder = async (files) => {
  try {
    const formData = new FormData();
    files.forEach(file => {
      formData.append('files', file);
    });
    const response = await API.post("/recruiter/upload-folder", formData, {
      headers: { 
        'Content-Type': 'multipart/form-data'
      }
    });
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const saveShortlistedLogistic = async (numCandidates) => {
  try {
    const response = await API.post("/recruiter/save-shortlisted-logistic", {
      num_candidates: numCandidates,
      analysis_method: "logistic_regression"
    });
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const saveShortlistedLLM = async (numCandidates) => {
  try {
    const response = await API.post("/recruiter/save-shortlisted-llm", {
      num_candidates: numCandidates,
      analysis_method: "llm"
    });
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const exportShortlistedCSV = async () => {
  try {
    const response = await API.get("/recruiter/export-shortlisted-csv", {
      responseType: 'blob'
    });
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const getSentimentAnalysis = async () => {
  try {
    const response = await API.get("/recruiter/sentiment-analysis");
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const clearShortlistedCandidates = async () => {
  try {
    const response = await API.delete("/recruiter/clear-shortlisted-candidates");
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};
