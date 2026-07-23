const fs = require('fs');
const path = require('path');
const db = require('../config/database');

async function runMigrations() {
    try {
        // Create migrations table if it doesn't exist
        await db.execute(`
            CREATE TABLE IF NOT EXISTS migrations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL UNIQUE,
                executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Get all migration files
        const migrationFiles = fs.readdirSync(__dirname)
            .filter(file => file.endsWith('.sql'))
            .sort();

        // Get executed migrations
        const [executedMigrations] = await db.query('SELECT name FROM migrations');
        const executedMigrationNames = executedMigrations.map(m => m.name);

        // Run pending migrations
        for (const file of migrationFiles) {
            if (!executedMigrationNames.includes(file)) {
                console.log(`Running migration: ${file}`);
                
                const sql = fs.readFileSync(path.join(__dirname, file), 'utf8');
                
                // Split SQL file into individual statements
                const statements = sql
                    .split(';')
                    .map(statement => statement.trim())
                    .filter(statement => statement.length > 0);

                // Execute each statement separately
                for (const statement of statements) {
                    await db.query(statement);
                }
                
                await db.query('INSERT INTO migrations (name) VALUES (?)', [file]);
                console.log(`Completed migration: ${file}`);
            }
        }

        console.log('All migrations completed successfully');
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

// Run migrations
runMigrations(); 