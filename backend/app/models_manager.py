"""
Model Manager for Resume AI Application
Handles loading and using trained ML models for resume analysis
"""

import os
import pickle
import numpy as np
from typing import Dict, Any
import logging
from sklearn.exceptions import NotFittedError

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class ModelManager:
    """Manages loading and using trained ML models"""

    def __init__(self):
        self.models_dir = os.path.join(os.path.dirname(__file__), "..", "models")
        self.logistic_model = None
        self.llm_model = None
        self.logistic_sentiment_model = None
        self.llm_sentiment_model = None
        self.model_loaded = False

        # Create models directory if it doesn't exist
        os.makedirs(self.models_dir, exist_ok=True)

    def load_models(self) -> bool:
        """Load trained models from the models directory"""
        try:
            # Try to load Logistic Regression Model (logistic_regression.pkl)
            logistic_model_path = os.path.join(self.models_dir, "logistic_regression.pkl")
            if os.path.exists(logistic_model_path):
                try:
                    with open(logistic_model_path, "rb") as f:
                        self.logistic_model = pickle.load(f)
                    logger.info("✅ Logistic Regression model loaded successfully")
                except Exception as e:
                    logger.warning(f"⚠️ Failed to load Logistic Regression model: {str(e)}")
                    self.logistic_model = None
            else:
                logger.warning("⚠️ Logistic Regression model not found at " + logistic_model_path)

            # Try to load LLM Model (llm.pkl)
            llm_model_path = os.path.join(self.models_dir, "llm_trained.pkl")
            if os.path.exists(llm_model_path):
                try:
                    with open(llm_model_path, "rb") as f:
                        self.llm_model = pickle.load(f)
                    logger.info("✅ LLM model loaded successfully")
                except Exception as e:
                    logger.warning(f"⚠️ Failed to load LLM model: {str(e)}")
                    self.llm_model = None
            else:
                logger.warning("⚠️ LLM model not found at " + llm_model_path)

            # Try to load Logistic Sentiment Model (logistic_trained_sentiment.pkl)
            logistic_sentiment_path = os.path.join(self.models_dir, "logistic_trained_sentiment.pkl")
            if os.path.exists(logistic_sentiment_path):
                try:
                    with open(logistic_sentiment_path, "rb") as f:
                        self.logistic_sentiment_model = pickle.load(f)
                    logger.info("✅ Logistic Sentiment model loaded successfully")
                except Exception as e:
                    logger.warning(f"⚠️ Failed to load Logistic Sentiment model: {str(e)}")
                    self.logistic_sentiment_model = None
            else:
                logger.warning("⚠️ Logistic Sentiment model not found at " + logistic_sentiment_path)

            # Try to load LLM Sentiment Model (llm_sentiment_trained.pkl)
            llm_sentiment_path = os.path.join(self.models_dir, "llm_sentiment_trained.pkl")
            if os.path.exists(llm_sentiment_path):
                try:
                    with open(llm_sentiment_path, "rb") as f:
                        self.llm_sentiment_model = pickle.load(f)
                    logger.info("✅ LLM Sentiment model loaded successfully")
                except Exception as e:
                    logger.warning(f"⚠️ Failed to load LLM Sentiment model: {str(e)}")
                    self.llm_sentiment_model = None
            else:
                logger.warning("⚠️ LLM Sentiment model not found at " + llm_sentiment_path)

            self.model_loaded = True
            logger.info("✅ Model manager initialized successfully")
            return True

        except Exception as e:
            logger.error(f"❌ Error loading models: {str(e)}")
            self.model_loaded = False
            return False

    def predict_logistic_regression(self, english_score: float, qualification_num: bool, age_status_num: bool) -> Dict[str, Any]:
        """Predict using Logistic Regression model
        Matches the training code format from logireg.ipynb
        Args:
            english_score: Numeric score 0-100
            qualification_num: True/False encoded qualification (mapped to 0/1)
            age_status_num: True/False encoded age status (mapped to 0/1)
        Returns:
            Prediction result with rating (Worst/Average/Good) matching training labels:
            0 = Worst, 1 = Average, 2 = Good
        """
        try:
            if self.logistic_model:
                # Prepare features as numpy array matching training format: [english_score, qualification_num, age_status_num]
                # Convert boolean to int (True=1, False=0) to match LabelEncoder output
                features = np.array([[english_score, int(qualification_num), int(age_status_num)]])
                
                # Use DataFrame with feature names if model was trained with feature names
                try:
                    import pandas as pd
                    features_df = pd.DataFrame(features, columns=['english_score', 'qualification_num', 'age_status_num'])
                    prediction = self.logistic_model.predict(features_df)[0]
                    probability = self.logistic_model.predict_proba(features_df)[0]
                except:
                    # Fallback to numpy array if DataFrame doesn't work
                    prediction = self.logistic_model.predict(features)[0]
                    probability = self.logistic_model.predict_proba(features)[0]
                
                confidence_score = float(np.max(probability))
                
                # Map prediction to label matching training code (0=Worst, 1=Average, 2=Good)
                if isinstance(prediction, (int, np.integer)):
                    if prediction == 0:
                        rating = "Worst"
                    elif prediction == 1:
                        rating = "Average"
                    elif prediction == 2:
                        rating = "Good"
                    else:
                        rating = f"Unknown_{prediction}"
                else:
                    rating = str(prediction)

                # Get probabilities for each class (Worst, Average, Good)
                probabilities = [float(p) for p in probability] if len(probability) > 1 else [float(probability[0])]

                return {
                    "rating": rating,
                    "rating_num": int(prediction) if isinstance(prediction, (int, np.integer)) else 1,
                    "confidence_score": confidence_score,
                    "probabilities": {
                        "Worst": probabilities[0] if len(probabilities) > 0 else 0.0,
                        "Average": probabilities[1] if len(probabilities) > 1 else 0.0,
                        "Good": probabilities[2] if len(probabilities) > 2 else 0.0
                    },
                    "all_probabilities": probabilities,
                    "model_type": "trained_logistic_regression",
                    "features": {
                        "english_score": english_score,
                        "qualification_num": int(qualification_num),
                        "age_status_num": int(age_status_num)
                    }
                }
            else:
                logger.warning("Logistic model not loaded, returning default prediction")
                return {
                    "rating": "Average",
                    "rating_num": 1,
                    "confidence_score": 0.5,
                    "probabilities": {"Worst": 0.33, "Average": 0.34, "Good": 0.33},
                    "all_probabilities": [0.33, 0.34, 0.33],
                    "model_type": "default",
                }

        except Exception as e:
            logger.error(f"❌ Error in logistic regression prediction: {str(e)}")
            import traceback
            logger.error(traceback.format_exc())
            return {
                "rating": "Average",
                "rating_num": 1,
                "confidence_score": 0.5,
                "probabilities": {"Worst": 0.33, "Average": 0.34, "Good": 0.33},
                "all_probabilities": [0.33, 0.34, 0.33],
                "model_type": "error",
            }

    def predict_llm(self, resume_text: str) -> Dict[str, Any]:
        """Predict using LLM model
        Args:
            resume_text: Full resume text from .pdf or .docx
        Returns:
            Prediction result with rating (Good/Average/Worst) and confidence
        """
        try:
            if self.llm_model:
                # Check if it's a sklearn Pipeline or model with predict method
                if hasattr(self.llm_model, 'predict'):
                    # For sklearn Pipeline models, pass as list of strings
                    # The pipeline will handle vectorization internally
                    try:
                        # Try to use the model's predict method
                        prediction = self.llm_model.predict([resume_text])[0]
                        # Get prediction probabilities if available
                        if hasattr(self.llm_model, 'predict_proba'):
                            try:
                                proba = self.llm_model.predict_proba([resume_text])[0]
                                confidence = float(np.max(proba))
                            except:
                                confidence = 0.7
                        else:
                            confidence = 0.7
                        
                        # Map prediction to rating
                        if isinstance(prediction, (int, np.integer)):
                            if prediction == 0:
                                rating = "Worst"
                            elif prediction == 1:
                                rating = "Average"
                            else:
                                rating = "Good"
                        else:
                            rating = str(prediction)
                            confidence = 0.7
                    except (NotFittedError, AttributeError, ValueError) as pred_error:
                        error_msg = str(pred_error)
                        logger.warning(f"Predict method failed: {error_msg}")
                        # If it's a fitting error due to version mismatch, provide helpful message
                        if "idf" in error_msg.lower() or "not fitted" in error_msg.lower():
                            logger.error("⚠️ Model version mismatch detected. The model was trained with sklearn 1.6.1 but you're using 1.4.0.")
                            logger.error("⚠️ Solution: Upgrade sklearn with: pip install --upgrade scikit-learn==1.6.1")
                            # Return a default prediction instead of failing
                            rating = "Average"
                            confidence = 0.5
                        else:
                            # Try treating as a pipeline that can be called directly
                            if callable(self.llm_model):
                                try:
                                    result = self.llm_model(resume_text)
                                    if isinstance(result, dict):
                                        rating = result.get("rating", "Average")
                                        confidence = result.get("confidence_score", 0.5)
                                    else:
                                        rating = str(result)
                                        confidence = 0.5
                                except:
                                    raise pred_error
                            else:
                                raise pred_error
                elif callable(self.llm_model):
                    # Try calling directly as a function
                    result = self.llm_model(resume_text)
                    if isinstance(result, dict):
                        rating = result.get("rating", "Average")
                        confidence = result.get("confidence_score", 0.5)
                    else:
                        rating = str(result)
                        confidence = 0.5
                else:
                    logger.warning("LLM model format not recognized")
                    rating = "Average"
                    confidence = 0.5

                return {
                    "rating": rating,
                    "confidence_score": confidence,
                    "model_type": "trained_llm",
                }
            else:
                logger.warning("LLM model not loaded, returning default prediction")
                return {
                    "rating": "Average",
                    "confidence_score": 0.5,
                    "model_type": "default",
                }

        except Exception as e:
            logger.error(f"❌ Error in LLM prediction: {str(e)}")
            import traceback
            logger.error(traceback.format_exc())
            return {
                "rating": "Average",
                "confidence_score": 0.5,
                "model_type": "error",
            }

    def predict_logistic_sentiment(self, sentiment_score: float) -> Dict[str, Any]:
        """Predict using Logistic Sentiment model
        Args:
            sentiment_score: Numeric sentiment score (-1 to +1)
        Returns:
            Prediction result with rating (Strong/Intermediate/Weak) and confidence %
        """
        try:
            if self.logistic_sentiment_model:
                # Normalize sentiment score to 0-1 range if needed
                normalized_score = (sentiment_score + 1) / 2  # Convert -1 to +1 range to 0-1
                features = np.array([[normalized_score]])
                
                prediction = self.logistic_sentiment_model.predict(features)[0]
                probability = self.logistic_sentiment_model.predict_proba(features)[0]
                
                confidence_score = float(np.max(probability))
                confidence_percent = confidence_score * 100
                
                # Map prediction to label
                if isinstance(prediction, (int, np.integer)):
                    if prediction == 0:
                        rating = "Weak"
                    elif prediction == 1:
                        rating = "Intermediate"
                    else:
                        rating = "Strong"
                else:
                    rating = str(prediction)

                return {
                    "rating": rating,
                    "confidence_percent": round(confidence_percent, 2),
                    "confidence_score": confidence_score,
                    "model_type": "trained_logistic_sentiment",
                }
            else:
                logger.warning("Logistic sentiment model not loaded, returning default prediction")
                return {
                    "rating": "Intermediate",
                    "confidence_percent": 50.0,
                    "confidence_score": 0.5,
                    "model_type": "default",
                }

        except Exception as e:
            logger.error(f"❌ Error in logistic sentiment prediction: {str(e)}")
            return {
                "rating": "Intermediate",
                "confidence_percent": 50.0,
                "confidence_score": 0.5,
                "model_type": "error",
            }


    def predict_llm_sentiment(self, resume_text: str) -> Dict[str, Any]:
        """Predict using LLM Sentiment model
        Args:
            resume_text: Full resume text from .pdf or .docx
        Returns:
            Prediction result with rating (Strong/Intermediate/Weak) and confidence %
        """
        try:
            if self.llm_sentiment_model:
                # Check if it's a sklearn Pipeline or model with predict method
                if hasattr(self.llm_sentiment_model, 'predict'):
                    # For sklearn Pipeline models, pass as list of strings
                    # The pipeline will handle vectorization internally
                    try:
                        # Try to use fit_transform workaround for version incompatibility
                        # If model has steps, try accessing them individually
                        if hasattr(self.llm_sentiment_model, 'steps') or hasattr(self.llm_sentiment_model, 'named_steps'):
                            # It's a Pipeline - try to refit if needed (this is a workaround for version issues)
                            try:
                                prediction = self.llm_sentiment_model.predict([resume_text])[0]
                            except (NotFittedError, AttributeError) as fit_error:
                                logger.warning(f"Model fitting issue (likely version mismatch): {str(fit_error)}")
                                # For sklearn version mismatch, we can't easily refit the model
                                # Return a default prediction with warning
                                raise fit_error
                        else:
                            prediction = self.llm_sentiment_model.predict([resume_text])[0]
                        
                        # Get prediction probabilities if available
                        if hasattr(self.llm_sentiment_model, 'predict_proba'):
                            try:
                                proba = self.llm_sentiment_model.predict_proba([resume_text])[0]
                                confidence = float(np.max(proba))
                            except:
                                confidence = 0.7
                        else:
                            confidence = 0.7
                        
                        # Map prediction to rating
                        if isinstance(prediction, (int, np.integer)):
                            if prediction == 0:
                                rating = "Weak"
                            elif prediction == 1:
                                rating = "Intermediate"
                            else:
                                rating = "Strong"
                        else:
                            rating = str(prediction)
                            confidence = 0.7
                    except (NotFittedError, AttributeError, ValueError) as pred_error:
                        error_msg = str(pred_error)
                        logger.warning(f"Predict method failed: {error_msg}")
                        # If it's a fitting error due to version mismatch, provide helpful message
                        if "idf" in error_msg.lower() or "not fitted" in error_msg.lower():
                            logger.error("⚠️ Model version mismatch detected. The model was trained with sklearn 1.6.1 but you're using 1.4.0.")
                            logger.error("⚠️ Solution: Upgrade sklearn with: pip install --upgrade scikit-learn==1.6.1")
                            # Return a default prediction instead of failing
                            rating = "Intermediate"
                            confidence = 0.5
                        else:
                            # Try treating as a pipeline that can be called directly
                            if callable(self.llm_sentiment_model):
                                try:
                                    result = self.llm_sentiment_model(resume_text)
                                    if isinstance(result, dict):
                                        rating = result.get("rating", "Intermediate")
                                        confidence = result.get("confidence_score", 0.5)
                                    else:
                                        rating = str(result)
                                        confidence = 0.5
                                except:
                                    raise pred_error
                            else:
                                raise pred_error
                elif callable(self.llm_sentiment_model):
                    # Try calling directly as a function
                    result = self.llm_sentiment_model(resume_text)
                    if isinstance(result, dict):
                        rating = result.get("rating", "Intermediate")
                        confidence = result.get("confidence_score", 0.5)
                    else:
                        rating = str(result)
                        confidence = 0.5
                else:
                    logger.warning("LLM sentiment model format not recognized")
                    rating = "Intermediate"
                    confidence = 0.5
                
                confidence_percent = confidence * 100

                return {
                    "rating": rating,
                    "confidence_percent": round(confidence_percent, 2),
                    "confidence_score": confidence,
                    "model_type": "trained_llm_sentiment",
                }
            else:
                logger.warning("LLM sentiment model not loaded, returning default prediction")
                return {
                    "rating": "Intermediate",
                    "confidence_percent": 50.0,
                    "confidence_score": 0.5,
                    "model_type": "default",
                }

        except Exception as e:
            logger.error(f"❌ Error in LLM sentiment prediction: {str(e)}")
            import traceback
            logger.error(traceback.format_exc())
            return {
                "rating": "Intermediate",
                "confidence_percent": 50.0,
                "confidence_score": 0.5,
                "model_type": "error",
            }

    def get_model_status(self) -> Dict[str, Any]:
        """Get status of loaded models"""
        return {
            "models_loaded": self.model_loaded,
            "logistic_model_available": self.logistic_model is not None,
            "llm_model_available": self.llm_model is not None,
            "logistic_sentiment_model_available": self.logistic_sentiment_model is not None,
            "llm_sentiment_model_available": self.llm_sentiment_model is not None,
            "models_directory": self.models_dir,
        }


# Global model manager instance
model_manager = ModelManager()
model_manager.load_models()
