// Textos de la UI en español (idioma por defecto). El tipo `Dictionary` sale de
// acá, así que a `en.ts` no le puede faltar ninguna clave. Solo strings, para
// poder pasarlos a Client Components; los `{x}` se completan con `interpolate`.
// El nombre de la app no va acá: es marca (ver `lib/app`).
export const es = {
  common: {
    loading: "Cargando…",
    saving: "Guardando…",
    save: "Guardar",
    create: "Crear",
    cancel: "Cancelar",
    edit: "Editar",
    delete: "Borrar",
    deleting: "Borrando…",
    actions: "Acciones",
  },
  userMenu: {
    changePassword: "Cambiar contraseña",
    logout: "Salir",
  },
  notFound: {
    title: "Página no encontrada",
    description: "La dirección no existe o ya no está disponible.",
    back: "Volver al inicio",
  },
  home: {
    subtitle: "Proyecto inicializado.",
    measurementUnits: "Unidades de medida",
  },
  login: {
    title: "Ingresar",
    intro: "Ingresá con el mail y la contraseña que te dio la distribuidora.",
    mail: "Mail",
    password: "Contraseña",
    submit: "Ingresar",
    pending: "Ingresando…",
    errors: {
      invalidMail: "Ingresá un mail válido",
      passwordRequired: "Ingresá la contraseña",
      passwordTooLong: "Contraseña demasiado larga",
      invalidCredentials: "Mail o contraseña incorrectos",
    },
  },
  changePassword: {
    title: "Cambiar contraseña",
    intro:
      "Si es tu primer ingreso o te blanquearon la contraseña, elegí una nueva para seguir.",
    current: "Contraseña actual",
    new: "Contraseña nueva (mínimo {min} caracteres)",
    confirm: "Repetí la contraseña nueva",
    submit: "Cambiar contraseña",
    errors: {
      currentRequired: "Ingresá tu contraseña actual",
      tooShort: "Mínimo {min} caracteres",
      tooLong: "Demasiado larga (máximo {max} bytes)",
      mismatch: "Las contraseñas no coinciden",
      sameAsCurrent: "Tiene que ser distinta de la actual",
      currentWrong: "La contraseña actual no es correcta",
    },
  },
  measurementUnits: {
    title: "Unidades de medida",
    newButton: "Nueva unidad",
    newTitle: "Nueva unidad de medida",
    editTitle: "Editar unidad de medida",
    empty: "No hay unidades cargadas.",
    name: "Nombre",
    description: "Descripción",
    descriptionOptional: "Descripción (opcional)",
    namePlaceholder: "kg",
    descriptionPlaceholder: "Kilogramo",
    products: "Productos",
    hasProducts: "Tiene productos asociados",
    confirmDelete: '¿Borrar la unidad "{name}"?',
    errors: {
      nameRequired: "El nombre es obligatorio",
      tooLong: "Máximo {max} caracteres",
      duplicate: "Ya existe una unidad con ese nombre",
      invalid: "Unidad inválida",
      notFound: "La unidad ya no existe",
      inUse: "No se puede borrar: hay productos que la usan",
    },
  },
};

export type Dictionary = typeof es;
