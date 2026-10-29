import "server-only";
import packageJson from "../../package.json";

/**
 * Versión instalada ("v1.41.0-beta"), para soporte. La sube release-please en
 * package.json en cada release. Se muestra solo con sesión de admin: en una
 * página pública ayudaría a buscar fallas conocidas de esa versión.
 */
export const APP_VERSION = `v${packageJson.version}`;
