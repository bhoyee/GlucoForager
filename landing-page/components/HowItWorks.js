export default function HowItWorks() {
  const steps = [
    {
      number: "1",
      title: "Snap Your Fridge",
      description: "Take a photo of what's in your fridge or pantry",
      icon: "📸"
    },
    {
      number: "2", 
      title: "AI Analysis",
      description: "Our AI identifies ingredients and checks diabetes safety",
      icon: "🤖"
    },
    {
      number: "3",
      title: "Get 3 Recipes",
      description: "Instantly receive 3 diabetic-friendly recipes to cook",
      icon: "🍳"
    }
  ];
  
  return (
    <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
      {steps.map((step) => (
        <div key={step.number} className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-teal-100 to-purple-100 text-2xl mb-4">
            {step.icon}
          </div>
          <div className="text-sm font-semibold text-teal-600 mb-2">STEP {step.number}</div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">{step.title}</h3>
          <p className="text-gray-600">{step.description}</p>
        </div>
      ))}
    </div>
  );
}