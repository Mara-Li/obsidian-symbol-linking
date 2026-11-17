import { setIcon } from "obsidian";
import type { FileSuggestion } from "../types";
import { highlightSearch } from "../utils/highlight-search";

export default function sharedRenderSuggestion(
	value: FileSuggestion,
	el: HTMLElement,
	limitToOneFile: number = 0,
	uniformize?: boolean,
): void {
	el.addClass("at-symbol-linking-suggestion");
	const context = el.createDiv({ cls: "suggestion-context" });
	context.id = "at-symbol-suggestion-context";

	// Add title with matching search terms bolded (highlighted)
	const title = context.createDiv({ cls: "suggestion-title" });
	const firstMatch = value[0];
	const secondMatch = value[1];
	if (firstMatch?.target) {
		highlightSearch(title, firstMatch, value.obj, uniformize);
	} else if (value.obj.originalAlias) {
		title.setText(value.obj.originalAlias);
	} else if (value.obj.alias) {
		title.setText(value.obj.alias);
	} else if (secondMatch) {
		highlightSearch(title, secondMatch, value.obj, uniformize);
	} else {
		title.setText(value.obj.fileName.split(".")[0] ?? "");
	}

	if (limitToOneFile === 0 || limitToOneFile > 1) {
		let pathText = "";
		if (value.obj.isCreateNewOption) {
			pathText += `Create a new ${limitToOneFile > 1 ? "header" : "note"} in `;
		}
		pathText += value.obj.filePath;
		context.createDiv({ cls: "suggestion-path", text: pathText });
	} else if (limitToOneFile === 1 && value.obj.isCreateNewOption) {
		context.createDiv({ cls: "suggestion-path", text: "Create a new header" });
	}

	const aux = el.createDiv({ cls: "suggestion-aux" });
	if (value.obj.alias) {
		const alias = aux.createSpan({
			cls: "suggestion-flair",
			attr: { "aria-label": "Alias" },
		});
		setIcon(alias, "forward");
	}
}
