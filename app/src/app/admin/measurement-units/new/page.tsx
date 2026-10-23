import { createMeasurementUnit } from "../actions";
import { MeasurementUnitForm } from "../measurement-unit-form";

export default function NewMeasurementUnitPage() {
  return (
    <main className="mx-auto w-full max-w-md p-8">
      <h1 className="text-2xl font-semibold">Nueva unidad de medida</h1>
      <MeasurementUnitForm action={createMeasurementUnit} submitLabel="Crear" />
    </main>
  );
}
