import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') })

import { PrismaClient } from '../lib/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const updates = [
  {
    name: 'KT', lastName: 'Chang',
    email: 'kaitang0512@gmail.com', phone: '0477399493',
    school: 'Cherrybrook Technology High School',
    parentFirstName: 'Jessica', parentLastName: 'Peng',
    parentEmail: 'pengjessica68@gmail.com', parentPhone: '0451968929',
  },
  {
    name: 'Leeton', lastName: 'Luu',
    email: 'leeton.luu09@gmail.com', phone: '0456556711',
    school: 'Castle Hill High School',
    parentFirstName: 'Danny', parentLastName: 'Luu',
    parentEmail: 'danny@pagodafinance.com.au', parentPhone: '0414717398',
  },
  {
    name: 'Elma', lastName: null,
    email: null, phone: null, school: null,
    parentFirstName: 'Helen', parentLastName: 'Tian',
    parentEmail: 'helensydney@gmail.com', parentPhone: '0401096431',
  },
  {
    name: 'Sophia', lastName: 'Kwok',
    email: null, phone: null, school: null,
    parentFirstName: 'Peggy', parentLastName: null,
    parentEmail: 'vpeikee@yahoo.com.sg', parentPhone: '0416932812',
  },
  {
    name: 'Jayden', lastName: 'Park',
    email: 'jaydenminhopark@gmail.com', phone: '0490141015',
    school: 'Castle Hill High',
    parentFirstName: 'Joori', parentLastName: 'Park',
    parentEmail: 'jooree76@hotmail.com', parentPhone: '0422861364',
  },
  {
    name: 'Benjamin', lastName: 'Chang',
    email: null, phone: null,
    school: 'Cherrybrook Technology High School',
    parentFirstName: 'Jessica', parentLastName: 'Peng',
    parentEmail: 'pengjessica68@gmail.com', parentPhone: '0451968929',
  },
  {
    name: 'KC', lastName: 'Chang',
    email: null, phone: null,
    school: 'Cherrybrook Technology High School',
    parentFirstName: 'Jessica', parentLastName: 'Peng',
    parentEmail: 'pengjessica68@gmail.com', parentPhone: '0451968929',
  },
  {
    name: 'Pranav', lastName: 'Karthikeyan',
    email: 'Pranavkarthikeyan05@gmail.com', phone: '0422536474',
    school: 'Castle Hill High',
    parentFirstName: 'Karthikeyan', parentLastName: 'Nallusamy',
    parentEmail: 'Knallusamy81@gmail.com', parentPhone: '0422537249',
  },
  {
    name: 'Raamis', lastName: 'Khan',
    email: 'raamis.k.08@gmail.com', phone: '0466434530',
    school: 'Oakhill College',
    parentFirstName: 'Saima', parentLastName: 'Syed',
    parentEmail: 'Saima.k.syed@gmail.com', parentPhone: '0404684471',
  },
  {
    name: 'Oscar', lastName: 'Zhao',
    email: 'owoscarrr@gmail.com', phone: '0480267538',
    school: 'Oakhill College',
    parentFirstName: 'Sherry', parentLastName: 'Xiao',
    parentEmail: 'sherryxiao1977@gmail.com', parentPhone: '0480545125',
  },
  {
    name: 'Ray', lastName: 'Hsiao',
    email: 'rayhsiaovibin123@gmail.com', phone: '0411478678',
    school: 'Castle Hill High',
    parentFirstName: 'Allen', parentLastName: 'Hsiao',
    parentEmail: 'fleerking2@me.com', parentPhone: '0401858169',
  },
  {
    name: 'Sam', lastName: 'Lin',
    email: 'Samuellin2745@gmail.com', phone: '0408065588',
    school: 'Cherrybrook Technology High School',
    parentFirstName: 'Vicky', parentLastName: 'Huang',
    parentEmail: 'Satomi99@gmail.com', parentPhone: '0402432455',
  },
  {
    name: 'Roger', lastName: 'Gock',
    email: 'roger.gock@sydstu.catholic.edu.au', phone: '0432859538',
    school: 'Marist College Eastwood',
    parentFirstName: 'David', parentLastName: 'Gock',
    parentEmail: 'dundas68rita@hotmail.com', parentPhone: '0406989038',
  },
  {
    name: 'Vishwa', lastName: 'Jaiganesh',
    email: 'vishwa.jaiganesh@gmail.com', phone: '0431508916',
    school: 'Gosford High School',
    parentFirstName: 'Jaiganesh', parentLastName: 'Dhandapani',
    parentEmail: 'jaiganeshd@gmail.com', parentPhone: '0423099615',
  },
  {
    name: 'Brandon', lastName: 'Aquino',
    email: 'Brandonleeaquino@gmail.com', phone: '0401770591',
    school: 'Castle Hill High School',
    parentFirstName: 'Sheryll', parentLastName: 'Aquino',
    parentEmail: 'Sheryllqlee@yahoo.com', parentPhone: '0437888066',
  },
  {
    name: 'Noel', lastName: 'Youm',
    email: 'noel.youm@gmail.com', phone: '0493136190',
    school: 'Normanhurst Boys High School',
    parentFirstName: 'Tim', parentLastName: 'Youm',
    parentEmail: 'tim.youm@gmail.com', parentPhone: '0416176573',
  },
  {
    name: 'Yui', lastName: 'Wong',
    email: null, phone: null, school: null,
    parentFirstName: 'Anna', parentLastName: 'Yeung',
    parentEmail: null, parentPhone: null,
  },
]

async function main() {
  console.log('📝 Updating student records...\n')
  let updated = 0

  for (const u of updates) {
    const student = await prisma.student.findFirst({ where: { name: u.name } })
    if (!student) { console.log(`  ⚠️  Not found: ${u.name}`); continue }
    await prisma.student.update({
      where: { id: student.id },
      data: {
        lastName:        u.lastName,
        email:           u.email,
        phone:           u.phone,
        school:          u.school,
        parentFirstName: u.parentFirstName,
        parentLastName:  u.parentLastName,
        parentEmail:     u.parentEmail,
        parentPhone:     u.parentPhone,
      },
    })
    console.log(`  ✓  ${u.name} ${u.lastName ?? ''}`.trimEnd())
    updated++
  }

  console.log(`\n✅  Done. Updated: ${updated}`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
