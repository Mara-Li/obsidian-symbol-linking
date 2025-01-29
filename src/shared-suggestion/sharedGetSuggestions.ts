import fuzzysort from "fuzzysort";
import { type App, TFile, normalizePath } from "obsidian";
import type { FileOption } from "src/types";
import type { CustomSuggester } from "../settings/interface";
import { isAllowedExtension } from "../utils/path";
import { removeAccents } from "../utils/valid-file-name";

export function sharedGetSuggestions(
	files: TFile[],
	query: string,
	settings: CustomSuggester,
	app: App,
	typedChar: string,
	originalQuery: string,
): Fuzzysort.KeysResult<FileOption>[] {
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
					isAllowedExtension(file, folder.extensions ?? [])
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
		if (meta?.frontmatter?.alias) {
			options.push({
				fileName,
				filePath: file.path,
				alias: settings.removeAccents
					? removeAccents(meta.frontmatter.alias)
					: meta.frontmatter.alias,
				originalAlias: settings.removeAccents ? meta.frontmatter.alias : undefined,
			});
		} else if (meta?.frontmatter?.aliases) {
			let aliases = meta.frontmatter.aliases;
			if (typeof meta.frontmatter.aliases === "string") {
				aliases = meta.frontmatter.aliases.split(",").map((s) => s.trim());
			}
			for (const alias of aliases) {
				options.push({
					fileName,
					filePath: file.path,
					alias: settings.removeAccents ? removeAccents(alias) : alias,
					originalAlias: settings.removeAccents ? alias : undefined,
				});
			}
		}
		// Include fileName without alias as well
		options.push({
			fileName,
			filePath: file.path,
		});
	}

	// Show all files when no query
	let results = [];
	if (!query) {
		results = options
			.map((option) => ({
				obj: option,
			}))
			// Reverse because filesystem is sorted alphabetically
			.reverse();
	} else {
		// Fuzzy search files based on query
		results = fuzzysort.go(query, options, {
			keys: ["alias", "fileName"],
		}) as any;
	}

	// If showAddNewNote option is enabled, show it as the last option
	if (settings.showAddNewNote && query) {
		// Don't show if it has the same filename as an existing note
		const hasExistingNote = results.some(
			(result: Fuzzysort.KeysResult<FileOption>) =>
				result?.obj?.fileName.toLocaleLowerCase() === query?.toLocaleLowerCase(),
		);
		if (!hasExistingNote) {
			results = results.filter(
				(result: Fuzzysort.KeysResult<FileOption>) => !result.obj?.isCreateNewOption,
			);
			for (const folder of newNoteDirectories) {
				results.push({
					obj: {
						isCreateNewOption: true,
						query,
						fileName: originalQuery,
						filePath: normalizePath(`${folder}/${originalQuery.trim()}.md`),
					},
				});
			}
		}
	}

	return results;
}

export function sharedGetMonoFileSuggestion(
	query: string,
	settings: CustomSuggester,
	app: App,
	typedChar: string,
	originalQuery: string,
): Fuzzysort.KeysResult<FileOption>[] {
	if (settings.limitToFile.length === 0) return [];
	const files = settings.limitToFile
		.filter((x) => x.triggerSymbol == typedChar)
		.map((path) => {
			const file = app.vault.getAbstractFileByPath(path.path);
			if (file && file instanceof TFile) return file;
			return null;
		})
		.filter((file) => file !== null);
	if (files.length === 0) return [];
	const options: FileOption[] = [];
	for (const file of files) {
		const meta = app.metadataCache.getFileCache(file);
		if (!meta || !meta.headings) {
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

		const heading =
			settings.headerLevelForContact === 0
				? meta.headings
				: meta.headings.filter(
						(heading) => heading.level === settings.headerLevelForContact,
					);
		const option: FileOption[] = heading.map((heading) => ({
			fileName: heading.heading,
			filePath: file.path,
			originalAlias: heading.heading,
			alias: settings.removeAccents ? removeAccents(heading.heading) : heading.heading,
		}));
		options.push(...option);
	}
	if (options.length === 0) return [];

	let results = [];
	if (!query) {
		results = options.map((option) => ({
			obj: option,
		}));
	} else {
		results = fuzzysort.go(query, options, {
			keys: ["fileName"],
		}) as any;
	}
	if (settings.appendAsHeader && query) {
		const hasExistingHeader = results.some(
			(result: Fuzzysort.KeysResult<FileOption>) =>
				result?.obj?.fileName.toLocaleLowerCase() === query?.toLocaleLowerCase(),
		);
		if (!hasExistingHeader) {
			results = results.filter(
				(result: Fuzzysort.KeysResult<FileOption>) => !result.obj?.isCreateNewOption,
			);
			for (const file of files) {
				results.push({
					obj: {
						isCreateNewOption: true,
						query,
						fileName: originalQuery,
						filePath: file.path,
						alias: query,
						originalAlias: originalQuery,
					},
				});
			}
		}
	}
	return results;
}
