"use client";

import { useState } from 'react';
import Image from 'next/image';

export default function Testimonials() {
  const [activeIndex, setActiveIndex] = useState(0);

  const testimonials = [
    {
      name: "David M.",
      role: "Type 2 Diabetes, 3 years",
      content: "Saved me £60 on takeaway last month alone. The AI actually understands diabetic needs and suggests recipes that keep my blood sugar stable!",
      location: "London, UK",
      rating: 5,
      image: "/images/testimonials/David.jpeg"
    },
    {
      name: "Sarah K.",
      role: "Caregiver for husband",
      content: "As a caregiver, this app takes the stress out of meal planning. The diabetes safety checks are thorough and I finally feel confident about what I'm cooking.",
      location: "Manchester, UK",
      rating: 5,
      image: "/images/testimonials/Sarah.jpeg"
    },
    {
      name: "Dr. Lisa R.",
      role: "Clinical Nutritionist",
      content: "I recommend this to all my diabetes patients. The AI's understanding of glycemic impact is medically accurate. It's like having a nutritionist in your pocket!",
      location: "Birmingham, UK",
      rating: 5,
      image: "/images/testimonials/Lisa.jpeg"
    },
    {
      name: "James T.",
      role: "Type 1 Diabetes, 5 years",
      content: "The portion control suggestions are spot on. My A1C improved by 1.2 points since using GlucoForager daily. Game changer!",
      location: "Edinburgh, UK",
      rating: 5,
      image: "/images/testimonials/james.jpg" // Add this image later
    },
    {
      name: "Priya S.",
      role: "Pre-diabetes",
      content: "Prevented me from developing full diabetes. The app taught me how to eat right with foods I already had. 6 months later, I'm off medication!",
      location: "Leeds, UK",
      rating: 5,
      image: "/images/testimonials/priya.jpg" // Add this image later
    }
  ];

  // Star rating component
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

  // Check if image exists, fallback to initials
  const Avatar = ({ testimonial }) => {
    if (testimonial.image) {
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
    
    // Fallback to colored circle with initials
    return (
      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-teal-400 to-emerald-500 flex items-center justify-center text-white font-bold text-xl">
        {testimonial.name.charAt(0)}
      </div>
    );
  };

  return (
    <>
      {/* Desktop Grid View */}
      <div className="hidden md:grid grid-cols-3 gap-6 lg:gap-8 max-w-6xl mx-auto">
        {testimonials.slice(0, 3).map((testimonial, index) => (
          <div 
            key={index} 
            className="group relative"
          >
            {/* Glow effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-teal-500/5 to-purple-500/5 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            
            <div className="relative bg-white border border-gray-100 p-6 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 group-hover:-translate-y-1">
              {/* Quote icon */}
              <div className="absolute -top-3 -right-3 w-12 h-12 bg-gradient-to-br from-teal-500 to-emerald-500 rounded-full flex items-center justify-center text-white text-2xl">
                "
              </div>
              
              {/* Profile image */}
              <div className="flex items-center gap-4 mb-4">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-teal-400 to-emerald-500 p-0.5">
                    <div className="w-full h-full rounded-full bg-white flex items-center justify-center overflow-hidden">
                      <Avatar testimonial={testimonial} />
                    </div>
                  </div>
                  {/* Verified badge */}
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-teal-500 rounded-full border-2 border-white flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
                
                <div>
                  <div className="font-bold text-gray-900">{testimonial.name}</div>
                  <div className="text-sm text-teal-600 font-medium">{testimonial.role}</div>
                  <div className="text-xs text-gray-500">{testimonial.location}</div>
                  <StarRating rating={testimonial.rating} />
                </div>
              </div>
              
              {/* Testimonial content */}
              <p className="text-gray-700 leading-relaxed mb-4 italic">
                "{testimonial.content}"
              </p>
              
              {/* App Store badges mini */}
              {/* <div className="flex items-center gap-2 text-xs text-gray-500 mt-4">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 384 512">
                  <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/>
                </svg>
                <span>Downloaded from App Store</span>
              </div> */}
            </div>
          </div>
        ))}
      </div>

      {/* Mobile Carousel View */}
      <div className="md:hidden">
        <div className="relative overflow-hidden">
          <div 
            className="flex transition-transform duration-300 ease-in-out"
            style={{ transform: `translateX(-${activeIndex * 100}%)` }}
          >
            {testimonials.map((testimonial, index) => (
              <div key={index} className="w-full flex-shrink-0 px-4">
                <div className="bg-white border border-gray-100 p-6 rounded-2xl shadow-lg">
                  {/* Quote icon */}
                  <div className="absolute -top-3 -right-3 w-10 h-10 bg-gradient-to-br from-teal-500 to-emerald-500 rounded-full flex items-center justify-center text-white text-xl">
                    "
                  </div>
                  
                  {/* Profile */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="relative">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-teal-400 to-emerald-500 p-0.5">
                        <div className="w-full h-full rounded-full bg-white flex items-center justify-center overflow-hidden">
                          {testimonial.image ? (
                            <Image
                              src={testimonial.image}
                              alt={testimonial.name}
                              width={48}
                              height={48}
                              className="w-12 h-12 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-teal-100 to-emerald-100 flex items-center justify-center text-lg">
                              {testimonial.name.charAt(0)}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div>
                      <div className="font-bold text-gray-900">{testimonial.name}</div>
                      <div className="text-sm text-teal-600">{testimonial.role}</div>
                      <StarRating rating={testimonial.rating} />
                    </div>
                  </div>
                  
                  <p className="text-gray-700 leading-relaxed mb-4 italic">
                    "{testimonial.content}"
                  </p>
                  
                  <div className="text-xs text-gray-500">{testimonial.location}</div>
                </div>
              </div>
            ))}
          </div>
          
          {/* Navigation dots */}
          <div className="flex justify-center gap-2 mt-6">
            {testimonials.map((_, index) => (
              <button
                key={index}
                onClick={() => setActiveIndex(index)}
                className={`w-2 h-2 rounded-full transition-all ${
                  index === activeIndex 
                    ? 'bg-teal-600 w-6' 
                    : 'bg-gray-300 hover:bg-gray-400'
                }`}
                aria-label={`Go to testimonial ${index + 1}`}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}