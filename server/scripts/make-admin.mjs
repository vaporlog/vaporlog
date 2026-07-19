import { pool } from "../src/db.js";

const handle = process.argv[2] ?? "admincheck";
const role = process.argv[3] ?? "admin";

const { rowCount } = await pool.query(
  "update profiles set role = $1 where lower(handle) = lower($2)",
  [role, handle],
);

console.log(`updated ${rowCount} profile(s) for ${handle} to ${role}`);
process.exit(0);
