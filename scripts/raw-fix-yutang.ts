import pg from 'pg'
const url = process.env.DATABASE_URL!.replace(':5432/', ':6543/')
const pool = new pg.Pool({ connectionString: url, max: 1 })
async function main() {
  const r = await pool.query(`UPDATE "Tutor" SET email = 'yutang.lin2005@gmail.com' WHERE name = 'Yu-Tang Lin'`)
  console.log(`Updated ${r.rowCount} row(s)`)
  await pool.end()
}
main().catch(e => { console.error(e); process.exit(1) })
