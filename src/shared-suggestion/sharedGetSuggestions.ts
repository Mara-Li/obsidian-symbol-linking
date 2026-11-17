import fuzzysort from "fuzzysort";
import { type App, type FrontMatterCache, normalizePath, TFile } from "obsidian";
import type { CustomSuggester } from "../settings/interface";
import type { FileOption, FileSuggestion } from "../types";
import { isAllowedExtension } from "../utils/path";
import { removeAccents } from "../utils/valid-file-name";

// fuzzysort v4 defaults to threshold .5 / limit 10; keep v3 behavior (any match, no limit)
const SEARCH_OPTIONS = { threshold: 0, limit: 0 } as const;

/** Aliases from the `alias` or `aliases` frontmatter key, as a string, a comma list or an array. */
function getAliases(frontmatter: FrontMatterCache | undefined): string[] {
	const toStrings = (value: unknown): string[] =>
		Array.isArray(value)
			? value.filter((alias): alias is string => typeof alias === "string")
			: [];
	const alias: unknown = frontmatter?.alias;
	if (alias) return typeof alias === "string" ? [alias] : toStrings(alias);
	const aliases: unknown = frontmatter?.aliases;
	if (typeof aliases === "string") return aliases.split(",").map((s) => s.trim());
	return toStrings(aliases);
}

/** Drop previous "create new" entries; add one per target unless an entry already has the query as name. */
function withCreateNewOptions(
	results: FileSuggestion[],
	query: string,
	createOptions: () => FileOption[],
): FileSuggestion[] {
	const lowerQuery = query.toLocaleLowerCase();
	const hasExisting = results.some(
		(result) => result.obj.fileName.toLocaleLowerCase() === lowerQuery,
	);
	if (hasExisting) return results;
	return [
		...results.filter((result) => !result.obj.isCreateNewOption),
		...createOptions().map((obj) => ({ obj })),
	];
}

export function sharedGetSuggestions(
	files: TFile[],
	query: string,
	settings: CustomSuggester,
	app: App,
	typedChar: string,
	originalQuery: string,
): FileSuggestion[] {
	const options: FileOption[] = [];
	const newNoteDirectory = normalizePath(`${settings.addNewNoteDirectory.trim()}/`);
	const newNoteDirectories: Set<string> = new Set();
	if (settings.addNewNoteDirectory.trim().length > 0)
		newNoteDirectories.add(newNoteDirectory);
	for (const file of files) {
		// If there are folders to limit links to, check if the file is in one of them
		if (settings.limitToDirectories.length > 0) {
			let isAllowed = false;
			for (const folder of settings.limitToDirectories) {
				if (typedChar !== folder.triggerSymbol) continue;
				newNoteDirectories.add(folder.path);
				if (
					file.parent?.path.startsWith(folder.path) &&
					isAllowedExtension(file, folder.extensions ?? ["md"])
				) {
					isAllowed = true;
					break;
				}
			}
			if (!isAllowed) {
				continue;
			}
		}
		const meta = app.metadataCache.getFileCache(file);
		const fileName = settings.removeAccents
			? removeAccents(file.basename)
			: file.basename;
		for (const alias of getAliases(meta?.frontmatter)) {
			options.push({
				fileName,
				filePath: file.path,
				alias: settings.removeAccents ? removeAccents(alias) : alias,
				originalAlias: settings.removeAccents ? alias : undefined,
			});
		}
		// Include fileName without alias as well
		options.push({
			fileName,
			filePath: file.path,
		});
	}

	if (!query) {
		// Show all files when no query. Reverse because filesystem is sorted alphabetically
		return options.map((obj) => ({ obj })).reverse();
	}

	// Fuzzy search files based on query
	const results: FileSuggestion[] = [
		...fuzzysort.go(query, options, { keys: ["alias", "fileName"], ...SEARCH_OPTIONS }),
	];

	// If showAddNewNote option is enabled, show it as the last option
	if (!settings.showAddNewNote) return results;
	return withCreateNewOptions(results, query, () =>
		[...newNoteDirectories].map((folder) => ({
			isCreateNewOption: true,
			query,
			fileName: originalQuery,
			filePath: normalizePath(`${folder}/${originalQuery.trim()}.md`),
		})),
	);
}

export function sharedGetMonoFileSuggestion(
	query: string,
	settings: CustomSuggester,
	app: App,
	typedChar: string,
	originalQuery: string,
): FileSuggestion[] {
	if (settings.limitToFile.length === 0) return [];
	const files = settings.limitToFile
		.filter((x) => x.triggerSymbol === typedChar)
		.map((path) => app.vault.getAbstractFileByPath(path.path))
		.filter((file) => file instanceof TFile);
	if (files.length === 0) return [];
	const options: FileOption[] = [];
	for (const file of files) {
		const meta = app.metadataCache.getFileCache(file);
		if (!meta?.headings) {
			options.push({
				isCreateNewOption: true,
				query,
				fileName: originalQuery,
				filePath: file.path,
				alias: query,
				originalAlias: originalQuery,
			});
			continue;
		}

		const headings =
			settings.headerLevelForContact === 0
				? meta.headings
				: meta.headings.filter(
						(heading) => heading.level === settings.headerLevelForContact,
					);
		for (const heading of headings) {
			options.push({
				fileName: heading.heading,
				filePath: file.path,
				originalAlias: heading.heading,
				alias: settings.removeAccents ? removeAccents(heading.heading) : heading.heading,
			});
		}
	}
	if (options.length === 0) return [];

	if (!query) return options.map((obj) => ({ obj }));

	const results: FileSuggestion[] = [
		...fuzzysort.go(query, options, { keys: ["fileName"], ...SEARCH_OPTIONS }),
	];
	if (!settings.appendAsHeader) return results;
	return withCreateNewOptions(results, query, () =>
		files.map((file) => ({
			isCreateNewOption: true,
			query,
			fileName: originalQuery,
			filePath: file.path,
			alias: query,
			originalAlias: originalQuery,
		})),
	);
}
