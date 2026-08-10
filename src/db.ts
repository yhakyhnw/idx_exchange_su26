import "dotenv/config";
import mysql from "mysql2/promise";

const QUERY_TIMEOUT_MS = 15000;

const pool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 10000,
});
export async function query<T>(sql: string, params: any[] = []): Promise<T[]> {
const [rows] = await pool.execute({ sql, timeout: QUERY_TIMEOUT_MS }, params);
return rows as T[];
}

export async function closePool(): Promise<void> {
await pool.end();
}
