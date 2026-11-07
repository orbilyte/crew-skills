# Wie Rakazo Skills importiert und lädt

Belegt am Quellcode von Rakazo, Basis Release v0.7.0. Alle Pfade relativ zum Rakazo-Repository. Der Quellcode wurde gelesen. Geprüft wurde außerdem, dass der echte Parser und die echte Plugin-Vorschau dieses Repository annehmen (siehe "Geprüft"). Spätere Rakazo-Versionen können abweichen.

## Kurzfassung

- "From GitHub" installiert ein **Plugin**. Ohne `plugin.json` im Stammordner schlägt der Import fehl.
- Skills liegen genau unter `skills/<ordner>/SKILL.md`. Beim Import kommen immer alle Skills des Repos zusammen.
- Pflichtfelder sind `name` und `description`. Unbekannte Felder bleiben erhalten.
- Der Bot sieht höchstens 48 eigene Skills, alphabetisch sortiert.
- Ohne GitHub geht nur der Weg über `agentSkills.create` oder das Eingabefeld "New skill", beides ohne Zusatzdateien.

## Weg in der Oberfläche

1. Kontomenü, **Skills** (`docs/skills.md:13`, `apps/web/src/pages/Shell.tsx:826`).
2. **From GitHub** (`apps/web/src/components/integrations/skills-dialog.tsx:251`).
3. Feld **Plugin GitHub URL** ausfüllen (`skills-dialog.tsx:128`), Platzhalter `https://github.com/owner/plugin` (`skills-dialog.tsx:134`).
4. **Preview** (`skills-dialog.tsx:140`), dann **Add** (`apps/web/src/components/integrations/plugin-marketplace.tsx:394`).

Dienste dahinter: `capabilities.pluginPreview` (`apps/api/src/routes/mcp.ts:321`), `capabilities.install` (`apps/api/src/routes/mcp.ts:184`), `installPlugin` (`apps/api/src/plugin-installs.ts:262`).

## Quelle und Abruf

Alle Fundstellen in diesem Abschnitt und in den beiden folgenden, sofern nichts anderes dasteht: `packages/adapters/src/plugin-connectors.ts`.

| Punkt | Festlegung | Beleg |
| --- | --- | --- |
| Form der Quelle | `https://github.com/owner/repo`, optional `@ref`, `#unterordner`, `/tree/<ref>/<unterordner>`. Kein `owner/repo` | `:133` |
| Nur HTTPS, ohne Port, Query oder Zugangsdaten | | `:142`, `:144` |
| Nur öffentliches github.com, kein Token | "Only public github.com plugin sources" | `:200` |
| Abruf | Commit und Tree über die GitHub-API, Dateien von raw.githubusercontent.com | `:206`, `:219`, `:265` |
| Stand | Standard ist `HEAD`. Festgehalten wird der aufgelöste Commit (`version`) | `apps/api/src/plugin-installs.ts:320` |
| Aktualisieren | Kein Abgleich. Erneuter Import derselben Quelle ist abgelehnt, also entfernen und neu installieren | `apps/api/src/plugin-installs.ts:308` |
| Fehlermeldung | Jeder Fehler erscheint gleich als "Could not preview a supported plugin", die Ursache bleibt verborgen | `apps/api/src/routes/mcp.ts:344` |

## Pfade und Manifest

| Punkt | Festlegung | Beleg |
| --- | --- | --- |
| Manifest | `plugin.json`, ohne Manifest "No plugin manifest found" | `:72`, `:520` |
| `$schema` | genau Version 1.0.0 oder 1.1.0 von agent-plugins.org | `:68`, `:530` |
| Manifest-`name` | 1 bis 64 Zeichen, klein, keine `--` oder `..` | `:91` |
| Weitere Felder | `version`, `description`, `license` optional. `author` nur als Objekt | `:98`, `docs/build-a-plugin.md:54` |
| Skill-Pfad | nur `skills/<ordner>/SKILL.md`, eine Ebene, Groß- und Kleinschreibung zählt | `:303` |
| Auswahl | Alle gültigen Skills kommen zusammen, ungültige werden übersprungen | `:307` |
| Doppelter Name | bricht das ganze Plugin ab | `:310` |
| Stammordner | `README.md`, `LICENSE`, `catalog.json`, `tools/` werden nur aufgelistet, nicht geladen | `:247`, `:605` |
| Stören würde | `agents/` und `commands/` werden zu Skills, `mcp.json` zu Connector, `rules/`, `hooks/`, `automations/` als nicht unterstützt gemeldet | `:74`, `:76`, `:89` |
| Pfadzeichen | `%`, `#`, `?` oder `\` in einem ausgewählten Pfad lassen den Import scheitern, auch außerhalb von `skills/` | `:116`, `:233` |

## Grenzen

| Grenze | Wert | Folge bei Überschreitung | Beleg |
| --- | --- | --- | --- |
| Einzelne Datei | 100.000 Byte | `SKILL.md`: ganzes Plugin scheitert. Zusatzdatei: nur dieser Skill | `:66`, `:251`, `:256` |
| Zusatzdateien je Skill | 40 Stück | Skill wird abgelehnt | `:80`, `:287` |
| Zusatzdateien je Skill | 400.000 Byte | Skill wird abgelehnt | `:87`, `:291` |
| Geladene Dateien im Plugin | 200 Stück | Plugin scheitert | `:62`, `:257` |
| Geladene Inhalte im Plugin | 4.000.000 Byte | Plugin scheitert | `:65`, `:515` |
| Einträge im Tree | 5000 | Plugin scheitert | `:63` |
| Dateitypen neben `SKILL.md` | `md`, `mdx`, `txt`, `json`, `yaml`, `yml`, `csv` | Skill wird abgelehnt, auch bei `LICENSE` ohne Endung | `:79`, `:285` |
| Symlinks und Submodule | nicht erlaubt | Skill wird abgelehnt | `:234`, `:288` |

Zusatzdateien landen in der Datenbank (`agent_skills.files`, `packages/db/prisma/schema.prisma:1303`) und werden zur Laufzeit mit `skill_read {name, file}` gelesen (`packages/adapters/src/skill-tools.ts:152`). Sie liegen nicht als Dateien auf dem Bot-Rechner.

## Format von SKILL.md

Parser: `parseSkillMd` in `packages/core/src/agent-skill.ts`, eine eigene YAML-Teilmenge ohne Bibliothek.

| Punkt | Festlegung | Beleg |
| --- | --- | --- |
| Pflichtfelder | `name`, `description`, nicht leer | `:83`, `:84` |
| Längen | `name` bis 80, `description` bis 2000 Zeichen | `:85`, `:86` |
| Name | Keine Zeichenprüfung und kein Abgleich mit dem Ordner durch Rakazo | `:81` bis `:89` |
| Unbekannte Felder | bleiben erhalten | `:16` |
| BOM und CRLF | erlaubt, die Datei muss mit `---` beginnen | `:7`, `:66` |
| Inhalt | Text darf leer sein, wird nicht geprüft | `:72` |
| Schlüssel | nur ASCII, `größe:` ist ein Fehler. Werte dürfen Umlaute enthalten | `:435` |
| Mehrzeilige Werte | nur mit `>` oder `\|`, sonst Fehler | `:432` |
| Listen und Maps | eingerückt, Maps nur eine Ebene tief | `:417`, `:458` |
| Kommentar am Zeilenende | bleibt Teil des Werts | `:494` |

Eingebaute Skills `Interrogate` und `Rakazo` sind reserviert, auch unabhängig von der Schreibweise (`packages/adapters/src/builtin-skills.ts:47`, `:62`, `packages/adapters/src/plugin-connectors.ts:565`).

## Was daraus für dieses Repo folgt

| Punkt | Festlegung | Grund |
| --- | --- | --- |
| Manifest | `plugin.json` im Stammordner, Name `crew-skills` | Pflicht für den Import |
| Name | ASCII, kebab-case, höchstens 64 Zeichen, gleich dem Ordnernamen | enger als Rakazo |
| Beschreibung | 40 bis 500 Zeichen | Rakazo kürzt sie nicht, und sie steht in jedem Lauf im Systemprompt |
| Frontmatter | nur einzeilige Werte und eine `metadata`-Map | so hängt kein Skill von Eigenheiten des Parsers ab |
| Katalogfelder | im Frontmatter unter `metadata` (`kategorie`, `mcp-server`, `freigabe`), keine `meta.json` | Rakazo toleriert unbekannte Felder, `metadata` ist im Agent-Skills-Format vorgesehen |
| `mcp-server` | kommagetrennter Text, keine Liste | `metadata` sieht im Agent-Skills-Format nur Text vor |
| Anzahl | höchstens 48 Skills | siehe nächster Abschnitt |

## Laden zur Laufzeit

- Skills kommen je Lauf aus der Datenbank (`packages/adapters/src/executor.ts:636`).
- In den Systemprompt kommt je Skill eine Zeile `- name: description` (`packages/core/src/agent-skill.ts:121`).
- **Harte Grenze:** `entries.slice(0, 50)` (`packages/core/src/agent-skill.ts:127`). Zuerst stehen die zwei eingebauten Skills, dann die eigenen, nach Name sortiert (`packages/adapters/src/skill-tools.ts:109`). Es bleiben also 48 sichtbare eigene Skills, auch über mehrere Plugins hinweg.
- Der Bot lädt einen Skill mit `skill_read`. Nutzer erzwingen ihn mit `/Name`, Routinen mit `@Name` (`packages/core/src/agent-skill.ts:131`, `:132`).
- **Geltungsbereich:** Ein Plugin gilt je Nutzer und zunächst für alle Spaces (`apps/api/src/plugin-installs.ts:316`), nicht je Bot. Namen müssen je Nutzer eindeutig sein, ohne Beachtung der Schreibweise (`apps/api/src/availability.ts:49`, `apps/api/src/plugin-installs.ts:122`).
- **Einschränkungen:** Chat-Läufe, die nicht vom Besitzer stammen, erhalten nur die eingebauten Skills (`packages/adapters/src/executor.ts:1565`). Läufe über Messaging-Kanäle verlieren die Skill-Werkzeuge (`packages/adapters/src/run-tool-selection.ts:144`).

## Ohne GitHub

| Weg | Möglich | Einschränkung | Beleg |
| --- | --- | --- | --- |
| Oberfläche "New skill" (SKILL.md einfügen) | ja | keine Zusatzdateien | `apps/web/src/pages/KnowledgeSection.tsx:332` |
| RPC `agentSkills.create` | ja, per Skript | keine Zusatzdateien, Herkunft `user`, Frontmatter wird neu geschrieben | `packages/contracts/src/rpc.ts:990`, `apps/api/src/agent-skills.ts:187` |
| Im Chat mit `skill_create` | ja | nur in einem Space | `packages/adapters/src/skill-tools.ts:169` |
| "Import an agent" (Ordner oder Archiv) | teilweise | legt einen neuen Bot an, nur `SKILL.md` | `apps/api/src/agent-import.ts:487`, `packages/contracts/src/rpc.ts:547` |
| `POST /api/account/import` | ja | braucht ein gültiges Konto-Export-Archiv | `apps/api/src/account-import.ts:737` |
| Datenbank direkt | technisch ja | kein Seed vorhanden, Row-Level-Regeln nicht geprüft, nicht empfohlen | `packages/db/prisma/schema.prisma:1294` |
| Lokaler Pfad, `file://`, anderer Git-Host, lokaler Git-Server | nein | Host und Port sind fest geprüft | `packages/adapters/src/plugin-connectors.ts:142`, `:144`, `:200` |
| Dateien auf dem Bot-Rechner | nein | keine Stelle gefunden, die sie aufnimmt | Suche nach `.agents/skills`, `.claude/skills`, `skillsDir` ohne Treffer im Laufzeitcode |
| Umgebungsvariable oder Seed beim Start | nein | eingebaute Skills sind fest im Code | `packages/adapters/src/builtin-skills.ts:47` |
| Andere GitHub-URL per Konfiguration | nein | `pluginRepoFetcher` ist eine Code-Abhängigkeit ohne Env-Variable | `apps/api/src/app.ts:260` |

**Empfehlung ohne öffentliches Repository:** Inhalte per `agentSkills.create` einspielen. Das nutzt den echten Parser und dieselbe Tabelle. Zusatzdateien gehen dabei verloren, die Skills dieses Repositorys haben keine.

Aufruf, in einer eigenen Testinstanz über ein Skript genutzt:

```text
POST <API>/rpc/agentSkills/create
Cookie: <Session> oder Authorization: Bearer <signierter Session-Token>
x-rakazo-space-id: <spaceId> (optional)
Content-Type: application/json

{"json":{"content":"<vollständiger Inhalt von SKILL.md>"}}
```

Pfadpräfix `/rpc`: `apps/api/src/app.ts:1018`. Schema des Aufrufs: `packages/contracts/src/domain.ts:732`.

## Geprüft

Ausgeführt gegen den Quellcode oben, außerhalb des Repositorys, mit dem Stand, der veröffentlicht werden soll:

| Prüfung | Ergebnis |
| --- | --- |
| Jeder Skill einzeln durch `parseSkillMd` aus `packages/core/src/agent-skill.ts` | angenommen, `metadata` bleibt erhalten |
| Jeder Skill einzeln durch `resolveSkillContent` aus `apps/api/src/agent-skills.ts`, das `agentSkills.create` nutzt | angenommen, Name und Beschreibung unverändert |
| Das ganze Repository durch `previewPluginInstall` aus `packages/adapters/src/plugin-connectors.ts`, mit eigenem `fetcher` statt GitHub | alle Skills erkannt, nichts übersprungen |

**Erst nach der Veröffentlichung gegen GitHub testbar:** Abruf über die GitHub-API und raw.githubusercontent.com, Fehlermeldungen des echten Abrufs, Auflösung von `@<tag>` und der festgehaltene Commit, Installieren und erneutes Installieren in einer laufenden Instanz.
