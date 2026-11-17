import { type App, Notice, TFile } from "obsidian";
import type { CustomSuggester } from "../settings/interface";
import type { FileSuggestion } from "../types";
import { fileNameNoExtension } from "../utils/path";
import { replaceNewFileVars } from "../utils/replace-new-file-vars";

export async function sharedSelectSuggestion(
	app: App,
	settings: CustomSuggester,
	typedChar: string,
	originalQuery: string,
	value: FileSuggestion,
): Promise<string> {
	const option = value.obj;
	// When user selects "Create new note" option, create the note to link to
	let linkFile: TFile | null = null;
	if (option.isCreateNewOption) {
		if (settings.limitToFile.length > 0) {
			const file = app.vault.getAbstractFileByPath(option.filePath);
			if (!(file instanceof TFile)) {
				new Notice(
					`Unable to get the file at path: ${option.filePath}. Please open an issue on GitHub, as this should not happen.`,
					0,
				);
				throw new Error("File not found");
			}
			//edit the file and add a new header
			const headerLevel = "#".repeat(
				settings.headerLevelForContact <= 1 ? 1 : settings.headerLevelForContact,
			);
			const newContent = `${headerLevel} ${originalQuery}\n`;
			await app.vault.process(file, (content) => {
				if (content.endsWith("\n")) {
					return `${content}${newContent}`;
				}
				return `${content}\n${newContent}`;
			});
		} else {
			let newNoteContents = "";
			if (settings.addNewNoteTemplateFile) {
				const fileTemplate = app.vault.getAbstractFileByPath(
					`${settings.addNewNoteTemplateFile}.md`,
				);
				if (!(fileTemplate instanceof TFile)) {
					new Notice(
						`Unable to get the file at path: ${settings.addNewNoteTemplateFile}. Verify the path in the settings.`,
					);
					throw new Error("Template file not found");
				}
				newNoteContents = await app.vault.read(fileTemplate);
				// Use core template settings to replace variables: {{title}}, {{date}}, {{time}}
				newNoteContents = await replaceNewFileVars(
					app,
					newNoteContents,
					fileNameNoExtension(option.filePath),
				);
			}

			try {
				linkFile = await app.vault.create(option.filePath, newNoteContents);
				// Update the alias to the name for displaying the @ link
				option.alias = originalQuery;
			} catch (error) {
				new Notice(
					`Unable to create new note at path: ${option.filePath}. Please open an issue on GitHub, https://github.com/Mara-Li/symbol-linking/issues`,
					0,
				);
				throw error;
			}
		}
	}

	const currentFile = app.workspace.getActiveFile();
	if (!linkFile) {
		const file = app.vault.getAbstractFileByPath(option.filePath);
		if (file instanceof TFile) linkFile = file;
	}
	if (!linkFile) {
		new Notice(
			`Unable to get the file at path: ${option.filePath}. Please open an issue on GitHub, as this should not happen.`,
			0,
		);
		throw new Error("File not found");
	}
	let alias = option.originalAlias || "";
	const aliasFallBack =
		settings.limitToFile.length > 0
			? (originalQuery ?? option.fileName)
			: option.fileName;
	if (settings.includeSymbol) alias = `${typedChar}${alias || aliasFallBack}`;
	const linkText =
		settings.limitToFile.length > 0
			? app.fileManager.generateMarkdownLink(
					linkFile,
					currentFile?.path || "",
					`#${originalQuery || option.fileName}`,
					alias,
				)
			: app.fileManager.generateMarkdownLink(
					linkFile,
					currentFile?.path || "",
					undefined, // we don't care about the subpath
					alias,
				);

	return linkText.replace(/\n/g, "");
}
