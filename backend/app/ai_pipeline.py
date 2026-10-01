# Optional imports - catch all exceptions since transformers may have DLL issues
import logging
import datetime, re

SPACY_AVAILABLE = False
TRANSFORMERS_AVAILABLE = False

try:
    import spacy
    SPACY_AVAILABLE = True
except Exception as e:
    SPACY_AVAILABLE = False
    logging.warning(f"spaCy not available: {type(e).__name__}: {e}")

try:
    from transformers import pipeline
    TRANSFORMERS_AVAILABLE = True
except Exception as e:
    TRANSFORMERS_AVAILABLE = False
    logging.warning(f"transformers not available: {type(e).__name__}: {e}")

# Optional imports for file processing
try:
    import pdfplumber
    PDFPLUMBER_AVAILABLE = True
except ImportError:
    PDFPLUMBER_AVAILABLE = False
    logging.warning("pdfplumber not available. PDF extraction will not work.")

try:
    import docx
    DOCX_AVAILABLE = True
except ImportError:
    DOCX_AVAILABLE = False
    logging.warning("python-docx not available. DOCX extraction will not work.")

# Global variables for lazy loading
nlp = None
sentiment_model = None

logger = logging.getLogger(__name__)

def get_spacy_model():
    """Lazy load spaCy model"""
    global nlp
    if not SPACY_AVAILABLE:
        return None
    if nlp is None:
        try:
            nlp = spacy.load("en_core_web_sm")
            logger.info("spaCy model loaded successfully")
        except Exception as e:
            logger.warning(f"Failed to load spaCy model: {e}")
            # Fallback to basic text processing
            nlp = None
    return nlp

def get_sentiment_model():
    """Lazy load HuggingFace sentiment model"""
    global sentiment_model
    if not TRANSFORMERS_AVAILABLE:
        return None
    if sentiment_model is None:
        try:
            sentiment_model = pipeline("sentiment-analysis", model="distilbert/distilbert-base-uncased-finetuned-sst-2-english")
            logger.info("Sentiment model loaded successfully")
        except Exception as e:
            logger.warning(f"Failed to load sentiment model: {e}")
            # Fallback to simple scoring
            sentiment_model = None
    return sentiment_model

# Enhanced skill keywords database
TECHNICAL_SKILLS = {
    # Programming Languages
    "languages": [
        "python", "java", "javascript", "typescript", "c++", "c#", "php", "ruby", "go", "rust",
        "swift", "kotlin", "scala", "r", "matlab", "perl", "haskell", "clojure", "elixir", "dart"
    ],
    # Web Technologies
    "web": [
        "html", "css", "react", "angular", "vue.js", "node.js", "express", "django", "flask",
        "fastapi", "spring", "laravel", "symfony", "rails", "asp.net", "jquery", "bootstrap",
        "sass", "less", "webpack", "babel", "gulp", "grunt", "next.js", "nuxt.js"
    ],
    # Databases
    "databases": [
        "mysql", "postgresql", "mongodb", "redis", "elasticsearch", "cassandra", "sqlite",
        "oracle", "sql server", "dynamodb", "neo4j", "influxdb", "couchdb", "firebase"
    ],
    # Cloud & DevOps
    "cloud": [
        "aws", "azure", "google cloud", "docker", "kubernetes", "jenkins", "gitlab", "github",
        "terraform", "ansible", "chef", "puppet", "vagrant", "nginx", "apache", "linux", "bash"
    ],
    # Data Science & AI
    "data_ai": [
        "machine learning", "deep learning", "tensorflow", "pytorch", "scikit-learn", "pandas",
        "numpy", "matplotlib", "seaborn", "plotly", "jupyter", "data science", "nlp",
        "computer vision", "opencv", "spark", "hadoop", "kafka", "airflow", "tableau", "power bi"
    ],
    # Mobile Development
    "mobile": [
        "android", "ios", "react native", "flutter", "xamarin", "cordova", "ionic"
    ],
    # Other Technologies
    "other": [
        "git", "svn", "mercurial", "microservices", "rest api", "graphql", "soap",
        "blockchain", "ethereum", "solidity", "cybersecurity", "penetration testing"
    ]
}

SOFT_SKILLS = [
    "leadership", "communication", "teamwork", "problem solving", "project management",
    "agile", "scrum", "kanban", "time management", "analytical", "creative", "adaptable",
    "collaboration", "mentoring", "presentation", "negotiation", "critical thinking",
    "strategic planning", "decision making", "conflict resolution", "customer service"
]

def extract_skills(text: str):
    skills_found = []
    text_lower = text.lower()
    
    # Try to use spaCy for advanced NLP processing
    spacy_model = get_spacy_model()
    if spacy_model:
        try:
            doc = spacy_model(text_lower)
            
            # Extract technical skills using spaCy
            for category, skill_list in TECHNICAL_SKILLS.items():
                for skill in skill_list:
                    if skill in text_lower:
                        skills_found.append(skill.title())
            
            # Extract soft skills
            for skill in SOFT_SKILLS:
                if skill in text_lower:
                    skills_found.append(skill.title())
            
            # Extract skills with context using spaCy
            for token in doc:
                if token.pos_ == "NOUN" and len(token.text) > 2:
                    # Check if it's a technical term
                    if any(tech_word in token.text for tech_word in ["api", "sql", "js", "css", "html"]):
                        skills_found.append(token.text.title())
                        
        except Exception as e:
            logger.warning(f"spaCy processing failed: {e}")
    
    # Fallback: comprehensive keyword matching
    if not skills_found:
        for category, skill_list in TECHNICAL_SKILLS.items():
            for skill in skill_list:
                if skill in text_lower:
                    skills_found.append(skill.title())
        
        for skill in SOFT_SKILLS:
            if skill in text_lower:
                skills_found.append(skill.title())
    
    # Extract skills with regex patterns
    skill_patterns = [
        r'(\w+)\s*\(?\d+\+?\s*years?\)?',  # "Python (3 years)"
        r'(\w+)\s*experience',  # "Java experience"
        r'proficient in\s+(\w+)',  # "Proficient in React"
        r'expertise in\s+(\w+)',  # "Expertise in AWS"
        r'familiar with\s+(\w+)',  # "Familiar with Docker"
        r'knowledge of\s+(\w+)',  # "Knowledge of SQL"
        r'working with\s+(\w+)',  # "Working with Kubernetes"
    ]
    
    for pattern in skill_patterns:
        matches = re.findall(pattern, text_lower)
        for match in matches:
            if isinstance(match, tuple):
                match = match[0]
            if len(match) > 2 and match not in ['the', 'and', 'for', 'with']:
                skills_found.append(match.title())
    
    return list(set(skills_found))

def analyze_sentiment(text: str):
    # Try to use HuggingFace model if available
    model = get_sentiment_model()
    if model:
        try:
            result = model(text[:512])[0]  # analyze first 512 chars
            if result["label"] == "POSITIVE":
                return min(result["score"], 1.0)
            else:
                return 1 - result["score"]
        except Exception as e:
            logger.warning(f"Sentiment analysis failed: {e}")
    
    # Fallback: simple positive word counting
    positive_words = ["excellent", "good", "strong", "experienced", "skilled", "proficient", "expert", "advanced"]
    negative_words = ["poor", "weak", "basic", "limited", "beginner", "inexperienced"]
    
    text_lower = text.lower()
    positive_count = sum(1 for word in positive_words if word in text_lower)
    negative_count = sum(1 for word in negative_words if word in text_lower)
    
    if positive_count + negative_count == 0:
        return 0.7  # neutral score
    else:
        return max(0.1, min(1.0, (positive_count - negative_count + 2) / 4))

def calculate_score(skills, sentiment_score):
    # Simple scoring formula
    skill_score = min(len(skills) / 5, 1.0)  # max out at 5 skills
    final_score = round((skill_score * 6) + (sentiment_score * 4), 2)  # scale to 10
    if final_score < 5:
        rating = "poor"
    elif final_score < 8:
        rating = "intermediate"
    else:
        rating = "strong"
    return final_score, rating

def extract_education(text: str):
    """Extract education information from resume text using enhanced patterns"""
    education_found = []
    text_lower = text.lower()
    
    # Degree types
    degrees = [
        "bachelor", "master", "phd", "doctorate", "associate", "diploma", "certificate",
        "bsc", "msc", "mba", "be", "me", "btech", "mtech", "bca", "mca", "bba", "mba",
        "bcom", "mcom", "ba", "ma", "bs", "ms", "md", "dds", "jd", "llb", "llm"
    ]
    
    # Educational institutions and fields
    education_fields = [
        "computer science", "information technology", "software engineering", "data science",
        "business administration", "management", "engineering", "mathematics", "statistics",
        "physics", "chemistry", "biology", "economics", "finance", "marketing", "accounting",
        "psychology", "sociology", "literature", "history", "political science"
    ]
    
    # Extract degree information
    for degree in degrees:
        if degree in text_lower:
            education_found.append(degree.title())
    
    # Extract education fields
    for field in education_fields:
        if field in text_lower:
            education_found.append(field.title())
    
    # Extract education using regex patterns
    education_patterns = [
        r'(\w+)\s+(degree|diploma|certificate)',  # "Bachelor degree"
        r'(bachelor|master|phd|doctorate)\s+of\s+(\w+)',  # "Master of Science"
        r'(\w+)\s+in\s+(\w+)',  # "Degree in Computer Science"
        r'(\d{4})\s*[-–]\s*(\d{4})',  # "2018-2022" (education years)
        r'gpa\s*:?\s*([0-9.]+)',  # "GPA: 3.8"
        r'graduated\s+from\s+(\w+)',  # "Graduated from MIT"
    ]
    
    for pattern in education_patterns:
        matches = re.findall(pattern, text_lower)
        for match in matches:
            if isinstance(match, tuple):
                for item in match:
                    if len(item) > 2:
                        education_found.append(item.title())
            else:
                if len(match) > 2:
                    education_found.append(match.title())
    
    # Use spaCy for advanced education extraction
    spacy_model = get_spacy_model()
    if spacy_model:
        try:
            doc = spacy_model(text_lower)
            for ent in doc.ents:
                if ent.label_ in ["ORG", "PERSON"] and any(edu_word in ent.text.lower() for edu_word in ["university", "college", "institute"]):
                    education_found.append(ent.text.title())
        except Exception as e:
            logger.warning(f"spaCy education extraction failed: {e}")
    
    return list(set(education_found))

def extract_experience(text: str):
    """Extract experience information from resume text using enhanced patterns"""
    experience_found = []
    text_lower = text.lower()
    
    # Experience levels and roles
    experience_levels = [
        "senior", "junior", "lead", "principal", "staff", "director", "vice president",
        "ceo", "cto", "cfo", "manager", "supervisor", "coordinator", "specialist",
        "expert", "consultant", "architect", "developer", "engineer", "analyst"
    ]
    
    # Employment types
    employment_types = [
        "full-time", "part-time", "contract", "freelance", "intern", "internship",
        "remote", "onsite", "hybrid", "temporary", "permanent"
    ]
    
    # Experience indicators
    experience_indicators = [
        "years", "experience", "experienced", "worked", "employment", "career",
        "responsibilities", "achievements", "projects", "leadership", "team"
    ]
    
    # Extract experience levels
    for level in experience_levels:
        if level in text_lower:
            experience_found.append(level.title())
    
    # Extract employment types
    for emp_type in employment_types:
        if emp_type in text_lower:
            experience_found.append(emp_type.title())
    
    # Extract experience indicators
    for indicator in experience_indicators:
        if indicator in text_lower:
            experience_found.append(indicator.title())
    
    # Extract experience using regex patterns
    experience_patterns = [
        r'(\d+)\+?\s*years?\s+(of\s+)?(experience|exp)',  # "5+ years experience"
        r'(\d+)\s*[-–]\s*(\d+)\s*years?',  # "3-5 years"
        r'(senior|junior|lead|principal)\s+(\w+)',  # "Senior Developer"
        r'(\w+)\s+(developer|engineer|analyst|manager)',  # "Software Engineer"
        r'worked\s+(at|for|with)\s+(\w+)',  # "Worked at Google"
        r'(\d{4})\s*[-–]\s*(present|\d{4})',  # "2020-present" or "2020-2023"
    ]
    
    for pattern in experience_patterns:
        matches = re.findall(pattern, text_lower)
        for match in matches:
            if isinstance(match, tuple):
                for item in match:
                    if len(item) > 2 and item not in ['at', 'for', 'with', 'of']:
                        experience_found.append(item.title())
            else:
                if len(match) > 2:
                    experience_found.append(match.title())
    
    # Use spaCy for advanced experience extraction
    spacy_model = get_spacy_model()
    if spacy_model:
        try:
            doc = spacy_model(text_lower)
            for ent in doc.ents:
                if ent.label_ == "DATE" and any(exp_word in ent.text.lower() for exp_word in ["year", "month", "experience"]):
                    experience_found.append(ent.text.title())
        except Exception as e:
            logger.warning(f"spaCy experience extraction failed: {e}")
    
    return list(set(experience_found))

def extract_contact_info(text: str):
    """Extract contact information from resume text"""
    import re
    
    # Email pattern
    email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
    emails = re.findall(email_pattern, text)
    
    # Phone pattern (basic)
    phone_pattern = r'(\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})'
    phones = re.findall(phone_pattern, text)
    
    return {
        "emails": emails,
        "phones": [''.join(phone) for phone in phones]
    }


def _ocr_pdf(file_path: str) -> str:
    """Optional OCR fallback for scanned PDFs."""
    try:
        from pdf2image import convert_from_path
        import pytesseract
    except Exception as e:
        logger.warning("OCR libraries not available (%s). Scanned PDFs may have no text.", e)
        return ""
    try:
        text = ""
        for image in convert_from_path(file_path, dpi=200):
            text += pytesseract.image_to_string(image) or ""
        return text.strip()
    except Exception as e:
        logger.warning("OCR extraction failed: %s", e)
        return ""


def extract_text_from_file(file_path: str) -> str:
    text = ""
    if file_path.lower().endswith(".pdf"):
        if not PDFPLUMBER_AVAILABLE:
            raise ImportError("pdfplumber is required for PDF extraction. Please install it with: pip install pdfplumber")
        try:
            with pdfplumber.open(file_path) as pdf:
                for page in pdf.pages:
                    text += page.extract_text() or ""
        except Exception as e:
            logger.error(f"PDF extraction failed: {e}")
            raise
        if len(text.strip()) < 50:
            ocr_text = _ocr_pdf(file_path)
            if ocr_text:
                text = (text + "\n" + ocr_text).strip()
    elif file_path.lower().endswith((".docx", ".doc")):
        if not DOCX_AVAILABLE:
            raise ImportError("python-docx is required for DOCX extraction. Please install it with: pip install python-docx")
        try:
            doc = docx.Document(file_path)
            text = "\n".join([para.text for para in doc.paragraphs])
        except Exception as e:
            logger.error(f"DOCX extraction failed: {e}")
            raise
    else:
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                text = f.read()
        except Exception as e:
            logger.error(f"Text file reading failed: {e}")
            text = ""
    return text.strip()


# process_resume function removed - functionality split into separate upload and analysis endpoints
