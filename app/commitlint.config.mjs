// Conventional Commits: release-please decides the version from these prefixes.
// feat → MINOR · fix → PATCH · feat! / BREAKING CHANGE → MAJOR
const config = {
  extends: ["@commitlint/config-conventional"],
};

export default config;
