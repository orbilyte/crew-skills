import {
	cpSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	type IssueCode,
	parseFrontmatter,
	renderCatalog,
	renderReadme,
	validateRepo,
	writeCatalog,
} from "./validate.ts";

const FIXTURES = join(import.meta.dirname, "fixtures");
const VALID = join(FIXTURES, "valid");
const REPO_ROOT = join(import.meta.dirname, "..", "..");

const temporary: string[] = [];
function copyOfValid(): string {
	const dir = mkdtempSync(join(tmpdir(), "crew-skills-"));
	temporary.push(dir);
	cpSync(VALID, dir, { recursive: true });
	return dir;
}
function validSkillPath(root: string, file = ""): string {
	return join(root, "skills", "gueltiger-skill", file);
}
function codes(root: string): IssueCode[] {
	return validateRepo(root).issues.map((issue) => issue.code);
}

afterEach(() => {
	for (const dir of temporary.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

describe("valid repository", () => {
	it("reports no issues and accepts companions, umlauts and unknown fields", () => {
		const { issues, skills } = validateRepo(VALID);
		expect(issues).toEqual([]);
		expect(skills).toEqual([
			{
				name: "gueltiger-skill",
				description:
					'Greift bei Testfällen, etwa bei "prüf den Validator" oder "zeig ein Beispiel".',
				category: "allgemein",
				requiredMcpServers: ["dach-mcp", "knowledge-mcp"],
				approval: "keine",
				path: "skills/gueltiger-skill",
			},
		]);
	});
});

describe("invalid skills", () => {
	const { issues } = validateRepo(join(FIXTURES, "invalid"));
	const codesOf = (skill: string) =>
		issues.filter((issue) => issue.skill === skill).map((issue) => issue.code);

	it.each<[string, IssueCode]>([
		["name-weicht-ab", "name"],
		["NameGross", "name"],
		["rakazo", "name"],
		["geviertstrich", "forbidden-character"],
		["halbgeviertstrich", "forbidden-character"],
		["schreibweise", "spelling"],
		["fremde-email", "email"],
		["schluessel", "secret"],
		["fehlende-datei", "missing-reference"],
		["code-verweis-fehlt", "missing-reference"],
		["binaerdatei", "companion"],
		["ohne-mcp-abschnitt", "section"],
		["ohne-skill-md", "missing-skill-md"],
		["kleingeschrieben", "missing-skill-md"],
		["abschnitt-fehlt", "section"],
		["ohne-frontmatter", "frontmatter"],
		["mehrzeilig", "frontmatter"],
		["block-skalar", "frontmatter"],
		["kommentar", "frontmatter"],
		["umlaut-schluessel", "frontmatter"],
		["beschreibung-kurz", "description"],
		["ohne-metadaten", "metadata"],
		["unbekannter-server", "metadata"],
		["werkzeug-ohne-server", "metadata"],
		["beispiel-nicht-fiktiv", "example"],
	])("%s is rejected with %s", (skill, code) => {
		expect(codesOf(skill)).toContain(code);
	});

	it("has an expectation for every invalid fixture", () => {
		const covered = new Set(issues.map((issue) => issue.skill));
		expect(covered.size).toBe(25);
	});
});

describe("repository rules", () => {
	it("requires plugin.json", () => {
		const root = copyOfValid();
		rmSync(join(root, "plugin.json"));
		expect(codes(root)).toEqual(["manifest"]);
	});

	it.each([
		["unknown schema", '{"$schema":"https://example.com/x","name":"a"}'],
		[
			"invalid name",
			'{"$schema":"https://agent-plugins.org/schemas/1.1.0/plugin.schema.json","name":"A--b"}',
		],
		["broken JSON", "{"],
		["JSON null", "null"],
		[
			"a text as author",
			'{"$schema":"https://agent-plugins.org/schemas/1.1.0/plugin.schema.json","name":"a","author":"b"}',
		],
		[
			"an unknown author field",
			'{"$schema":"https://agent-plugins.org/schemas/1.1.0/plugin.schema.json","name":"a","author":{"x":"b"}}',
		],
		[
			"a numeric version",
			'{"$schema":"https://agent-plugins.org/schemas/1.1.0/plugin.schema.json","name":"a","version":1}',
		],
	])("rejects a manifest with %s", (_label, manifest) => {
		const root = copyOfValid();
		writeFileSync(join(root, "plugin.json"), manifest);
		expect(codes(root)).toEqual(["manifest"]);
	});

	it("rejects root entries that the import would treat as components", () => {
		const root = copyOfValid();
		mkdirSync(join(root, "agents"));
		expect(codes(root)).toEqual(["root-entry"]);
	});

	it("rejects more skills than the bot sees", () => {
		const root = copyOfValid();
		for (let i = 0; i < 48; i++) {
			const name = `skill-${i}`;
			cpSync(validSkillPath(root), join(root, "skills", name), {
				recursive: true,
			});
			const file = join(root, "skills", name, "SKILL.md");
			writeFileSync(
				file,
				readFileSync(file, "utf8").replace(
					"name: gueltiger-skill",
					`name: ${name}`,
				),
			);
		}
		expect(codes(root)).toEqual(["too-many-skills"]);
	});

	it("rejects an oversized SKILL.md", () => {
		const root = copyOfValid();
		const file = validSkillPath(root, "SKILL.md");
		writeFileSync(file, readFileSync(file, "utf8") + "x".repeat(100_001));
		expect(codes(root)).toEqual(["size"]);
	});

	it("rejects companions above the total limit", () => {
		const root = copyOfValid();
		for (let i = 0; i < 5; i++) {
			writeFileSync(validSkillPath(root, `teil-${i}.txt`), "x".repeat(90_000));
		}
		expect(codes(root)).toEqual(["size"]);
	});

	it("rejects too many companions", () => {
		const root = copyOfValid();
		for (let i = 0; i < 40; i++) {
			writeFileSync(validSkillPath(root, `teil-${i}.txt`), "x");
		}
		expect(codes(root)).toEqual(["companion"]);
	});

	it("rejects symbolic links", () => {
		const root = copyOfValid();
		symlinkSync("daten.csv", validSkillPath(root, "link.csv"));
		expect(codes(root)).toEqual(["companion"]);
	});

	it("rejects a symbolic link as skill folder", () => {
		const root = copyOfValid();
		symlinkSync("gueltiger-skill", join(root, "skills", "verweis"));
		expect(codes(root)).toEqual(["companion"]);
	});

	it("rejects invalid UTF-8", () => {
		const root = copyOfValid();
		writeFileSync(validSkillPath(root, "alt.txt"), Buffer.from([0xe4, 0x20]));
		expect(codes(root)).toEqual(["encoding"]);
	});

	it("ignores .DS_Store, which git never tracks", () => {
		const root = copyOfValid();
		writeFileSync(validSkillPath(root, ".DS_Store"), Buffer.from([0xff]));
		expect(codes(root)).toEqual([]);
	});

	it("handles long text without separators in linear time", () => {
		const root = copyOfValid();
		writeFileSync(validSkillPath(root, "lang.txt"), "x".repeat(99_000));
		const start = Date.now();
		expect(codes(root)).toEqual([]);
		// A quadratic regex needs minutes here, so this bound does not flake.
		expect(Date.now() - start).toBeLessThan(20_000);
	});

	it("rejects a path the import considers unsafe", () => {
		const root = copyOfValid();
		writeFileSync(validSkillPath(root, "50%.txt"), "x");
		expect(codes(root)).toEqual(["unsafe-path"]);
	});

	it("rejects an unsafe path outside the skills folder", () => {
		const root = copyOfValid();
		mkdirSync(join(root, "docs"));
		writeFileSync(join(root, "docs", "50%-rabatt.md"), "x");
		expect(codes(root)).toEqual(["unsafe-path"]);
	});

	it("reports a dangling SKILL.md link instead of crashing", () => {
		const root = copyOfValid();
		rmSync(validSkillPath(root, "SKILL.md"));
		symlinkSync("fehlt.md", validSkillPath(root, "SKILL.md"));
		expect(codes(root)).toEqual(["companion"]);
	});
});

describe("catalog", () => {
	it("is sorted and byte-identical across runs", () => {
		const root = copyOfValid();
		cpSync(validSkillPath(root), join(root, "skills", "a-skill"), {
			recursive: true,
		});
		const file = join(root, "skills", "a-skill", "SKILL.md");
		writeFileSync(
			file,
			readFileSync(file, "utf8").replace(
				"name: gueltiger-skill",
				"name: a-skill",
			),
		);
		const { skills, issues } = validateRepo(root);
		expect(issues).toEqual([]);
		expect(skills.map((skill) => skill.name)).toEqual([
			"a-skill",
			"gueltiger-skill",
		]);
		writeFileSync(
			join(root, "README.md"),
			"<!-- catalog:start -->\n<!-- catalog:end -->\n",
		);
		writeCatalog(root, skills);
		const first = readFileSync(join(root, "catalog.json"), "utf8");
		writeCatalog(root, validateRepo(root).skills);
		expect(readFileSync(join(root, "catalog.json"), "utf8")).toBe(first);
		expect(first.endsWith("}\n")).toBe(true);
	});

	it("matches the checked-in catalog and README of this repository", () => {
		const { issues, skills } = validateRepo(REPO_ROOT);
		expect(issues).toEqual([]);
		expect(readFileSync(join(REPO_ROOT, "catalog.json"), "utf8")).toBe(
			renderCatalog(skills),
		);
		const readme = readFileSync(join(REPO_ROOT, "README.md"), "utf8");
		expect(renderReadme(readme, skills)).toBe(readme);
		expect(skills.length).toBeGreaterThan(0);
		for (const skill of skills) expect(readme).toContain(`\`${skill.name}\``);
	});

	it("fails clearly when the README markers are missing", () => {
		expect(() => renderReadme("# Titel", [])).toThrow("catalog markers");
	});
});

describe("publication rules", () => {
	const readme = (root: string) => join(root, "README.md");

	it.each([
		"siehe ../intern/auftrag",
		"/Users/jemand/projekt",
		"Entscheidung E14",
		"local_12345678-abcd",
	])("rejects the internal reference %s", (text) => {
		const root = copyOfValid();
		writeFileSync(readme(root), text);
		expect(codes(root)).toEqual(["internal-reference"]);
	});

	it("skips local files that git never tracks", () => {
		const root = copyOfValid();
		writeFileSync(
			join(root, ".env.local"),
			"api_key=abcdefghijklmnopqrstuvwxyz",
		);
		expect(codes(root)).toEqual([]);
	});

	it("does not mistake hash fragments for internal numbers", () => {
		const root = copyOfValid();
		writeFileSync(readme(root), "sha512-abc+E8/def");
		expect(codes(root)).toEqual([]);
	});

	it("checks public files outside the skills for secrets and dashes", () => {
		const root = copyOfValid();
		writeFileSync(readme(root), "Titel \u2014 ghp_abcdefghijklmnopqrstuvwxyz");
		expect(codes(root)).toEqual(
			expect.arrayContaining(["forbidden-character", "secret"]),
		);
	});

	it.each(["AGENTS.md", "/*.md"])("rejects the ignore line %s", (line) => {
		const root = copyOfValid();
		writeFileSync(join(root, ".publishignore"), `${line}\n`);
		expect(codes(root)).toContain("publish-ignore");
	});

	it("does not scan files listed in .publishignore", () => {
		const root = copyOfValid();
		mkdirSync(join(root, "intern"));
		writeFileSync(join(root, "intern", "notiz.md"), "../crew");
		writeFileSync(join(root, "AGENTS.md"), "../crew");
		writeFileSync(
			join(root, ".publishignore"),
			"# intern\n/AGENTS.md\n/intern\n",
		);
		expect(codes(root)).toEqual([]);
	});

	it("rejects customer terms as whole words, ignoring case", () => {
		const root = copyOfValid();
		mkdirSync(join(root, "tools", "validate"), { recursive: true });
		writeFileSync(
			join(root, "tools", "validate", "forbidden-terms.txt"),
			"# Begriffe\nMusterkunde\n",
		);
		writeFileSync(
			join(root, ".publishignore"),
			"/tools/validate/forbidden-terms.txt\n",
		);
		writeFileSync(readme(root), "Das sind Musterkundenlisten.");
		expect(codes(root)).toEqual([]);
		writeFileSync(readme(root), "Für MUSTERKUNDE gebaut.");
		expect(codes(root)).toEqual(["customer-detail"]);
	});
});

describe("parseFrontmatter", () => {
	it.each([
		["an unquoted colon", "name: a\ndescription: Hinweis: intern"],
		["a partly quoted value", 'name: a\ndescription: "a" und "b"'],
		["a colon in metadata", "name: a\nmetadata:\n  kategorie: a: b"],
	])("rejects %s", (_label, frontmatter) => {
		expect(parseFrontmatter(`---\n${frontmatter}\n---\n`)).toHaveProperty(
			"error",
		);
	});

	it("accepts a quoted value with a colon", () => {
		const parsed = parseFrontmatter(
			'---\nname: a\ndescription: "Hinweis: intern"\n---\n',
		);
		expect(parsed).toHaveProperty(
			"value.fields",
			new Map([
				["name", "a"],
				["description", "Hinweis: intern"],
			]),
		);
	});

	it("removes matching quotes and reads the metadata map", () => {
		const parsed = parseFrontmatter(
			'---\nname: "a"\ndescription: b\nmetadata:\n  kategorie: gastro\n---\nText',
		);
		expect(parsed).toEqual({
			value: {
				fields: new Map([
					["name", "a"],
					["description", "b"],
				]),
				metadata: new Map([["kategorie", "gastro"]]),
			},
			body: "Text",
		});
	});
});
