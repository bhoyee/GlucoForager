export default function Features() {
  const features = [
    {
      icon: "🩺",
      title: "Diabetes-Safe Recipes",
      description: "Every recipe is AI-checked for low glycemic impact and diabetes guidelines"
    },
    {
      icon: "📊", 
      title: "Nutrition Tracking",
      description: "Monitor carbs, calories, and glycemic index for every meal"
    },
    {
      icon: "⚡",
      title: "AI-Powered Analysis",
      description: "GPT-5 analyzes your fridge and creates personalized recipes"
    },
    {
      icon: "💾",
      title: "Save Favorites",
      description: "Premium users can save and organize their safe recipes"
    }
  ];
  
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 max-w-6xl mx-auto">
      {features.map((feature, index) => (
        <div key={index} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <div className="text-3xl mb-4">{feature.icon}</div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">{feature.title}</h3>
          <p className="text-gray-600">{feature.description}</p>
        </div>
      ))}
    </div>
  );
}