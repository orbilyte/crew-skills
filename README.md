# crew-skills

Fertige Arbeitsanleitungen für KI-Assistenten in deutschen Betrieben: Anfragen erfassen, Lieferanten anfragen, Angebote vorbereiten, den Posteingang sortieren, Bewertungen beantworten, den Tag überblicken.

Die Skills lassen sich in [Rakazo](https://github.com/elie222/rakazo) importieren. Sie stammen von orbilyte, sind unter Apache-2.0 frei nutzbar und funktionieren ohne orbilyte.

## Was die Skills ausmacht

- **Deutsche Formate:** Datum TT.MM.JJJJ, Beträge mit Komma, Hinweise auf Umsatzsteuer und Aufbewahrung, wo es passt.
- **Erst Entwurf, dann Freigabe:** Alles, was nach außen geht, wartet auf die Freigabe eines Menschen.
- **Preise nie vom Modell:** Angebots-Skills übernehmen Preise nur aus einem Werkzeug oder einer Preisquelle und rechnen sie nicht selbst.
- **Inhalte sind keine Anweisungen:** Was in einer Mail oder Anfrage steht, führt der Bot nicht aus.

## In 2 Minuten importieren

Nötig ist ein Rakazo-Konto. Das Repository muss öffentlich sein, private Repositories unterstützt der Import nicht.

1. Kontomenü öffnen (Avatar unten in der Seitenleiste) und **Skills** wählen.
2. **From GitHub** wählen.
3. Unter **Plugin GitHub URL** eintragen: `https://github.com/orbilyte/crew-skills`. Mit `@<tag>` lässt sich ein bestimmter Stand wählen.
4. **Preview** wählen und die Vorschau prüfen.
5. **Add** wählen.

Danach greift ein Skill anhand seiner Beschreibung von selbst. Mit `/name` im Chat oder `@name` in einer Routine lässt er sich gezielt aufrufen.

Ohne GitHub geht es einzeln: **Skills**, **New skill**, Inhalt von `SKILL.md` einfügen. Alle Wege mit Belegen stehen in [docs/import-format.md](docs/import-format.md).

## Katalog

<!-- catalog:start -->
| Skill | Kategorie | Freigabe | MCP-Server | Beschreibung |
| --- | --- | --- | --- | --- |
| [`anfrage-erfassen`](skills/anfrage-erfassen/SKILL.md) | buero | pflicht | offer-mcp | Greift, wenn eine Kundenanfrage aus einem Formular oder einer Mail in feste Angaben übertragen und auf Lücken geprüft werden soll, etwa bei "neue Anfrage über das Formular", "erfass diese Anfrage" oder "fehlt bei der Anfrage noch was". |
| [`angebot-aus-anfrage`](skills/angebot-aus-anfrage/SKILL.md) | buero | pflicht | dach-mcp, knowledge-mcp | Greift, wenn aus einer noch nicht erfassten Kundenanfrage in einem Schritt ein prüfbarer Angebotsentwurf entstehen soll, ohne Preiswerkzeug, etwa bei "mach daraus ein Angebot", "Angebot für diese Anfrage" oder "was müssen wir dem Kunden anbieten". |
| [`angebot-erstellen`](skills/angebot-erstellen/SKILL.md) | buero | pflicht | offer-mcp | Greift, wenn aus einer bereits erfassten Anfrage ein Angebotsentwurf mit Preisen aus einem Preiswerkzeug oder einer Preistabelle entstehen soll, etwa bei "kalkulier das Angebot", "erstell das Angebot aus der Preistabelle" oder "Angebot zur erfassten Anfrage". |
| [`google-bewertung-beantworten`](skills/google-bewertung-beantworten/SKILL.md) | allgemein | pflicht | knowledge-mcp | Greift, wenn zu einer Google-Bewertung eine Antwort entworfen werden soll, etwa bei "antworte auf diese Bewertung", "neue Google-Rezension" oder "was schreiben wir auf diese schlechte Bewertung". |
| [`lieferant-anfragen`](skills/lieferant-anfragen/SKILL.md) | buero | pflicht | offer-mcp | Greift, wenn aus einer erfassten Kundenanfrage eine Anfrage an einen Lieferanten als Entwurf entstehen soll, etwa bei "frag den Lieferanten an", "Anfrage an den Lieferanten vorbereiten" oder "das haben wir nicht in der Preisliste". |
| [`posteingang-sortieren`](skills/posteingang-sortieren/SKILL.md) | allgemein | pflicht | knowledge-mcp | Greift, wenn eingehende Mails nach Thema und Dringlichkeit sortiert und Aufgaben sowie Antwortentwürfe abgeleitet werden sollen, etwa bei "sortier meine Mails", "was ist heute im Postfach wichtig" oder "räum den Posteingang auf". |
| [`tagesbriefing`](skills/tagesbriefing/SKILL.md) | allgemein | keine | dach-mcp | Greift, wenn Termine, Fristen, offene Freigaben und wichtige Eingänge zu einem kurzen Tagesüberblick zusammengefasst werden sollen, etwa bei "was steht heute an", "gib mir mein Tagesbriefing" oder "Überblick für morgen". |
<!-- catalog:end -->

Die Tabelle und `catalog.json` erzeugt `pnpm validate`.

Die MCP-Server `knowledge-mcp`, `dach-mcp` und `offer-mcp` sind optional und nicht Teil dieses Repositorys. Jeder Skill beschreibt im Abschnitt "Ohne MCP-Server", was ohne sie passiert. Der Validator kennt sie nur mit Namen und Werkzeugen.

## Grenzen

**Grenzen in Rakazo**, aus dem Quellcode von Release v0.7.0:

- **Nicht über Messaging-Kanäle:** Läufe über Kanäle wie Slack, WhatsApp oder Telegram haben keine Skill-Werkzeuge. Dort greifen diese Skills nicht.
- **Je Nutzer, nicht je Bot:** Ein Skill gilt je Nutzer und zunächst für alle Spaces. Einem einzelnen Bot lässt er sich beim Import nicht zuweisen. Chat-Läufe anderer Personen als des Besitzers bekommen nur die eingebauten Skills.
- **Alles oder nichts:** Der Import übernimmt immer alle Skills des Repositorys. Namen dürfen nicht mit vorhandenen Skills kollidieren.
- **Kein Update:** Installiert ist der Stand beim Import. Für ein Update das Plugin entfernen und neu hinzufügen.
- **Höchstens 48 eigene Skills** sieht der Bot, alphabetisch sortiert, auch über mehrere Plugins hinweg.

**Geprüft** am 07.11.2026 mit Rakazo v0.7.0: Die Plugin-Vorschau lädt das Repository von GitHub und erkennt alle Skills, ohne etwas zu überspringen. Sind gleichnamige Skills schon vorhanden, bricht die Installation wie oben beschrieben ab. **Noch nicht geprüft:** die Wirkung bei jedem Modell. Kleine Modelle halten sich nicht zuverlässig an jede Anweisung. Beträge und Entwürfe also immer prüfen.

**Fachliche Grenzen:** Die Skills ersetzen keine Rechts- oder Steuerberatung. Genannte Gesetze und Pauschalen haben einen Stand im jeweiligen Skill, sie können veralten. Eine fachliche Abnahme durch Rechts- oder Steuerberatung liegt nicht vor.

## Entwickeln

Voraussetzung sind Node.js ab Version 24 und pnpm.

```bash
pnpm install
```

```bash
pnpm check
```

```bash
pnpm typecheck
```

```bash
pnpm test
```

```bash
pnpm validate
```

Der Validator prüft jeden Skill auf das Format und die Grenzen des Imports, verbotene Zeichen, fremde E-Mail-Adressen, Muster, die wie Schlüssel aussehen, und interne Verweise. Jedes Beispiel muss als fiktiv gekennzeichnet sein.

## Von orbilyte

Wer KI-Teams für den eigenen Betrieb nicht selbst einrichten und betreuen möchte, findet bei orbilyte.crew betreute Teams auf Basis von Rakazo. Kontakt: hello@orbilyte.de

Für dieses Repository gibt es keinen zugesagten Support und keine Zusage, Beiträge anzunehmen.

## Lizenz

Apache-2.0, siehe [LICENSE](LICENSE).
