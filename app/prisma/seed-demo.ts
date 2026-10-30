import bcrypt from "bcryptjs";
import type { PrismaClient } from "../src/generated/prisma/client";
import { TaxCondition, UserType } from "../src/generated/prisma/enums";
import { cartTotals } from "../src/lib/cart";
import { isValidCuit } from "../src/lib/cuit";

// Datos de demo de una distribuidora de alimentos y accesorios para mascotas
// (zona sur): catálogo con stock, proveedores, clientes con usuarios, un
// repartidor y pedidos pendientes. Para probar la app y para los tests de
// punta a punta. Se activa con SEED_DEMO=true y solo en una base sin
// productos: nunca se mezcla con datos reales.

/** Contraseña de todos los usuarios de demo (sin cambio obligatorio). */
export const DEMO_PASSWORD = "demo1234";
/** Dominio de los mails de demo. */
export const DEMO_DOMAIN = "demo.onaks.local";

const mail = (user: string) => `${user}@${DEMO_DOMAIN}`;

type Db = PrismaClient;

// Árbol de categorías: los productos van solo en las hojas.
const CATEGORIES = {
  Alimentos: {
    Perros: ["Alimento seco", "Snacks"],
    Gatos: ["Alimento seco", "Snacks"],
  },
  Accesorios: {
    "Piedras sanitarias": [],
    Juguetes: [],
  },
} as const;

type Leaf =
  | "Perros/Alimento seco"
  | "Perros/Snacks"
  | "Gatos/Alimento seco"
  | "Gatos/Snacks"
  | "Accesorios/Piedras sanitarias"
  | "Accesorios/Juguetes";

const PRODUCTS: {
  name: string;
  sku: string;
  category: Leaf;
  /** Neto. */
  price: string;
  tax: "IVA 21%" | "IVA 10,5%";
  unit: "u" | "kg";
  weight: string;
  volume?: string;
  minStock?: string;
  /** Stock inicial por depósito y ubicación en el Sur. */
  south: string;
  north?: string;
  location: string;
  description?: string;
}[] = [
  {
    name: "Alimento perro adulto 15 kg",
    sku: "PER-AD-15",
    category: "Perros/Alimento seco",
    price: "26000",
    tax: "IVA 10,5%",
    unit: "u",
    weight: "15",
    volume: "30",
    minStock: "10",
    south: "40",
    north: "12",
    location: "A-01-1",
    description: "Bolsa de 15 kg para perros adultos de todas las razas.",
  },
  {
    name: "Alimento perro cachorro 15 kg",
    sku: "PER-CA-15",
    category: "Perros/Alimento seco",
    price: "28500",
    tax: "IVA 10,5%",
    unit: "u",
    weight: "15",
    volume: "30",
    minStock: "6",
    south: "4",
    location: "A-01-2",
  },
  {
    name: "Alimento perro adulto 3 kg",
    sku: "PER-AD-3",
    category: "Perros/Alimento seco",
    price: "6900",
    tax: "IVA 10,5%",
    unit: "u",
    weight: "3",
    volume: "6",
    south: "60",
    location: "A-01-3",
  },
  {
    name: "Alimento perro suelto",
    sku: "PER-SUELTO",
    category: "Perros/Alimento seco",
    price: "2950",
    tax: "IVA 10,5%",
    unit: "kg",
    weight: "1",
    minStock: "30",
    south: "120.5",
    location: "A-01-4",
  },
  {
    name: "Alimento gato adulto 7,5 kg",
    sku: "GAT-AD-75",
    category: "Gatos/Alimento seco",
    price: "19800",
    tax: "IVA 10,5%",
    unit: "u",
    weight: "7.5",
    volume: "15",
    minStock: "8",
    south: "25",
    north: "6",
    location: "A-02-1",
  },
  {
    name: "Alimento gato suelto",
    sku: "GAT-SUELTO",
    category: "Gatos/Alimento seco",
    price: "3950",
    tax: "IVA 10,5%",
    unit: "kg",
    weight: "1",
    minStock: "50",
    south: "35",
    location: "A-02-2",
  },
  {
    name: "Snack dental perro x 7",
    sku: "SNK-DEN-7",
    category: "Perros/Snacks",
    price: "2400",
    tax: "IVA 21%",
    unit: "u",
    weight: "0.18",
    south: "80",
    location: "B-01-1",
  },
  {
    name: "Snack gato atún 60 g",
    sku: "SNK-GAT-60",
    category: "Gatos/Snacks",
    price: "1100",
    tax: "IVA 21%",
    unit: "u",
    weight: "0.06",
    south: "150",
    location: "B-01-2",
  },
  {
    name: "Piedras sanitarias 4 kg",
    sku: "PIE-4",
    category: "Accesorios/Piedras sanitarias",
    price: "3500",
    tax: "IVA 21%",
    unit: "u",
    weight: "4",
    volume: "5",
    minStock: "20",
    south: "45",
    north: "20",
    location: "C-01-1",
  },
  {
    name: "Piedras sanitarias aglomerantes 10 kg",
    sku: "PIE-AGL-10",
    category: "Accesorios/Piedras sanitarias",
    price: "9800",
    tax: "IVA 21%",
    unit: "u",
    weight: "10",
    volume: "12",
    south: "18",
    location: "C-01-2",
  },
  {
    name: "Pelota de goma",
    sku: "JUG-PEL",
    category: "Accesorios/Juguetes",
    price: "1800",
    tax: "IVA 21%",
    unit: "u",
    weight: "0.1",
    south: "70",
    location: "C-02-1",
  },
  {
    name: "Rascador para gato",
    sku: "JUG-RASC",
    category: "Accesorios/Juguetes",
    price: "15500",
    tax: "IVA 21%",
    unit: "u",
    weight: "2.5",
    volume: "40",
    south: "7",
    location: "C-02-2",
  },
];

const WAREHOUSES = [
  {
    key: "south",
    name: "Depósito Sur",
    address: "Av. Mitre 1450",
    city: "Avellaneda",
    phone: "11 4201-1000",
    contactName: "Encargado Sur",
  },
  {
    key: "north",
    name: "Depósito Norte",
    address: "Hipólito Yrigoyen 3200",
    city: "Lanús",
    phone: "11 4241-2000",
    contactName: "Encargado Norte",
  },
] as const;

const SUPPLIERS = [
  {
    legalName: "Nutrición Animal del Sur SA",
    tradeName: "Nutrición del Sur",
    cuit: "30712345604",
    contactName: "Ventas mayoristas",
    contactPhone: "11 4250-3300",
    contactMail: mail("ventas.nutricion"),
    city: "Quilmes",
    address: "Calchaquí 2100",
    // Los alimentos y snacks.
    skus: [
      "PER-AD-15",
      "PER-CA-15",
      "PER-AD-3",
      "PER-SUELTO",
      "GAT-AD-75",
      "GAT-SUELTO",
      "SNK-DEN-7",
      "SNK-GAT-60",
    ],
  },
  {
    legalName: "Accesorios Pet SRL",
    tradeName: null,
    cuit: "30712345671",
    contactName: "Atención comercial",
    contactPhone: "11 4238-4400",
    contactMail: mail("comercial.accesorios"),
    city: "Lomas de Zamora",
    address: "Av. Meeks 900",
    skus: ["PIE-4", "PIE-AGL-10", "JUG-PEL", "JUG-RASC"],
  },
];

// Listas de precios: un ajuste sobre el precio base y algún precio fijo.
const PRICE_LISTS = [
  { name: "Veterinarias", adjustment: "-0.05", fixed: {} },
  { name: "Mayorista", adjustment: "-0.10", fixed: { "PIE-4": "5000" } },
] as const;

const CUSTOMERS: {
  tradeName: string;
  legalName: string;
  cuit: string;
  person: { name: string; surname: string; user: string };
  addresses: { name: string; address: string; city: string }[];
  priceList?: (typeof PRICE_LISTS)[number]["name"];
  discountRate?: string;
}[] = [
  {
    tradeName: "Pet Shop Patitas",
    legalName: "Patitas SRL",
    cuit: "30712345744",
    person: { name: "Marina", surname: "López", user: "patitas" },
    addresses: [
      { name: "Local Quilmes", address: "Rivadavia 450", city: "Quilmes" },
      {
        name: "Sucursal Berazategui",
        address: "Calle 14 nº 4600",
        city: "Berazategui",
      },
    ],
  },
  {
    tradeName: "Veterinaria San Roque",
    legalName: "Veterinaria San Roque SA",
    cuit: "30712345817",
    person: { name: "Diego", surname: "Fernández", user: "sanroque" },
    addresses: [
      { name: "Consultorio", address: "9 de Julio 1200", city: "Lanús" },
    ],
  },
  {
    tradeName: "Mascotas Varela",
    legalName: "Distribuidora Mascotas Varela SRL",
    cuit: "30712345884",
    person: { name: "Carla", surname: "Ruiz", user: "varela" },
    // Compra por mayor: lista Mayorista y 2 % más por volumen.
    priceList: "Mayorista",
    discountRate: "0.02",
    addresses: [
      {
        name: "Depósito",
        address: "Av. San Martín 3300",
        city: "Florencio Varela",
      },
    ],
  },
];

// Pedidos pendientes: [cliente, dirección, [sku, cantidad]...].
const ORDERS: [number, number, [string, string][], string | null][] = [
  [
    0,
    0,
    [
      ["PER-AD-15", "4"],
      ["GAT-SUELTO", "12.5"],
      ["SNK-DEN-7", "10"],
    ],
    "Entregar antes de las 12",
  ],
  [
    0,
    1,
    [
      ["PIE-4", "6"],
      ["JUG-PEL", "12"],
    ],
    null,
  ],
  [
    1,
    0,
    [
      ["PER-CA-15", "2"],
      ["GAT-AD-75", "3"],
    ],
    null,
  ],
  [
    2,
    0,
    [
      ["PER-AD-15", "10"],
      ["PER-SUELTO", "40"],
      ["PIE-AGL-10", "5"],
    ],
    "Descargar por el portón lateral",
  ],
];

/** Carga la demo. Devuelve false si la base ya tiene productos (no hace nada). */
export async function seedDemo(db: Db): Promise<boolean> {
  if ((await db.product.count()) > 0) return false;

  for (const { cuit } of [...SUPPLIERS, ...CUSTOMERS]) {
    if (!isValidCuit(cuit)) throw new Error(`CUIT de demo inválido: ${cuit}`);
  }
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const cityId = async (name: string) =>
    (await db.city.findFirstOrThrow({ where: { name } })).id;

  await db.$transaction(
    async (tx) => {
      // Usuarios internos: un admin de demo (sin cambio de contraseña) y un repartidor.
      await tx.person.create({
        data: {
          name: "Admin",
          surname: "Demo",
          mail: mail("admin"),
          phone: "11 5555-0000",
          user: {
            create: {
              userType: UserType.ADMIN,
              passwordHash,
              passwordMustChange: false,
            },
          },
        },
      });
      const driverPerson = await tx.person.create({
        data: {
          name: "Pablo",
          surname: "Gómez",
          mail: mail("reparto"),
          phone: "11 5555-1111",
          user: {
            create: {
              userType: UserType.DRIVER,
              passwordHash,
              passwordMustChange: false,
            },
          },
        },
        include: { user: true },
      });
      await tx.driver.create({
        data: {
          name: "Pablo Gómez",
          phone: "11 5555-1111",
          userId: driverPerson.user!.id,
        },
      });
      await tx.vehicle.create({
        data: {
          name: "Utilitario Fiorino",
          plate: "AB123CD",
          capacityKg: "650",
          capacityLiters: "3000",
        },
      });

      // Categorías.
      const leaves = new Map<string, number>();
      for (const [rootName, children] of Object.entries(CATEGORIES)) {
        const root = await tx.category.create({ data: { name: rootName } });
        for (const [childName, grandchildren] of Object.entries(children)) {
          const child = await tx.category.create({
            data: { name: childName, parentId: root.id },
          });
          if (grandchildren.length === 0) {
            leaves.set(`${rootName}/${childName}`, child.id);
          }
          for (const leafName of grandchildren) {
            const leaf = await tx.category.create({
              data: { name: leafName, parentId: child.id },
            });
            leaves.set(`${childName}/${leafName}`, leaf.id);
          }
        }
      }

      // Depósitos.
      const warehouses = new Map<string, string>();
      for (const { key, city, ...data } of WAREHOUSES) {
        const warehouse = await tx.warehouse.create({
          data: { ...data, cityId: await cityId(city) },
        });
        warehouses.set(key, warehouse.id);
      }

      // Productos con su stock inicial (ingreso en el libro) y ubicación.
      const taxRates = await tx.taxRate.findMany();
      const units = await tx.measurementUnit.findMany();
      const products = new Map<
        string,
        {
          id: string;
          price: string;
          weight: string;
          volume: string | null;
          rate: string;
        }
      >();
      for (const item of PRODUCTS) {
        const tax = taxRates.find((rate) => rate.name === item.tax)!;
        const product = await tx.product.create({
          data: {
            name: item.name,
            sku: item.sku,
            description: item.description ?? null,
            categoryId: leaves.get(item.category)!,
            price: item.price,
            taxRateId: tax.id,
            measurementUnitId: units.find((unit) => unit.name === item.unit)!
              .id,
            weight: item.weight,
            volume: item.volume ?? null,
            minStock: item.minStock ?? null,
          },
        });
        products.set(item.sku, {
          id: product.id,
          price: item.price,
          weight: item.weight,
          volume: item.volume ?? null,
          rate: tax.rate.toString(),
        });
        for (const key of ["south", "north"] as const) {
          const quantity = item[key];
          if (!quantity) continue;
          const warehouseId = warehouses.get(key)!;
          await tx.productStock.create({
            data: {
              productId: product.id,
              warehouseId,
              quantity,
              location: key === "south" ? item.location : null,
            },
          });
          await tx.stockMovement.create({
            data: {
              productId: product.id,
              warehouseId,
              type: "ENTRY",
              quantity,
              balanceAfter: quantity,
              comment: "Stock inicial (demo)",
            },
          });
        }
      }

      // Proveedores con sus productos y el último costo (≈ 70 % del precio).
      for (const { city, skus, ...data } of SUPPLIERS) {
        await tx.supplier.create({
          data: {
            ...data,
            taxCondition: TaxCondition.REGISTERED_TAXPAYER,
            cityId: await cityId(city),
            products: {
              create: skus.map((sku) => {
                const product = products.get(sku)!;
                return {
                  productId: product.id,
                  supplierCode: sku.replace(/-/g, ""),
                  lastCost: (Number(product.price) * 0.7).toFixed(2),
                  lastCostAt: new Date(),
                };
              }),
            },
          },
        });
      }

      const priceLists = new Map<string, string>();
      for (const list of PRICE_LISTS) {
        const created = await tx.priceList.create({
          data: {
            name: list.name,
            adjustment: list.adjustment,
            items: {
              create: Object.entries(list.fixed).map(([sku, price]) => ({
                productId: products.get(sku)!.id,
                price,
              })),
            },
          },
        });
        priceLists.set(list.name, created.id);
      }

      // Clientes con su persona (usuario CLIENT) y direcciones.
      const customers: { userId: string; addressIds: string[] }[] = [];
      for (const customer of CUSTOMERS) {
        const created = await tx.customer.create({
          data: {
            tradeName: customer.tradeName,
            legalName: customer.legalName,
            cuit: customer.cuit,
            taxCondition: TaxCondition.REGISTERED_TAXPAYER,
            priceListId: customer.priceList
              ? priceLists.get(customer.priceList)
              : undefined,
            discountRate: customer.discountRate ?? "0",
          },
        });
        const person = await tx.person.create({
          data: {
            customerId: created.id,
            name: customer.person.name,
            surname: customer.person.surname,
            mail: mail(customer.person.user),
            phone: "11 5555-2222",
            user: {
              create: {
                userType: UserType.CLIENT,
                passwordHash,
                passwordMustChange: false,
              },
            },
          },
          include: { user: true },
        });
        const addressIds: string[] = [];
        for (const address of customer.addresses) {
          const { id } = await tx.customerAddress.create({
            data: {
              customerId: created.id,
              name: address.name,
              address: address.address,
              cityId: await cityId(address.city),
            },
          });
          addressIds.push(id);
        }
        customers.push({ userId: person.user!.id, addressIds });
      }

      // Pedidos pendientes, con la foto del producto como en el checkout.
      for (const [customerIndex, addressIndex, lines, notes] of ORDERS) {
        const customer = customers[customerIndex];
        const items = lines.map(([sku, quantity]) => ({
          ...products.get(sku)!,
          quantity,
        }));
        const totals = cartTotals(
          items.map((item) => ({
            price: item.price,
            rate: item.rate,
            quantity: item.quantity,
            weight: item.weight,
          })),
        );
        await tx.sale.create({
          data: {
            userId: customer.userId,
            addressId: customer.addressIds[addressIndex],
            subTotal: totals.net,
            tax: totals.tax,
            discount: "0",
            total: totals.total,
            paymentMethod: "CASH",
            notes,
            items: {
              create: items.map((item) => ({
                productId: item.id,
                quantity: item.quantity,
                // Pedidos de demo a precio base.
                unitPrice: item.price,
                unitListPrice: item.price,
                unitWeight: item.weight,
                unitVolume: item.volume,
                unitTaxRate: item.rate,
              })),
            },
          },
        });
      }
    },
    { timeout: 60_000 },
  );
  return true;
}
