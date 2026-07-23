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

async function tagCourses() {
  try {
    const [courses] = await db.query('SELECT id, title, desc_text, category FROM courses');
    for (const course of courses) {
      const tags = cleanAndMergeTags(
        extractCanonicalTags(course.title),
        extractCanonicalTags(course.desc_text),
        extractCanonicalTags(course.category),
        [course.category] // Raw category as fallback
      );
      await db.query('UPDATE courses SET tags = ? WHERE id = ?', [JSON.stringify(tags), course.id]);
      console.log(`✅ Course ${course.id} tagged: ${tags}`);
      if (!tags) {
        console.warn(`⚠️ No tags found for course ${course.id}: ${course.title}`);
      }
    }
    console.log('🎉 All courses tagged successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error tagging courses:', err);
    process.exit(1);
  }
}

tagCourses();