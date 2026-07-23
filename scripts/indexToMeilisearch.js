const db = require('../config/database');
const { MeiliSearch } = require('meilisearch');
const { tagVocabulary } = require('../utils/tagVocabulary');

const client = new MeiliSearch({ host: 'http://127.0.0.1:7700' });

async function indexCourses() {
  const [courses] = await db.query('SELECT id, title, desc_text, tags, category, language, platform, rating, duration FROM courses');
  const formatted = courses.map(c => ({
    id: c.id,
    title: c.title,
    description: c.desc_text,
    tags: c.tags ? JSON.parse(c.tags) : [],
    category: c.category,
    language: c.language,
    platform: c.platform,
    rating: c.rating,
    duration: c.duration
  }));
  const index = client.index('courses');
  await index.addDocuments(formatted);
  console.log(`Indexed ${formatted.length} courses.`);
}

async function indexJobs() {
  const [jobs] = await db.query('SELECT id, title, description, tags, category, job_type FROM jobs');
  const formatted = jobs.map(j => ({
    id: j.id,
    title: j.title,
    description: j.description,
    tags: j.tags ? JSON.parse(j.tags) : [],
    category: j.category,
    job_type: j.job_type
  }));
  const index = client.index('jobs');
  await index.addDocuments(formatted);
  console.log(`Indexed ${formatted.length} jobs.`);
}

async function setFilterableAttributes() {
  await client.index('courses').updateFilterableAttributes(['tags', 'category']);
  await client.index('jobs').updateFilterableAttributes(['tags', 'category']);
  console.log('Set filterable attributes for courses and jobs.');
}

async function setSynonyms() {
  // Build Meilisearch synonyms object
  // Each synonym and canonical tag are mapped to each other
  const synonyms = {};
  for (const [canonical, syns] of Object.entries(tagVocabulary)) {
    const all = Array.from(new Set([canonical, ...syns.map(s => s.toLowerCase().trim())]));
    all.forEach(word => {
      synonyms[word] = all;
    });
  }
  await client.index('courses').updateSynonyms(synonyms);
  await client.index('jobs').updateSynonyms(synonyms);
  console.log('Set synonyms for courses and jobs.');
}

async function main() {
  try {
    await indexCourses();
    await indexJobs();
    await setFilterableAttributes();
    await setSynonyms();
    console.log('✅ All data indexed to Meilisearch!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error indexing data:', err);
    process.exit(1);
  }
}

main(); 