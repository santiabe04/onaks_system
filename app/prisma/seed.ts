import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, UserType } from "../src/generated/prisma/client";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const CITIES: Record<string, string[]> = {
  "Buenos Aires": [
    "Avellaneda",
    "Lanús",
    "Quilmes",
    "Lomas de Zamora",
    "Almirante Brown",
    "Berazategui",
    "Florencio Varela",
    "Esteban Echeverría",
  ],
  "Ciudad Autónoma de Buenos Aires": ["CABA"],
};

const MEASUREMENT_UNITS = [
  { name: "u", description: "Unidad" },
  { name: "kg", description: "Kilogramo" },
  { name: "l", description: "Litro" },
];

async function main() {
  for (const [stateName, cities] of Object.entries(CITIES)) {
    const state = await db.state.upsert({
      where: { name: stateName },
      update: {},
      create: { name: stateName },
    });
    for (const name of cities) {
      await db.city.upsert({
        where: { name_stateId: { name, stateId: state.id } },
        update: {},
        create: { name, stateId: state.id },
      });
    }
  }

  for (const unit of MEASUREMENT_UNITS) {
    await db.measurementUnit.upsert({
      where: { name: unit.name },
      update: {},
      create: unit,
    });
  }

  const mail = process.env.SEED_ADMIN_MAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!mail || !password) {
    throw new Error("Faltan SEED_ADMIN_MAIL o SEED_ADMIN_PASSWORD en el .env");
  }

  const existing = await db.person.findUnique({ where: { mail } });
  if (!existing) {
    await db.person.create({
      data: {
        name: "Admin",
        surname: "Admin",
        mail,
        phone: "-",
        user: {
          create: {
            userType: UserType.ADMIN,
            passwordHash: await bcrypt.hash(password, 12),
            passwordMustChange: true,
          },
        },
      },
    });
    console.log(`Admin creado: ${mail}`);
  } else {
    console.log(`Admin ya existente: ${mail}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
