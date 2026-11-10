import "server-only";
import { db } from "./db";

export type CityGroup = {
  state: string;
  cities: { id: number; name: string }[];
};

/** Cities grouped by province, for a <select> with <optgroup>. */
export async function getCityGroups(): Promise<CityGroup[]> {
  const states = await db.state.findMany({
    orderBy: { name: "asc" },
    select: {
      name: true,
      cities: { orderBy: { name: "asc" }, select: { id: true, name: true } },
    },
  });
  return states
    .filter((state) => state.cities.length > 0)
    .map((state) => ({ state: state.name, cities: state.cities }));
}
