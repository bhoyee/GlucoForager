export default function Testimonials() {
  const testimonials = [
    {
      name: "David M.",
      role: "Type 2 Diabetes, 3 years",
      content: "Saved me £60 on takeaway last month alone. The AI actually understands diabetic needs!",
      avatar: "👨"
    },
    {
      name: "Sarah K.",
      role: "Managing for husband",
      content: "As a caregiver, this app takes the stress out of meal planning. The diabetes safety checks are thorough.",
      avatar: "👩"
    },
    {
      name: "Dr. Lisa R.",
      role: "Nutritionist",
      content: "I recommend this to my patients. The AI's understanding of glycemic impact is impressive.",
      avatar: "👩‍⚕️"
    }
  ];
  
  return (
    <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
      {testimonials.map((testimonial, index) => (
        <div key={index} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <div className="text-4xl mb-4">{testimonial.avatar}</div>
          <p className="text-gray-700 italic mb-4">"{testimonial.content}"</p>
          <div>
            <div className="font-semibold text-gray-900">{testimonial.name}</div>
            <div className="text-sm text-teal-600">{testimonial.role}</div>
          </div>
        </div>
      ))}
    </div>
  );
}