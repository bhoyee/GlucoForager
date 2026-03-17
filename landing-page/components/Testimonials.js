"use client";

import { useState } from 'react';
import Image from 'next/image';

export default function Testimonials() {
  const [activeIndex, setActiveIndex] = useState(0);

  const testimonials = [
    {
      name: "David M.",
      role: "Type 2 diabetes",
      content:
        "Saved me money on takeaway last month. The meal ideas and portion tips make it easier to plan what to eat at home.",
      location: "London, UK",
      rating: 5,
      image: "/images/testimonials/David.jpeg",
    },
    {
      name: "Sarah K.",
      role: "Caregiver",
      content:
        "This takes the stress out of meal planning. Clear steps and simple suggestions make it easier to cook day-to-day.",
      location: "Manchester, UK",
      rating: 5,
      image: "/images/testimonials/Sarah.jpeg",
    },
    {
      name: "Lisa R.",
      role: "Nutrition professional",
      content:
        "A helpful tool for meal inspiration. The nutrition context and practical swaps support better everyday decisions.",
      location: "Birmingham, UK",
      rating: 5,
      image: "/images/testimonials/Lisa.jpeg",
    },
    {
      name: "James T.",
      role: "Type 1 diabetes",
      content:
        "The swaps and portion tips are genuinely useful. It helps me build meals without overthinking it.",
      location: "Edinburgh, UK",
      rating: 5,
      image: "", // No image yet; fall back to initials
    },
    {
      name: "Priya S.",
      role: "Prediabetes",
      content:
        "It helped me get consistent with meals at home. The daily tips and simple challenges keep me on track.",
      location: "Leeds, UK",
      rating: 5,
      image: "", // No image yet; fall back to initials
    },
  ];

  const StarRating = ({ rating }) => (
    <div className="flex gap-1">
      {[...Array(5)].map((_, i) => (
        <svg
          key={i}
          className={`w-4 h-4 ${i < rating ? 'text-amber-400 fill-current' : 'text-gray-300'}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );

  const Avatar = ({ testimonial }) => {
    if (typeof testimonial.image === "string" && testimonial.image.trim()) {
      return (
        <Image
          src={testimonial.image}
          alt={testimonial.name}
          width={64}
          height={64}
          className="w-16 h-16 rounded-full object-cover border-2 border-white shadow-sm"
        />
      );
    }
    return (
      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-teal-400 to-emerald-500 flex items-center justify-center text-white font-bold text-xl">
        {testimonial.name.charAt(0)}
      </div>
    );
  };

  return (
    <>
      <div className="hidden md:grid grid-cols-3 gap-6 lg:gap-8 max-w-6xl mx-auto">
        {testimonials.slice(0, 3).map((testimonial, index) => (
          <div key={index} className="group relative">
            <div className="absolute inset-0 bg-gradient-to-br from-teal-500/5 to-purple-500/5 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

            <div className="relative bg-white border border-gray-100 p-6 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 group-hover:-translate-y-1">
              <div className="absolute -top-3 -right-3 w-12 h-12 bg-gradient-to-br from-teal-500 to-emerald-500 rounded-full flex items-center justify-center text-white text-2xl">
                "
              </div>

              <div className="flex items-center gap-4 mb-4">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-teal-400 to-emerald-500 p-0.5">
                    <div className="w-full h-full rounded-full bg-white flex items-center justify-center overflow-hidden">
                      <Avatar testimonial={testimonial} />
                    </div>
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-teal-500 rounded-full border-2 border-white flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                </div>

                <div>
                  <h4 className="font-bold text-gray-900">{testimonial.name}</h4>
                  <p className="text-sm text-gray-500">{testimonial.role}</p>
                  <div className="mt-1">
                    <StarRating rating={testimonial.rating} />
                  </div>
                </div>
              </div>

              <p className="text-gray-700 leading-relaxed">{testimonial.content}</p>

              <div className="mt-4 text-sm text-gray-500">{testimonial.location}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="md:hidden max-w-lg mx-auto">
        <div className="bg-white rounded-2xl shadow-lg p-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-teal-500 to-emerald-500" />

          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-teal-400 to-emerald-500 p-0.5">
              <div className="w-full h-full rounded-full bg-white flex items-center justify-center overflow-hidden">
                <Avatar testimonial={testimonials[activeIndex]} />
              </div>
            </div>
            <div>
              <h4 className="font-bold text-gray-900">{testimonials[activeIndex].name}</h4>
              <p className="text-sm text-gray-500">{testimonials[activeIndex].role}</p>
              <div className="mt-1">
                <StarRating rating={testimonials[activeIndex].rating} />
              </div>
            </div>
          </div>

          <p className="text-gray-700 leading-relaxed mb-4">{testimonials[activeIndex].content}</p>
          <div className="text-sm text-gray-500">{testimonials[activeIndex].location}</div>

          <div className="flex justify-center gap-2 mt-6">
            {testimonials.map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => setActiveIndex(index)}
                className={`w-2.5 h-2.5 rounded-full transition-all ${
                  index === activeIndex ? "bg-teal-500 w-6" : "bg-gray-300 hover:bg-gray-400"
                }`}
                aria-label={`View testimonial ${index + 1}`}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

