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

// Alícuotas de IVA vigentes. `rate` es fracción, como string para no perder
// precisión en el Decimal.
const TAX_RATES = [
  { name: "IVA 21%", rate: "0.21" },
  { name: "IVA 10,5%", rate: "0.105" },
  { name: "IVA 27%", rate: "0.27" },
  { name: "Exento (0%)", rate: "0" },
];

const MEASUREMENT_UNITS = [
  { name: "u", description: "Unidad", allowsDecimals: false },
  { name: "kg", description: "Kilogramo", allowsDecimals: true },
  { name: "l", description: "Litro", allowsDecimals: true },
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

  // Solo se crean si no existen: una tasa editada desde el ABM no se pisa.
  for (const taxRate of TAX_RATES) {
    await db.taxRate.upsert({
      where: { name: taxRate.name },
      update: {},
      create: taxRate,
    });
  }

  const mail = process.env.SEED_ADMIN_MAIL?.trim().toLowerCase();
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
