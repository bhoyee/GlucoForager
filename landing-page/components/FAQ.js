'use client';

import { useState } from 'react';

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState(null);
  
  const faqs = [
    {
      question: "How does the AI ensure diabetic safety?",
      answer: "Our AI is specially prompted with ADA (American Diabetes Association) guidelines and focuses on low-glycemic ingredients, carb control, and balanced nutrition."
    },
    {
      question: "Does the AI save my food photos?",
      answer: "No. Photos are processed immediately by OpenAI's API and not stored on our servers. We only store the detected ingredients."
    },
    {
      question: "Can I trust AI-generated recipes?",
      answer: "All recipes are generated with strict diabetic constraints and follow medical nutrition guidelines. We recommend consulting your doctor for personalized advice."
    },
    {
      question: "What if I have other dietary restrictions?",
      answer: "Premium users can apply additional filters like gluten-free, low-sodium, or dairy-free alongside diabetes-friendly requirements."
    }
  ];
  
  return (
    <div className="space-y-4">
      {faqs.map((faq, index) => (
        <div key={index} className="border border-gray-200 rounded-lg overflow-hidden">
          <button
            className="w-full px-6 py-4 text-left flex justify-between items-center bg-gray-50 hover:bg-gray-100"
            onClick={() => setOpenIndex(openIndex === index ? null : index)}
          >
            <span className="font-semibold text-gray-900">{faq.question}</span>
            <span className="text-gray-500">
              {openIndex === index ? '−' : '+'}
            </span>
          </button>
          {openIndex === index && (
            <div className="px-6 py-4 bg-white">
              <p className="text-gray-700">{faq.answer}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}