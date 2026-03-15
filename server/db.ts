import Database, { type Database as DatabaseType } from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, "../data/deck.db");

const db: DatabaseType = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

export default db;
