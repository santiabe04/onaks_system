// Conventional Commits: release-please decide la versión a partir de estos prefijos.
// feat → MINOR · fix → PATCH · feat! / BREAKING CHANGE → MAJOR
const config = {
  extends: ["@commitlint/config-conventional"],
};

export default config;
