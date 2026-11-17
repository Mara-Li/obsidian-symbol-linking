// Highlights the search result and adds it to the element
// Derived from https://github.com/farzher/fuzzysort/blob/c7f1d2674d7fa526015646bc02fd17e29662d30c/fuzzysort.js#L132
import type * as Fuzzysort from "fuzzysort";
import type { FileOption } from "../types";
import { removeAccents } from "./valid-file-name";

export function highlightSearch(
	element: HTMLElement,
	result: Fuzzysort.Result,
	file?: FileOption,
	uniformize?: boolean,
): void {
	let target = result.target;
	if (file && uniformize) {
		//search the target in the file in alias and fileName
		const alias = file.alias;
		const fileName = file.fileName;
		if (alias === target) target = file.originalAlias ?? alias;
		else if (removeAccents(fileName) === target) {
			target = file.filePath.split("/").pop()?.split(".")[0] ?? fileName;
		}
	}

	// Consecutive matched characters are grouped in a single <strong>
	const matched = new Set(result.indexes);
	let strongElement: HTMLElement | null = null;
	let plainText = "";
	for (let i = 0; i < target.length; ++i) {
		const char = target.charAt(i);
		if (matched.has(i)) {
			if (plainText) {
				element.appendText(plainText);
				plainText = "";
			}
			strongElement ??= element.createEl("strong");
			strongElement.appendText(char);
		} else {
			strongElement = null;
			plainText += char;
		}
	}
	if (plainText) element.appendText(plainText);
}
