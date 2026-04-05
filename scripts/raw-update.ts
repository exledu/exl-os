import pg from 'pg'
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
async function main() {
  const r = await pool.query(`UPDATE "Tutor" SET email = 'yutang.lin2005@gmail.com' WHERE name = 'Yu-Tang Lin'`)
  console.log(`Updated ${r.rowCount} row(s)`)
  await pool.end()
}
main().catch(e => { console.error(e); process.exit(1) })
