import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Ingresar · Onaks System" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold">Onaks System</h1>
        <p className="mt-1 text-sm opacity-70">
          Ingresá con el mail y la contraseña que te dio la distribuidora.
        </p>
        <LoginForm />
      </div>
    </main>
  );
}
