export default function Pricing() {
  const plans = [
    {
      name: "Free",
      price: "£0",
      period: "forever",
      description: "Perfect for trying out AI-powered cooking",
      features: [
        "3 AI scans per day",
        "Basic recipe generation",
        "Diabetes safety checks",
        "Banner ads"
      ],
      cta: "Start Free",
      popular: false
    },
    {
      name: "Premium",
      price: "£2.99",
      period: "per month",
      description: "For serious diabetes meal planning",
      features: [
        "Unlimited AI scans",
        "GPT-5.2 recipe generation",
        "Save unlimited recipes",
        "No ads",
        "Detailed nutrition analysis",
        "Dietary filters",
        "Meal planning tools"
      ],
      cta: "Start 7-Day Free Trial",
      popular: true
    }
  ];
  
  return (
    <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
      {plans.map((plan) => (
        <div 
          key={plan.name} 
          className={`relative rounded-2xl border-2 p-8 ${
            plan.popular 
              ? 'border-teal-500 bg-gradient-to-b from-white to-teal-50' 
              : 'border-gray-200'
          }`}
        >
          {plan.popular && (
            <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
              <span className="inline-block bg-teal-600 text-white text-sm font-semibold px-4 py-1 rounded-full">
                Most Popular
              </span>
            </div>
          )}
          
          <div className="text-center mb-6">
            <h3 className="text-2xl font-bold text-gray-900 mb-2">{plan.name}</h3>
            <div className="flex items-baseline justify-center gap-1 mb-1">
              <span className="text-4xl font-bold text-gray-900">{plan.price}</span>
              <span className="text-gray-600">{plan.period}</span>
            </div>
            <p className="text-gray-600">{plan.description}</p>
          </div>
          
          <ul className="space-y-3 mb-8">
            {plan.features.map((feature, index) => (
              <li key={index} className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-teal-100 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-teal-600"></div>
                </div>
                <span className="text-gray-700">{feature}</span>
              </li>
            ))}
          </ul>
          
          <a 
            href="#" 
            className={`block text-center rounded-lg py-3 font-semibold transition-colors ${
              plan.popular
                ? 'bg-teal-600 text-white hover:bg-teal-700'
                : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
            }`}
          >
            {plan.cta}
          </a>
        </div>
      ))}
    </div>
  );
}