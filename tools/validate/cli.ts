import { validateRepo, writeCatalog } from "./validate.ts";

const root = process.argv[2] ?? process.cwd();
const { issues, skills } = validateRepo(root);

for (const issue of issues) {
	console.error(`${issue.skill ?? "repo"} [${issue.code}] ${issue.message}`);
}
if (issues.length > 0) {
	console.error(`${issues.length} problem(s), catalog.json not written`);
	process.exit(1);
}

writeCatalog(root, skills);
console.log(
	`${skills.length} skills valid, catalog.json and README.md written`,
);
