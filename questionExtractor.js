/**
 * Question Extractor Module
 * Extracts and logs question text and answers after displayQuestionText is completed
 */

var questionExtractorModule = (function () {
  'use strict';

  // Google Gemini API Configuration
  var GEMINI_API_KEY = 'AIzaSyD8wZKIr7rWzdCG3fmJ7zwkgX89Zb4KhKM'; // Replace with your actual API key
  var GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

  // Store original displayQuestionText function
  var originalDisplayQuestionText = null;
  var isHooked = false;
  var lastQuestionText = ''; // Track last question to avoid duplicate processing
  var isInReviewStage = false; // Track if we're in review/result stage

  /**
   * Check if we should extract data (avoid duplicate processing and review stage)
   */
  function shouldExtractData() {
    var currentQuestionText = extractQuestionText();

    // Don't extract if:
    // 1. No question text
    // 2. Same question as before (duplicate)
    // 3. Currently in review stage
    if (!currentQuestionText ||
      currentQuestionText === lastQuestionText ||
      isInReviewStage) {
      return false;
    }

    // Check if we're in review stage by looking for correct answer indicators
    var answersContainer = document.getElementById('questionDetails__Answers');
    if (answersContainer) {
      var correctAnswerElements = answersContainer.querySelectorAll('.answerButton--correct, .answerButton--incorrect, [class*="correct"], [class*="wrong"]');
      if (correctAnswerElements.length > 0) {
        console.log('🔍 Detected review stage - skipping extraction');
        isInReviewStage = true;
        return false;
      }
    }

    return true;
  }
  /**
   * Extract question text from DOM
   */
  function extractQuestionText() {
    var questionElement = document.querySelector('[wa-id="questionDetails__Text"]');
    if (questionElement) {
      return questionElement.textContent || questionElement.innerText || '';
    }
    return '';
  }

  /**
   * Extract answers list from DOM
   */
  function extractAnswers() {
    var answersContainer = document.getElementById('questionDetails__Answers');
    var answers = [];

    if (answersContainer) {
      // Find all answer buttons
      var answerButtons = answersContainer.querySelectorAll('.answerButton');

      answerButtons.forEach(function (button, index) {
        var letterSpan = button.querySelector('.answerButton__Letter');
        var textSpan = button.querySelector('.answerButton__TextSpan');
        var inputElement = button.querySelector('.answerButton__Input');

        if (letterSpan && textSpan) {
          answers.push({
            letter: letterSpan.textContent || letterSpan.innerText || '',
            text: textSpan.textContent || textSpan.innerText || '',
            id: inputElement ? inputElement.getAttribute('data-answer-id') : null,
            index: index
          });
        }
      });
    }

    return answers;
  }

  /**
   * Combine question and answers into a single formatted string
   */
  function combineQuestionData() {
    var questionText = extractQuestionText();
    var answers = extractAnswers();

    var combinedText = "Question: " + questionText + "\n\nAnswer options:\n";

    answers.forEach(function (answer) {
      combinedText += answer.letter + ". " + answer.text + "\n";
    });

    return {
      combinedText: combinedText,
      question: questionText,
      answers: answers
    };
  }

  /**
   * Call Google Gemini API to get answer
   */
  function callGeminiAPI(questionData) {
    var prompt = questionData.combinedText + "\n\nPlease analyze this multiple choice question and provide ONLY the correct answer in this exact format: [Letter]. [Answer text]\n\nExample: A. Eco-friendly construction\n\nDo not include any explanation or additional text.";

    var requestBody = {
      contents: [{
        parts: [{
          text: prompt
        }]
      }],
      tools: [
        {
          "google_search": {}
        }
      ]
    };

    console.log('🤖 Calling Google Gemini API...');
    console.log('📤 Prompt sent to Gemini:', prompt);

    return fetch(GEMINI_API_URL + '?key=' + GEMINI_API_KEY, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error('Gemini API request failed: ' + response.status + ' ' + response.statusText);
        }
        return response.json();
      })
      .then(function (data) {
        console.log('✅ Gemini API Response received');

        if (data.candidates && data.candidates.length > 0 && data.candidates[0].content && data.candidates[0].content.parts) {
          var geminiAnswer = data.candidates[0].content.parts[0].text;
          console.log('🎯 Gemini Answer:', geminiAnswer);
          return geminiAnswer;
        } else {
          throw new Error('Invalid response format from Gemini API');
        }
      })
      .catch(function (error) {
        console.error('❌ Error calling Gemini API:', error);
        console.log('💡 Please check your API key and internet connection');
        return 'Error: Unable to get answer from Gemini - ' + error.message;
      });
  }

  /**
   * Log extracted data to console and call Gemini API
   */
  function logQuestionData() {
    // Check if we should extract data first
    if (!shouldExtractData()) {
      return null;
    }

    console.log('=== NEW QUESTION DETECTED ===');

    var questionData = combineQuestionData();
    console.log('📝 Combined Question Data:');
    console.log(questionData.combinedText);
    console.log('================================');

    // Update tracking variables
    lastQuestionText = questionData.question;
    isInReviewStage = false;

    // Call Gemini API to get answer
    callGeminiAPI(questionData)
      .then(function (geminiResponse) {
        console.log('=== GEMINI AI ANALYSIS ===');
        console.log('🤖 Gemini Response:', geminiResponse);
        console.log('==========================');
      });

    return {
      question: questionData.question,
      answers: questionData.answers,
      combinedText: questionData.combinedText,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Hook into the displayQuestionText function
   */
  function hookDisplayQuestionText() {
    if (isHooked) {
      console.warn('Question extractor is already hooked');
      return;
    }

    // Wait for questionAnswerModule to be available
    var checkInterval = setInterval(function () {
      if (typeof questionAnswerModule !== 'undefined' &&
        questionAnswerModule.displayQuestionText &&
        typeof questionAnswerModule.displayQuestionText === 'function') {

        clearInterval(checkInterval);

        // Store original function
        originalDisplayQuestionText = questionAnswerModule.displayQuestionText;

        // Override with our hooked version
        questionAnswerModule.displayQuestionText = function (questionText) {
          // Call original function first
          var result = originalDisplayQuestionText.call(this, questionText);

          // Wait a bit for DOM to update, then extract data
          setTimeout(function () {
            try {
              // Reset review stage flag when new question text is displayed
              if (questionText && questionText.trim()) {
                isInReviewStage = false;
              }

              var extractResult = logQuestionData();
              if (!extractResult) {
                console.log('⏭️ Skipped extraction (duplicate or review stage)');
              }
            } catch (error) {
              console.error('Error extracting question data:', error);
            }
          }, 150); // Slightly longer delay to ensure DOM is fully updated

          return result;
        };

        isHooked = true;
        console.log('✅ Question extractor successfully hooked to displayQuestionText');
      }
    }, 100);

    // Safety timeout - stop checking after 10 seconds
    setTimeout(function () {
      clearInterval(checkInterval);
      if (!isHooked) {
        console.warn('⚠️ Could not hook into displayQuestionText - questionAnswerModule not found');
      }
    }, 10000);
  }

  /**
   * Unhook from displayQuestionText function
   */
  function unhookDisplayQuestionText() {
    if (!isHooked || !originalDisplayQuestionText) {
      console.warn('Question extractor is not hooked');
      return;
    }

    if (typeof questionAnswerModule !== 'undefined' && questionAnswerModule.displayQuestionText) {
      questionAnswerModule.displayQuestionText = originalDisplayQuestionText;
      originalDisplayQuestionText = null;
      isHooked = false;
      console.log('✅ Question extractor successfully unhooked from displayQuestionText');
    }
  }

  /**
   * Manual extraction (can be called anytime)
   */
  function extractNow() {
    console.log('📊 Manual question data extraction...');
    // Force extraction regardless of stage
    isInReviewStage = false;
    lastQuestionText = '';
    return logQuestionData();
  }

  /**
   * Reset extraction state (useful for debugging)
   */
  function resetExtractionState() {
    lastQuestionText = '';
    isInReviewStage = false;
    console.log('🔄 Extraction state reset');
  }

  /**
   * Test Gemini API with manual input
   */
  function testGeminiAPI(testQuestion) {
    if (!testQuestion) {
      testQuestion = "Which of the following is the capital of France?\nA. London\nB. Berlin\nC. Paris\nD. Madrid";
    }

    var testData = {
      combinedText: testQuestion
    };

    console.log('🧪 Testing Gemini API with sample question...');
    return callGeminiAPI(testData);
  }

  // Auto-initialize when script loads
  function initialize() {
    console.log('🚀 Question Extractor Module initialized');

    // Try to hook immediately if modules are already loaded
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', hookDisplayQuestionText);
    } else {
      hookDisplayQuestionText();
    }
  }

  // Public API
  return {
    init: initialize,
    hook: hookDisplayQuestionText,
    unhook: unhookDisplayQuestionText,
    extractNow: extractNow,
    resetExtractionState: resetExtractionState,
    extractQuestionText: extractQuestionText,
    extractAnswers: extractAnswers,
    combineQuestionData: combineQuestionData,
    callGeminiAPI: callGeminiAPI,
    testGeminiAPI: testGeminiAPI,
    shouldExtractData: shouldExtractData,
    isHooked: function () { return isHooked; },
    getState: function () {
      return {
        lastQuestionText: lastQuestionText,
        isInReviewStage: isInReviewStage
      };
    }
  };
})();

// Auto-initialize when script loads
questionExtractorModule.init();

// Expose to global scope for debugging
window.questionExtractor = questionExtractorModule;
