import 'dotenv/config'
import pg from 'pg'

async function main() {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()
  await client.query(`SELECT setval('"Invoice_id_seq"', 1149, true)`)
  const res = await client.query(`SELECT currval('"Invoice_id_seq"') as val`)
  console.log('✓ Invoice sequence set — next invoice will be:', Number(res.rows[0].val) + 1)
  await client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
