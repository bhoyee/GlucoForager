export default function Contact() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 md:p-8 border border-white/20">
        <div className="grid md:grid-cols-2 gap-8">
          {/* Left Column: Contact Info */}
          <div>
            <h3 className="text-xl font-bold text-white mb-6">Get in Touch</h3>
            
            <div className="space-y-5">
              {/* Email */}
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-teal-500/20 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-teal-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-medium text-white mb-1">Email</h4>
                  <p className="text-gray-300 text-sm">support@glucoforager.com</p>
                  <p className="text-gray-400 text-xs mt-1">Typically responds within 24 hours</p>
                </div>
              </div>
              
              {/* App Status */}
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-medium text-white mb-1">App Status</h4>
                  <p className="text-gray-300 text-sm">Available Now</p>
                  <p className="text-gray-400 text-xs mt-1">Download from App Store & Google Play</p>
                </div>
              </div>
              
              {/* Support Hours */}
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-medium text-white mb-1">Support Hours</h4>
                  <p className="text-gray-300 text-sm">Mon-Fri, 9AM-6PM GMT</p>
                  <p className="text-gray-400 text-xs mt-1">Weekend responses may be slower</p>
                </div>
              </div>
            </div>
            
            {/* Quick Links */}
            <div className="mt-8 pt-6 border-t border-white/20">
              <h4 className="font-medium text-white mb-3">Quick Links</h4>
              <div className="space-y-2">
                <a href="#faq" className="block text-gray-300 hover:text-white text-sm transition-colors">
                  ↳ FAQ & Help Center
                </a>
                <a href="#pricing" className="block text-gray-300 hover:text-white text-sm transition-colors">
                  ↳ Pricing & Plans
                </a>
                <a href="#features" className="block text-gray-300 hover:text-white text-sm transition-colors">
                  ↳ Features
                </a>
              </div>
            </div>
          </div>
          
          {/* Right Column: Contact Form */}
          <div>
            <h3 className="text-xl font-bold text-white mb-6">Send us a Message</h3>
            
            <form className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Name Field */}
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-2">
                    Full Name
                  </label>
                  <input
                    type="text"
                    id="name"
                    className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                    placeholder="John Doe"
                    required
                  />
                </div>
                
                {/* Email Field */}
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                    Email Address
                  </label>
                  <input
                    type="email"
                    id="email"
                    className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                    placeholder="john@example.com"
                    required
                  />
                </div>
              </div>
              
              {/* Subject Field */}
              <div>
                <label htmlFor="subject" className="block text-sm font-medium text-gray-300 mb-2">
                  Subject
                </label>
                <select
                  id="subject"
                  className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                  defaultValue=""
                >
                  <option value="" disabled className="bg-[#01404F]">Select a topic</option>
                  <option value="support" className="bg-[#01404F]">Technical Support</option>
                  <option value="feedback" className="bg-[#01404F]">Product Feedback</option>
                  <option value="partnership" className="bg-[#01404F]">Partnership Inquiry</option>
                  <option value="press" className="bg-[#01404F]">Press & Media</option>
                  <option value="other" className="bg-[#01404F]">Other</option>
                </select>
              </div>
              
              {/* Message Field (shorter) */}
              <div>
                <label htmlFor="message" className="block text-sm font-medium text-gray-300 mb-2">
                  Message
                </label>
                <textarea
                  id="message"
                  rows="3"
                  className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all resize-none"
                  placeholder="How can we help you?"
                  required
                ></textarea>
              </div>
              
              {/* Submit Button */}
              <button
                type="submit"
                className="w-full bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 transform hover:-translate-y-0.5 hover:shadow-lg"
              >
                Send Message
              </button>
              
              {/* Privacy Note */}
              <p className="text-xs text-gray-400 text-center mt-4">
                By submitting this form, you agree to our Privacy Policy. We'll never share your information.
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}