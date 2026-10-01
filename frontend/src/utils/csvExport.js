/**
 * CSV Export Utility Functions
 */

/**
 * Convert array of objects to CSV string
 * @param {Array} data - Array of objects to convert
 * @param {Array} headers - Array of header names
 * @returns {string} CSV string
 */
export const arrayToCSV = (data, headers) => {
  if (!data || data.length === 0) return '';
  
  // Create header row
  const headerRow = headers.join(',');
  
  // Create data rows
  const dataRows = data.map(row => {
    return headers.map(header => {
      const value = row[header] || '';
      // Escape commas and quotes in values
      if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    }).join(',');
  });
  
  return [headerRow, ...dataRows].join('\n');
};

/**
 * Download CSV file
 * @param {string} csvContent - CSV content as string
 * @param {string} filename - Name of the file to download
 */
export const downloadCSV = (csvContent, filename) => {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};

/**
 * Export analysis results to CSV
 * @param {Object} analysisData - Analysis results data
 * @param {string} analysisType - Type of analysis (logistic_regression or zero_shot)
 * @param {string} jobKeyword - Job keyword used for analysis
 * @param {number} numCandidates - Number of candidates to shortlist
 */
export const exportAnalysisToCSV = (analysisData, analysisType, jobKeyword, numCandidates) => {
  if (!analysisData || !analysisData.results) {
    console.error('No analysis data to export');
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `${analysisType}_analysis_${jobKeyword}_${numCandidates}candidates_${timestamp}.csv`;
  
  // Prepare data for CSV
  const csvData = analysisData.results.map((candidate, index) => ({
    rank: index + 1,
    candidate_name: candidate.name,
    candidate_email: candidate.email,
    candidate_id: candidate.candidate_id,
    score: candidate.analysis?.score || 'N/A',
    rating: candidate.analysis?.rating || 'N/A',
    confidence_score: candidate.analysis?.confidence_score || 'N/A',
    predicted_success_probability: candidate.analysis?.predicted_success_probability || 'N/A',
    skills_count: candidate.analysis?.skills_count || 0,
    education_count: candidate.analysis?.education_count || 0,
    experience_count: candidate.analysis?.experience_count || 0,
    analysis_method: candidate.analysis?.analysis_method || analysisType,
    model_type: candidate.analysis?.model_type || 'unknown',
    analyzed_at: candidate.analysis?.analyzed_at || new Date().toISOString(),
    job_keyword: jobKeyword,
    num_candidates_requested: numCandidates
  }));

  // Define CSV headers
  const headers = [
    'rank',
    'candidate_name',
    'candidate_email',
    'candidate_id',
    'score',
    'rating',
    'confidence_score',
    'predicted_success_probability',
    'skills_count',
    'education_count',
    'experience_count',
    'analysis_method',
    'model_type',
    'analyzed_at',
    'job_keyword',
    'num_candidates_requested'
  ];

  // Convert to CSV and download
  const csvContent = arrayToCSV(csvData, headers);
  downloadCSV(csvContent, filename);
  
  console.log(`✅ Exported ${csvData.length} candidates to ${filename}`);
};

/**
 * Export shortlisted candidates to CSV
 * @param {Object} shortlistData - Shortlisted candidates data
 * @param {string} analysisType - Type of analysis (logistic_regression or zero_shot)
 * @param {string} jobKeyword - Job keyword used for analysis
 * @param {number} numCandidates - Number of candidates shortlisted
 */
export const exportShortlistToCSV = (shortlistData, analysisType, jobKeyword, numCandidates) => {
  if (!shortlistData || !shortlistData.candidates) {
    console.error('No shortlist data to export');
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `shortlisted_${analysisType}_${jobKeyword}_${numCandidates}candidates_${timestamp}.csv`;
  
  // Prepare data for CSV
  const csvData = shortlistData.candidates.map((candidate, index) => ({
    rank: index + 1,
    candidate_name: candidate.name,
    candidate_email: candidate.email,
    candidate_id: candidate.candidate_id,
    score: candidate.score || 'N/A',
    shortlist_id: shortlistData.shortlist_id,
    analysis_method: analysisType,
    job_keyword: jobKeyword,
    num_candidates_shortlisted: numCandidates,
    shortlisted_at: new Date().toISOString()
  }));

  // Define CSV headers
  const headers = [
    'rank',
    'candidate_name',
    'candidate_email',
    'candidate_id',
    'score',
    'shortlist_id',
    'analysis_method',
    'job_keyword',
    'num_candidates_shortlisted',
    'shortlisted_at'
  ];

  // Convert to CSV and download
  const csvContent = arrayToCSV(csvData, headers);
  downloadCSV(csvContent, filename);
  
  console.log(`✅ Exported ${csvData.length} shortlisted candidates to ${filename}`);
};

/**
 * Export loaded resumes summary to CSV
 * @param {Object} loadedResumesData - Loaded resumes data
 * @param {string} jobKeyword - Job keyword used for filtering
 */
export const exportLoadedResumesToCSV = (loadedResumesData, jobKeyword) => {
  if (!loadedResumesData || !loadedResumesData.resumes) {
    console.error('No loaded resumes data to export');
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `loaded_resumes_${jobKeyword}_${timestamp}.csv`;
  
  // Prepare data for CSV
  const csvData = loadedResumesData.resumes.map((resume, index) => ({
    rank: index + 1,
    candidate_name: resume.name,
    candidate_email: resume.email,
    candidate_id: resume.candidate_id,
    filename: resume.filename,
    uploaded_at: resume.uploaded_at,
    job_keyword: jobKeyword,
    total_resumes_loaded: loadedResumesData.resume_count,
    loaded_at: new Date().toISOString()
  }));

  // Define CSV headers
  const headers = [
    'rank',
    'candidate_name',
    'candidate_email',
    'candidate_id',
    'filename',
    'uploaded_at',
    'job_keyword',
    'total_resumes_loaded',
    'loaded_at'
  ];

  // Convert to CSV and download
  const csvContent = arrayToCSV(csvData, headers);
  downloadCSV(csvContent, filename);
  
  console.log(`✅ Exported ${csvData.length} loaded resumes to ${filename}`);
};

