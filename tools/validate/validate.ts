import { lstatSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, posix, relative, sep } from "node:path";

// Limits and rules come from Rakazo's plugin import, see docs/import-format.md.
const ALLOWED_SCHEMAS = new Set([
	"https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
	"https://agent-plugins.org/schemas/1.1.0/plugin.schema.json",
]);
const MANIFEST_NAME = /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
const MAX_FILE_BYTES = 100_000;
const MAX_COMPANIONS = 40;
const MAX_COMPANION_BYTES = 400_000;
const MAX_REPO_BYTES = 4_000_000;
const MAX_REPO_FILES = 200;
const MAX_TREE_ENTRIES = 5000;
const COMPANION_EXTENSION = /\.(md|mdx|txt|json|ya?ml|csv)$/i;
const UNSAFE_PATH = /[\\%#?\p{Cc}]/u;
const RESERVED_NAMES = new Set(["interrogate", "rakazo"]);
// These root entries make the plugin import add or report extra components.
const FORBIDDEN_ROOT_ENTRIES = [
	"agents",
	"commands",
	"rules",
	"hooks",
	"automations",
	"mcp.json",
	".mcp.json",
	".lsp.json",
];

// Library rules, stricter than Rakazo: 48 = catalog cap of 50 minus 2 builtins.
const MAX_SKILLS = 48;
const SKILL_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_NAME_LENGTH = 64;
const MIN_DESCRIPTION_LENGTH = 40;
const MAX_DESCRIPTION_LENGTH = 500;
const CATEGORIES = new Set(["buero", "gastro", "allgemein"]);
const APPROVALS = new Set(["pflicht", "keine"]);
const MCP_TOOLS: Record<string, string[]> = {
	"knowledge-mcp": ["search_knowledge", "get_document", "list_documents"],
	"dach-mcp": ["check_vat_id", "public_holidays", "validate_iban"],
	"offer-mcp": [
		"list_price_options",
		"calculate_offer",
		"draft_supplier_inquiry",
		"create_offer_document",
	],
};
const MCP_TOOL = new RegExp(
	`\\b(?:${Object.values(MCP_TOOLS).flat().join("|")})\\b`,
	"g",
);
const REQUIRED_SECTIONS = [
	"Ziel",
	"Wann verwenden",
	"Eingaben",
	"Schritte",
	"Ausgabe",
	"Freigabe",
	"Grenzen",
	"Beispiel-Durchlauf",
];
const ALLOWED_EMAIL = /(@example\.com|^hello@orbilyte\.de)$/i;
// The lookbehind keeps matching linear on long runs without a separator.
const EMAIL = /(?<![\w.+-])[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const SECRET_PATTERNS = [
	/\bsk-[A-Za-z0-9_-]{16,}/,
	/\bAKIA[0-9A-Z]{16}\b/,
	/\bgh[pousr]_[A-Za-z0-9]{20,}/,
	/\bgithub_pat_[A-Za-z0-9_]{20,}/,
	/\bxox[abprs]-[A-Za-z0-9-]{10,}/,
	/-----BEGIN [A-Z ]*PRIVATE KEY-----/,
	/\bBearer\s+[A-Za-z0-9._~+/-]{20,}/,
	/\b(?:api[_-]?key|secret|token|password)\s*[:=]\s*["']?[A-Za-z0-9._~+/-]{16,}/i,
];
const MARKDOWN_LINK = /\]\(([^)\s]+)\)/g;
const CODE_FILE_REFERENCE = /`([\w./-]+\.(?:md|mdx|txt|json|ya?ml|csv))`/g;

// Publication rules. The customer terms live in a file that is not published,
// so that the public validator does not name what it keeps out.
const PUBLISH_IGNORE = ".publishignore";
const CUSTOMER_TERMS = "tools/validate/forbidden-terms.txt";
// Generic shapes only. Names of internal folders belong in the terms file.
const INTERNAL_REFERENCES = [
	/(?<![\w.])\.\.\/\w/,
	/\/Users\//,
	/\blocal_[0-9a-f]{8}\b/,
	/(?<![\w+/=-])[EFUKPSWX]\d{1,2}(?![\w+/=-])/,
];
// These state or demonstrate the rules, so they contain what the rules forbid.
const RULES_EXEMPT =
	/^tools\/validate\/(?:validate\.ts$|validate\.test\.ts$|fixtures\/invalid\/)/;
// Generated, not written by hand: the lock file names packages with an @, and
// catalog.json is built from the checked skills and compared by a test.
const GENERATED = new Set(["pnpm-lock.yaml", "catalog.json"]);

export type IssueCode =
	| "manifest"
	| "root-entry"
	| "unsafe-path"
	| "too-many-skills"
	| "repo-size"
	| "missing-skill-md"
	| "frontmatter"
	| "name"
	| "description"
	| "metadata"
	| "section"
	| "size"
	| "companion"
	| "encoding"
	| "forbidden-character"
	| "spelling"
	| "email"
	| "secret"
	| "missing-reference"
	| "example"
	| "internal-reference"
	| "customer-detail"
	| "publish-ignore";

export type Issue = { skill: string | null; code: IssueCode; message: string };

export type CatalogSkill = {
	name: string;
	description: string;
	category: string;
	requiredMcpServers: string[];
	approval: string;
	path: string;
};

export type ValidationResult = {
	issues: Issue[];
	skills: CatalogSkill[];
};

type Frontmatter = {
	fields: Map<string, string>;
	metadata: Map<string, string>;
};

const QUOTED = /^(?:"([^"]*)"|'([^']*)')$/;

// Rakazo keeps these as plain text, but standard YAML parsers in other Agent
// Skills tools read them differently or reject them.
function scalarProblem(value: string): string | null {
	if (value.includes(" #")) return "inline comment is kept as value";
	if (QUOTED.test(value)) return null;
	if (value.includes(": ")) return "quote values that contain a colon";
	if (/^["']/.test(value)) return "quote the whole value";
	return null;
}

function readScalar(
	raw: string,
	line: string,
): { value: string } | { error: string } {
	const value = raw.trim();
	const problem = scalarProblem(value);
	if (problem) return { error: `${problem}: ${line}` };
	const quoted = QUOTED.exec(value);
	return { value: quoted?.[1] ?? quoted?.[2] ?? value };
}

// Accepts a deliberately small subset of what Rakazo's hand-written YAML parser
// understands, so that a skill never depends on its quirks: one-line scalars and
// a single `metadata` map.
export function parseFrontmatter(
	content: string,
): { value: Frontmatter; body: string } | { error: string } {
	const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(content);
	if (!match) return { error: "must start with a --- frontmatter block" };

	const fields = new Map<string, string>();
	const metadata = new Map<string, string>();
	let inMetadata = false;
	for (const line of (match[1] ?? "").split(/\r?\n/)) {
		if (!line.trim()) continue;
		const nested = /^ {2}([A-Za-z_][\w-]*):\s+(\S.*)$/.exec(line);
		if (inMetadata && nested?.[1] && nested[2]) {
			const scalar = readScalar(nested[2], line);
			if ("error" in scalar) return scalar;
			metadata.set(nested[1], scalar.value);
			continue;
		}
		const keyed = /^([A-Za-z_][\w-]*):(?:\s+(\S.*))?$/.exec(line);
		if (!keyed?.[1]) return { error: `unsupported line: ${line}` };
		if (keyed[2] === undefined) {
			if (keyed[1] !== "metadata") {
				return { error: `only metadata may be a map: ${line}` };
			}
			inMetadata = true;
			continue;
		}
		inMetadata = false;
		if (/^[>|[{]/.test(keyed[2])) {
			return { error: `block and inline collections unsupported: ${line}` };
		}
		const scalar = readScalar(keyed[2], line);
		if ("error" in scalar) return scalar;
		fields.set(keyed[1], scalar.value);
	}
	return {
		value: { fields, metadata },
		body: content.slice(match[0].length),
	};
}

type Report = (code: IssueCode, message: string) => void;

function reporter(issues: Issue[], skill: string | null): Report {
	return (code, message) => issues.push({ skill, code, message });
}

function checkText(text: string, file: string, report: Report): void {
	const add = (code: IssueCode, message: string) =>
		report(code, `${file}: ${message}`);

	if (text.includes("—")) add("forbidden-character", "contains U+2014");
	if (text.includes("–")) add("forbidden-character", "contains U+2013");
	if (text.includes("Orbilyte") || text.includes("ORBILYTE")) {
		add("spelling", 'write "orbilyte" in lower case');
	}
	for (const email of text.match(EMAIL) ?? []) {
		if (!ALLOWED_EMAIL.test(email))
			add("email", `address not allowed: ${email}`);
	}
	if (SECRET_PATTERNS.some((pattern) => pattern.test(text))) {
		add("secret", "contains a pattern that looks like a secret");
	}
}

function checkReferences(
	body: string,
	companions: Set<string>,
	report: Report,
): void {
	const references = [
		...[...body.matchAll(MARKDOWN_LINK)].map((m) => m[1] ?? ""),
		...[...body.matchAll(CODE_FILE_REFERENCE)].map((m) => m[1] ?? ""),
	];
	for (const reference of references) {
		if (URL.canParse(reference) || reference.startsWith("#")) continue;
		const path = posix.normalize(reference.split("#")[0] ?? "");
		if (!companions.has(path)) {
			report("missing-reference", `references missing file: ${reference}`);
		}
	}
}

// Entries git never tracks and that therefore never reach the import.
const UNTRACKED_ENTRIES = new Set([
	".DS_Store",
	".env.local",
	".git",
	"coverage",
	"node_modules",
]);

function listFiles(dir: string, root: string, found: string[] = []): string[] {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (UNTRACKED_ENTRIES.has(entry.name)) continue;
		const path = join(dir, entry.name);
		if (entry.isDirectory()) listFiles(path, root, found);
		else found.push(relative(root, path).split(sep).join("/"));
	}
	return found;
}

function decode(bytes: Buffer): string | null {
	try {
		return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch {
		return null;
	}
}

type FileStats = { fileCount: number; bytes: number };

function checkSkillFiles(
	skillDir: string,
	files: string[],
	report: Report,
): FileStats & { skillText: string | null } {
	let bytes = 0;
	let companionBytes = 0;
	let skillText: string | null = null;
	const companionCount = files.length - 1;
	if (companionCount > MAX_COMPANIONS) {
		report("companion", `more than ${MAX_COMPANIONS} additional files`);
	}
	for (const file of files) {
		const path = join(skillDir, file);
		if (lstatSync(path).isSymbolicLink()) {
			report("companion", `${file}: symbolic links are refused by the import`);
			continue;
		}
		if (file !== "SKILL.md" && !COMPANION_EXTENSION.test(file)) {
			report("companion", `${file}: file type is refused by the import`);
			continue;
		}
		const content = readFileSync(path);
		bytes += content.length;
		if (file !== "SKILL.md") companionBytes += content.length;
		if (content.length > MAX_FILE_BYTES) {
			report("size", `${file}: larger than ${MAX_FILE_BYTES} bytes`);
		}
		const text = decode(content);
		if (text === null) report("encoding", `${file}: not valid UTF-8`);
		else checkText(text, file, report);
		if (file === "SKILL.md") skillText = text;
	}
	if (companionBytes > MAX_COMPANION_BYTES) {
		report("size", `additional files exceed ${MAX_COMPANION_BYTES} bytes`);
	}
	return { fileCount: files.length, bytes, skillText };
}

function checkSkillMd(
	text: string,
	folder: string,
	companions: string[],
	report: Report,
): CatalogSkill | null {
	const parsed = parseFrontmatter(text);
	if ("error" in parsed) {
		report("frontmatter", parsed.error);
		return null;
	}

	const { fields, metadata } = parsed.value;
	const name = fields.get("name") ?? "";
	if (!name) report("name", "frontmatter requires name");
	else if (name !== folder) {
		report("name", `name "${name}" differs from folder`);
	}
	if (RESERVED_NAMES.has(name.toLowerCase())) {
		report("name", `"${name}" is a built-in skill of Rakazo`);
	}

	const description = fields.get("description") ?? "";
	if (
		description.length < MIN_DESCRIPTION_LENGTH ||
		description.length > MAX_DESCRIPTION_LENGTH
	) {
		report(
			"description",
			`needs ${MIN_DESCRIPTION_LENGTH} to ${MAX_DESCRIPTION_LENGTH} characters, has ${description.length}`,
		);
	}

	const requireOneOf = (key: string, allowed: Set<string>): string => {
		const value = metadata.get(key) ?? "";
		if (!allowed.has(value)) {
			report("metadata", `${key} must be one of ${[...allowed].join(", ")}`);
		}
		return value;
	};
	const category = requireOneOf("kategorie", CATEGORIES);
	const approval = requireOneOf("freigabe", APPROVALS);
	const servers = (metadata.get("mcp-server") ?? "")
		.split(",")
		.map((server) => server.trim())
		.filter(Boolean)
		.sort();
	for (const server of servers) {
		if (!(server in MCP_TOOLS)) report("metadata", `unknown server: ${server}`);
	}

	const headings = new Set(
		[...parsed.body.matchAll(/^## (.+)$/gm)].map((m) => m[1]?.trim()),
	);
	const required = [...REQUIRED_SECTIONS];
	const usedTools = new Set(parsed.body.match(MCP_TOOL) ?? []);
	if (servers.length > 0 || usedTools.size > 0) {
		required.push("Ohne MCP-Server");
	}
	for (const [server, tools] of Object.entries(MCP_TOOLS)) {
		const used = tools.find((tool) => usedTools.has(tool));
		if (used && !servers.includes(server)) {
			report("metadata", `${used} needs ${server} in mcp-server`);
		}
	}
	for (const section of required) {
		if (!headings.has(section)) {
			report("section", `section missing: ## ${section}`);
		}
	}

	const example = parsed.body
		.split(/^## /m)
		.find((section) => /^Beispiel-Durchlauf\r?\n/.test(section));
	if (example && !/fiktiv/i.test(example)) {
		report("example", 'Beispiel-Durchlauf must be marked as "fiktiv"');
	}

	checkReferences(parsed.body, new Set(companions), report);

	return {
		name,
		description,
		category,
		requiredMcpServers: servers,
		approval,
		path: `skills/${folder}`,
	};
}

function validateSkill(
	root: string,
	folder: string,
	issues: Issue[],
): FileStats & { catalog: CatalogSkill | null } {
	const skillDir = join(root, "skills", folder);
	const report = reporter(issues, folder);

	if (!SKILL_NAME.test(folder) || folder.length > MAX_NAME_LENGTH) {
		report(
			"name",
			`folder must be kebab-case with at most ${MAX_NAME_LENGTH} characters`,
		);
	}

	const files = listFiles(skillDir, skillDir);
	// Exact comparison: macOS file systems are case-insensitive, the import is not.
	if (!files.includes("SKILL.md")) {
		report("missing-skill-md", "SKILL.md is missing");
		return { catalog: null, fileCount: 0, bytes: 0 };
	}

	const { skillText, ...stats } = checkSkillFiles(skillDir, files, report);
	const companions = files.filter((file) => file !== "SKILL.md");
	const catalog =
		skillText === null
			? null
			: checkSkillMd(skillText, folder, companions, report);
	return { catalog, ...stats };
}

function isManifestAuthor(author: unknown): boolean {
	if (typeof author !== "object" || author === null) return false;
	return Object.entries(author).every(
		([key, value]) =>
			["name", "email", "url"].includes(key) && typeof value === "string",
	);
}

function checkManifestFields(
	manifest: unknown,
	add: (m: string) => void,
): void {
	if (typeof manifest !== "object" || manifest === null) {
		add("plugin.json must contain an object");
		return;
	}
	const { $schema, name, version, description, author } = manifest as Record<
		string,
		unknown
	>;
	if (typeof $schema !== "string" || !ALLOWED_SCHEMAS.has($schema)) {
		add("$schema is not supported by the import");
	}
	if (
		typeof name !== "string" ||
		name.length > 64 ||
		!MANIFEST_NAME.test(name)
	) {
		add("name is not valid for the import");
	}
	for (const [key, value] of Object.entries({ version, description })) {
		if (value !== undefined && typeof value !== "string") {
			add(`${key} must be a string`);
		}
	}
	if (author !== undefined && !isManifestAuthor(author)) {
		add("author must be an object with only name, email and url");
	}
}

function validateManifest(root: string, report: Report): number {
	const add = (message: string) => report("manifest", message);
	let content: Buffer;
	try {
		content = readFileSync(join(root, "plugin.json"));
	} catch {
		add("plugin.json is missing, the import refuses the repository");
		return 0;
	}
	try {
		checkManifestFields(JSON.parse(content.toString("utf8")), add);
	} catch {
		add("plugin.json is not valid JSON");
	}
	return content.length;
}

// The import checks every path in the repository, so one bad name anywhere fails it.
function validateRepoPaths(paths: string[], report: Report): void {
	for (const path of paths) {
		if (UNSAFE_PATH.test(path)) {
			report("unsafe-path", `${path}: contains a character the import refuses`);
		}
	}
	if (paths.length > MAX_TREE_ENTRIES) {
		report(
			"repo-size",
			`${paths.length} files exceed ${MAX_TREE_ENTRIES} tree entries`,
		);
	}
}

function readLines(path: string): string[] {
	try {
		return readFileSync(path, "utf8")
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter((line) => line && !line.startsWith("#"));
	} catch {
		return [];
	}
}

function customerPattern(term: string): RegExp {
	const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu");
}

// Checks everything that would become public, not only the skills. Only anchored
// paths are supported, so that this check and rsync read the file the same way.
function validatePublicFiles(
	root: string,
	paths: string[],
	report: Report,
): void {
	const lines = readLines(join(root, PUBLISH_IGNORE));
	for (const line of lines) {
		if (!line.startsWith("/") || /[*?[\]!]/.test(line)) {
			report("publish-ignore", `${line}: use an exact path starting with /`);
		}
	}
	const ignored = lines.map((line) => line.slice(1));
	const isScanned = (path: string) =>
		!GENERATED.has(path) &&
		!lstatSync(join(root, path)).isSymbolicLink() &&
		!ignored.some((entry) =>
			`${path}/`.startsWith(entry.endsWith("/") ? entry : `${entry}/`),
		);
	const terms = readLines(join(root, CUSTOMER_TERMS)).map(customerPattern);
	for (const path of paths.filter(isScanned)) {
		const text = decode(readFileSync(join(root, path)));
		if (text === null) continue;
		if (terms.some((pattern) => pattern.test(text))) {
			report("customer-detail", `${path}: contains a customer detail`);
		}
		if (RULES_EXEMPT.test(path)) continue;
		if (INTERNAL_REFERENCES.some((pattern) => pattern.test(text))) {
			report("internal-reference", `${path}: contains an internal reference`);
		}
		// Files in skills/ get this check per skill, with the skill named.
		if (!path.startsWith("skills/")) checkText(text, path, report);
	}
}

export function validateRepo(root: string): ValidationResult {
	const issues: Issue[] = [];
	const report = reporter(issues, null);
	const paths = listFiles(root, root);
	validateRepoPaths(paths, report);
	validatePublicFiles(root, paths, report);
	let bytes = validateManifest(root, report);
	let fileCount = 1;

	const rootEntries = new Set(readdirSync(root));
	for (const entry of FORBIDDEN_ROOT_ENTRIES) {
		if (rootEntries.has(entry)) {
			report(
				"root-entry",
				`${entry} in the root changes what the import installs`,
			);
		}
	}

	const skillEntries = rootEntries.has("skills")
		? readdirSync(join(root, "skills"), { withFileTypes: true })
		: [];
	for (const entry of skillEntries) {
		if (entry.isSymbolicLink()) {
			reporter(issues, entry.name)(
				"companion",
				"symbolic links are refused by the import",
			);
		}
	}
	const folders = skillEntries
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name);
	if (folders.length > MAX_SKILLS) {
		report(
			"too-many-skills",
			`${folders.length} skills, the bot only sees the first ${MAX_SKILLS}`,
		);
	}

	const skills: CatalogSkill[] = [];
	for (const folder of folders) {
		const result = validateSkill(root, folder, issues);
		bytes += result.bytes;
		fileCount += result.fileCount;
		if (result.catalog) skills.push(result.catalog);
	}
	if (bytes > MAX_REPO_BYTES || fileCount > MAX_REPO_FILES) {
		report(
			"repo-size",
			`${fileCount} files with ${bytes} bytes exceed the import limits`,
		);
	}

	skills.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
	return { issues, skills };
}

export function renderCatalog(skills: CatalogSkill[]): string {
	return `${JSON.stringify({ skills }, null, 2)}\n`;
}

const README_CATALOG =
	/(<!-- catalog:start -->\n)[\s\S]*?(<!-- catalog:end -->)/;

function renderReadmeTable(skills: CatalogSkill[]): string {
	const rows = skills.map((skill) => {
		const servers = skill.requiredMcpServers.join(", ") || "-";
		const link = `[\`${skill.name}\`](${skill.path}/SKILL.md)`;
		const description = skill.description.replaceAll("|", "\\|");
		return `| ${link} | ${skill.category} | ${skill.approval} | ${servers} | ${description} |`;
	});
	return [
		"| Skill | Kategorie | Freigabe | MCP-Server | Beschreibung |",
		"| --- | --- | --- | --- | --- |",
		...rows,
		"",
	].join("\n");
}

export function renderReadme(readme: string, skills: CatalogSkill[]): string {
	if (!README_CATALOG.test(readme)) {
		throw new Error("README.md lacks the catalog markers");
	}
	return readme.replace(
		README_CATALOG,
		(_match, start: string, end: string) =>
			`${start}${renderReadmeTable(skills)}${end}`,
	);
}

export function writeCatalog(root: string, skills: CatalogSkill[]): void {
	writeFileSync(join(root, "catalog.json"), renderCatalog(skills));
	const readme = join(root, "README.md");
	writeFileSync(readme, renderReadme(readFileSync(readme, "utf8"), skills));
}
