import "server-only";
import packageJson from "../../package.json";

/**
 * Installed version ("v1.41.0-beta"), for support. release-please raises it in
 * package.json on each release. It is shown only with an admin session: on a
 * public page it would help look for known faults in that version.
 */
export const APP_VERSION = `v${packageJson.version}`;
