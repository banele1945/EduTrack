const db = require('../config/database');
const { synonymToCanonical } = require('../utils/tagVocabulary');

// All tags are lowercased and trimmed for standardization
function extractCanonicalTags(text) {
  if (!text) return [];
  const tags = new Set();
  const lower = text.toLowerCase();
  for (const syn in synonymToCanonical) {
    if (lower.includes(syn)) {
      tags.add(synonymToCanonical[syn]);
    }
  }
  return Array.from(tags);
}

function cleanAndMergeTags(...tagArrays) {
  const tagSet = new Set();
  tagArrays.flat().forEach(tag => {
    if (tag && tag.trim()) {
      tagSet.add(tag.trim().toLowerCase());
    }
  });
  return Array.from(tagSet);
}

async function tagJobs() {
  try {
    const [jobs] = await db.query('SELECT id, title, description, category FROM jobs');
    for (const job of jobs) {
      const tags = cleanAndMergeTags(
        extractCanonicalTags(job.title),
        extractCanonicalTags(job.description),
        extractCanonicalTags(job.category),
        [job.category]
      );
      await db.query('UPDATE jobs SET tags = ? WHERE id = ?', [JSON.stringify(tags), job.id]);
      console.log(`✅ Job ${job.id} tagged: ${tags}`);
    }
    console.log('🎉 All jobs tagged successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error tagging jobs:', err);
    process.exit(1);
  }
}

tagJobs();

// Map keywords to job categories
const CATEGORY_KEYWORD_MAP = {
  Engineering: ['engineer', 'engineering', 'mechanical', 'electrical', 'civil', 'software', 'robotics'],
  IT: ['developer', 'programmer', 'software', 'web', 'frontend', 'backend', 'full stack', 'it', 'python', 'java', 'javascript', 'node', 'react', 'php', 'sql', 'database', 'linux', 'devops'],
  Education: ['teacher', 'teaching', 'education', 'lecturer', 'tutor', 'school', 'instructor'],
  Business: ['business', 'analyst', 'consultant', 'entrepreneur', 'manager', 'management', 'executive', 'operations'],
  Finance: ['finance', 'accountant', 'accounting', 'bank', 'banking', 'auditor', 'economics', 'financial'],
  Healthcare: ['nurse', 'doctor', 'health', 'medical', 'clinic', 'hospital', 'pharmacy', 'pharmacist', 'dentist', 'therapist'],
  Media: ['media', 'journalist', 'journalism', 'content', 'writer', 'writing', 'editor', 'communications', 'public relations'],
  Law: ['law', 'legal', 'attorney', 'paralegal', 'advocate', 'solicitor'],
  Science: ['science', 'scientist', 'biology', 'chemistry', 'physics', 'researcher', 'research'],
  Agriculture: ['agriculture', 'farm', 'farming', 'agronomy', 'horticulture'],
  Logistics: ['logistics', 'supply chain', 'transport', 'warehouse', 'distribution'],
  Design: ['designer', 'design', 'graphic', 'ui', 'ux', 'creative'],
  Marketing: ['marketing', 'brand', 'advertising', 'promotion', 'sales'],
  Energy: ['energy', 'renewable', 'power', 'solar', 'wind'],
  Construction: ['construction', 'builder', 'building', 'site manager'],
  Hospitality: ['hotel', 'hospitality', 'restaurant', 'chef', 'catering'],
  Retail: ['retail', 'store', 'shop', 'cashier', 'sales assistant'],
  Transport: ['driver', 'transport', 'logistics', 'delivery'],
  Government: ['government', 'public sector', 'municipal', 'council'],
  NotSpecified: [] // fallback
};

function guessCategory(title, description) {
  const text = `${title} ${description}`.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORD_MAP)) {
    if (category === 'NotSpecified') continue;
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        return category;
      }
    }
  }
  return 'Not Specified';
}

async function assignCategories() {
  try {
    const [jobs] = await db.query('SELECT id, title, description FROM jobs');
    for (const job of jobs) {
      const category = guessCategory(job.title, job.description);
      await db.query('UPDATE jobs SET category = ? WHERE id = ?', [category, job.id]);
      console.log(`Job ${job.id} assigned category: ${category}`);
    }
    console.log('All jobs categorized successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Error categorizing jobs:', err);
    process.exit(1);
  }
}

assignCategories();