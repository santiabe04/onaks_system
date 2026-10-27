import type { Metadata } from "next";
import { logout } from "@/app/login/actions";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = {
  title: "Cambiar contraseña · Onaks System",
};

// Sin UserMenu: getCurrentUser redirige acá mismo si el cambio está pendiente.
// El acceso lo controlan el proxy y la Server Action.
export default function ChangePasswordPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold">Cambiar contraseña</h1>
        <p className="mt-1 text-sm opacity-70">
          Si es tu primer ingreso o te blanquearon la contraseña, elegí una
          nueva para seguir.
        </p>
        <ChangePasswordForm />
        <form action={logout} className="mt-4 text-center">
          <button type="submit" className="text-sm opacity-70 hover:underline">
            Salir
          </button>
        </form>
      </div>
    </main>
  );
}
