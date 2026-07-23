// 📘 Shared Tag Vocabulary for EduTrack
// Canonical tags → related synonyms & variations
const tagVocabulary = {
    // Academic Fields
    programming: ["coding", "software development", "developer", "software", "it", "programming", "scripting", "dev"],
    engineering: ["engineer", "engineering", "mechanical engineering", "electrical engineering", "civil engineering", "computer engineering", "construction engineering"],
    science: ["physics", "chemistry", "biology", "natural science", "science"],
    data: ["analytics", "machine learning", "ai", "artificial intelligence", "big data", "data science", "data analysis", "deep learning"],
    business: ["management", "entrepreneurship", "startup", "finance", "economics", "business", "corporate", "admin"],
    education: ["teaching", "learning", "pedagogy", "lecturing", "education", "tutoring"],
    healthcare: ["medicine", "nursing", "health", "medical", "paramedic", "doctor", "nurse", "healthcare", "clinical"],
    law: ["legal", "law", "attorney", "justice", "court", "criminal law", "civil law"],
    design: ["ux", "ui", "graphic design", "web design", "product design", "user experience", "user interface", "design", "creativity"],
    networking: ["computer networks", "networking", "ccna", "networks", "switching", "routing"],
    cybersecurity: ["cybersecurity", "information security", "infosec", "hacking", "pentesting", "ethical hacking", "security"],
    engineering_math: ["calculus", "mathematics", "algebra", "differential equations", "engineering maths", "math"],
    cloud: ["cloud computing", "aws", "azure", "google cloud", "gcp", "devops", "infrastructure"],
  
    // Campus & Social
    university: ["cape peninsula university of technology", "cput", "campus", "university", "institution", "varsity"],
    residence: ["residence", "res", "hostel", "accommodation", "student housing"],
    sports: ["soccer", "football", "netball", "basketball", "pool", "athletics", "sports", "rugby", "volleyball", "gym"],
    student_life: ["events", "clubs", "societies", "student life", "hangouts", "fun", "orientation", "parties"],
  
    // Career & Work
    internships: ["internships", "attachments", "in-service training", "intern", "experiential learning"],
    jobs: ["jobs", "employment", "careers", "work", "recruitment", "job opportunity", "vacancy", "positions"],
    freelancing: ["freelance", "freelancing", "remote work", "gigs", "side hustle", "part-time", "contract work"],
  
    // Skills & Soft Skills
    leadership: ["leadership", "teamwork", "project management", "supervision", "manager"],
    communication: ["communication", "presentation", "negotiation", "public speaking"],
    creativity: ["creative", "innovation", "idea generation", "creative thinking"],
    critical_thinking: ["problem solving", "analysis", "logic", "critical thinking", "troubleshooting"],
  
    // Tech Tools & Languages
    web: ["html", "css", "javascript", "react", "vue", "angular", "web development", "frontend", "frontend dev"],
    backend: ["node.js", "express", "php", "mysql", "java", "backend", "api", "server-side"],
    mobile: ["android", "ios", "flutter", "mobile development", "mobile apps", "react native"],
    databases: ["mysql", "sqlite", "mongodb", "database", "sql", "postgres"],
    version_control: ["git", "github", "version control", "gitlab", "bitbucket"],
};
  
const synonymToCanonical = {};
  for (const [canonical, synonyms] of Object.entries(tagVocabulary)) {
    synonyms.forEach((syn) => {
      synonymToCanonical[syn.toLowerCase().trim()] = canonical;
    });
  }
  
  module.exports = {
    tagVocabulary,
    synonymToCanonical,
  };  