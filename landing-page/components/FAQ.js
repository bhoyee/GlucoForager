"use client";

import { useState, useMemo } from 'react';

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState(null);
  const [activeCategory, setActiveCategory] = useState(null); // Start with null (no category selected)
  
  const faqs = [
    {
      question: "How does the AI ensure diabetic safety?",
      answer: "Our AI is specifically prompted to prioritize diabetes-friendly ingredients and recipes. It analyzes your available ingredients and suggests combinations that align with general diabetes management principles like carb awareness and balanced nutrition.",
      category: "Safety & Accuracy",
      note: "While our AI follows diabetes-aware guidelines, always consult your healthcare provider for personalized medical advice."
    },
    {
      question: "Does the AI save my food photos?",
      answer: "No. When you take a photo, it's sent securely to our AI service provider for processing. We don't store your photos on our servers. The AI analyzes the image to identify ingredients, then returns recipe suggestions based on what it sees.",
      category: "Privacy",
      note: "Your privacy is important - photos are processed through secure APIs and not saved in our system."
    },
    {
      question: "Can I trust AI-generated recipes?",
      answer: "Our AI generates recipes based on diabetes-aware principles, but we recommend using them as inspiration rather than strict medical guidance. Always consider your personal dietary needs and consult with a healthcare professional when making significant dietary changes.",
      category: "Safety & Accuracy",
      note: "AI suggestions should complement, not replace, professional medical advice."
    },
    {
      question: "What if I have other dietary restrictions?",
      answer: "You can mention additional dietary needs when requesting recipes. Our AI can consider multiple constraints like gluten-free, low-sodium, or vegetarian preferences alongside diabetes-friendly requirements.",
      category: "Features"
    },
    {
      question: "How many recipes can I get for free?",
      answer: "Free users get 3 AI scans per day, each generating diabetes-safe recipe suggestions. Premium users enjoy unlimited scans and additional features.",
      category: "Pricing"
    },
    {
      question: "What ingredients does the AI recognize?",
      answer: "Our AI can identify most common fruits, vegetables, proteins, dairy, and pantry staples. For best results, ensure your photos have good lighting and clear visibility of ingredients.",
      category: "Technology"
    },
    {
      question: "Is there a mobile app available?",
      answer: "GlucoForager is available as a mobile app for both iOS and Android. You can download it from the App Store or Google Play to easily snap photos of your fridge while cooking.",
      category: "Availability"
    },
    {
      question: "Can I save my favorite recipes?",
      answer: "Free users can view and cook from generated recipes. Premium users can save unlimited recipes to their personal collection and organize them for easy access.",
      category: "Features"
    },
    {
      question: "What if the AI doesn't recognize an ingredient?",
      answer: "You can manually add ingredients that the AI might have missed. Our system will still incorporate them into recipe suggestions. We're constantly working to improve recognition accuracy.",
      category: "Technology"
    },
    {
      question: "Is my personal health data safe?",
      answer: "We prioritize your privacy. We don't store personal health information. Your food preferences and saved recipes (if any) are kept secure, and we comply with privacy regulations.",
      category: "Privacy"
    },
    {
      question: "Can I cancel my Premium subscription anytime?",
      answer: "Yes, you can cancel your Premium subscription at any time through your app store settings. You'll retain Premium features until the end of your billing period.",
      category: "Pricing"
    },
    {
      question: "What AI models do you use?",
      answer: "We use advanced AI models from leading providers (OpenAI and DeepSeek) that are specifically optimized for food recognition and recipe generation with diabetes considerations in mind.",
      category: "Technology"
    },
    {
      question: "How accurate are the recipe suggestions?",
      answer: "Our AI provides creative, diabetes-aware recipe suggestions based on your ingredients. While we aim for high relevance, we encourage users to review and adapt recipes to their specific needs and preferences.",
      category: "Safety & Accuracy"
    },
    {
      question: "Do you offer nutritional information?",
      answer: "Our AI provides general guidance on diabetes-friendly meals. For detailed nutritional analysis, we recommend using dedicated nutrition tracking apps in conjunction with our recipe suggestions.",
      category: "Features"
    }
  ];

  // Get unique categories
  const categories = useMemo(() => {
    const uniqueCats = ['all', ...new Set(faqs.map(faq => faq.category))];
    return uniqueCats;
  }, [faqs]);

  // Filter FAQs based on active category
  const filteredFaqs = useMemo(() => {
    if (activeCategory === null) {
      return []; // No FAQs shown by default
    }
    if (activeCategory === 'all') {
      return faqs;
    }
    return faqs.filter(faq => faq.category === activeCategory);
  }, [faqs, activeCategory]);

  // Reset open FAQ when changing category
  const handleCategoryClick = (category) => {
    setActiveCategory(category);
    setOpenIndex(null);
  };

  // Check if any category is selected
  const isCategorySelected = activeCategory !== null;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Category Filter Tabs */}
      <div className="flex flex-wrap gap-2 mb-8 justify-center">
        <button
          onClick={() => handleCategoryClick('all')}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
            activeCategory === 'all'
              ? 'bg-teal-600 text-white shadow-md'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:text-gray-900'
          }`}
        >
          All Questions
          <span className="ml-1.5 text-xs bg-white/20 px-1.5 py-0.5 rounded">
            {faqs.length}
          </span>
        </button>
        
        {categories.slice(1).map((category, index) => (
          <button
            key={index}
            onClick={() => handleCategoryClick(category)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
              activeCategory === category
                ? 'bg-teal-600 text-white shadow-md'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:text-gray-900'
            }`}
          >
            {category}
            <span className="ml-1.5 text-xs bg-white/20 px-1.5 py-0.5 rounded">
              {faqs.filter(f => f.category === category).length}
            </span>
          </button>
        ))}
      </div>

      {/* Welcome Message (shown when no category selected) */}
      {!isCategorySelected && (
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-teal-100 mb-4">
            <svg className="w-8 h-8 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">Browse FAQ Categories</h3>
          <p className="text-gray-600 max-w-md mx-auto">
            Click on a category above to see frequently asked questions about GlucoForager and AI-powered diabetes meal planning.
          </p>
        </div>
      )}

      {/* FAQ Accordion (only shown when category selected) */}
      {isCategorySelected && (
        <div className="space-y-4 mb-8">
          {filteredFaqs.length > 0 ? (
            filteredFaqs.map((faq, index) => (
              <div 
                key={index} 
                className="group overflow-hidden transition-all duration-300 hover:shadow-lg"
              >
                <button
                  className="w-full px-6 py-5 text-left flex justify-between items-center bg-gradient-to-r from-white to-gray-50 hover:from-gray-50 hover:to-gray-100 border border-gray-200 rounded-xl transition-all duration-300 group-hover:border-teal-200"
                  onClick={() => setOpenIndex(openIndex === index ? null : index)}
                  aria-expanded={openIndex === index}
                >
                  <div className="flex items-start gap-4">
                    {/* Question number */}
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
                      openIndex === index 
                        ? 'bg-teal-100 text-teal-600' 
                        : 'bg-gray-100 text-gray-600 group-hover:bg-teal-50'
                    }`}>
                      {index + 1}
                    </div>
                    
                    <div className="text-left">
                      <span className="inline-block mb-1 px-2 py-1 bg-teal-50 text-teal-700 text-xs font-medium rounded">
                        {faq.category}
                      </span>
                      <h3 className="font-semibold text-gray-900 text-lg">{faq.question}</h3>
                    </div>
                  </div>
                  
                  {/* Animated icon */}
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
                    openIndex === index 
                      ? 'bg-teal-600 text-white rotate-180' 
                      : 'bg-gray-100 text-gray-500 group-hover:bg-teal-100 group-hover:text-teal-600'
                  }`}>
                    <svg 
                      className="w-5 h-5 transition-transform duration-300" 
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                        strokeWidth="2" 
                        d="M19 9l-7 7-7-7" 
                      />
                    </svg>
                  </div>
                </button>
                
                {/* Answer with animation */}
                <div 
                  className={`overflow-hidden transition-all duration-300 ${
                    openIndex === index ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                  }`}
                >
                  <div className="px-6 py-5 bg-white border-x border-b border-gray-200 rounded-b-xl">
                    <div className="pl-12">
                      <p className="text-gray-700 leading-relaxed">{faq.answer}</p>
                      
                      {/* Additional notes based on category */}
                      {faq.note && faq.category === "Safety & Accuracy" && (
                        <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
                          <p className="text-sm text-blue-700 flex items-start gap-2">
                            <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                            </svg>
                            <span>{faq.note}</span>
                          </p>
                        </div>
                      )}
                      
                      {faq.note && faq.category === "Privacy" && (
                        <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-100">
                          <p className="text-sm text-green-700 flex items-start gap-2">
                            <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            <span>{faq.note}</span>
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            // This shouldn't show since we have FAQs, but good to have as fallback
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No questions found</h3>
              <p className="text-gray-600">Try selecting a different category or check back later.</p>
            </div>
          )}
        </div>
      )}

      {/* Important Medical Disclaimer - Always visible */}
      <div className={`p-4 bg-amber-50 border border-amber-200 rounded-xl ${isCategorySelected ? 'mt-8' : 'mt-0'}`}>
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <div>
            <h4 className="font-medium text-amber-800 mb-1">Important Medical Disclaimer</h4>
            <p className="text-sm text-amber-700">
              GlucoForager provides AI-generated recipe suggestions for informational purposes only. 
              It is not a medical device and does not provide medical advice, diagnosis, or treatment. 
              Always consult with qualified healthcare professionals for personalized medical guidance.
            </p>
          </div>
        </div>
      </div>

      {/* Still have questions? (Only shown when category is selected) */}
      {isCategorySelected && (
        <div className="mt-8 p-6 bg-gradient-to-r from-teal-50 to-emerald-50 rounded-2xl border border-teal-100 text-center">
          <h3 className="text-xl font-bold text-gray-900 mb-2">Still have questions?</h3>
          <p className="text-gray-600 mb-4">
            We're here to help! Reach out to our support team for more information.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a 
              href="#contact" 
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium"
            >
              Contact Support
            </a>
            <a 
              href="#pricing" 
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-teal-600 border border-teal-200 rounded-lg hover:bg-teal-50 transition-colors font-medium"
            >
              View Pricing
            </a>
          </div>
        </div>
      )}
    </div>
  );
}