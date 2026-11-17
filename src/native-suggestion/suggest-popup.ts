import { syntaxTree } from "@codemirror/language";
import {
	type App,
	type Editor,
	type EditorPosition,
	EditorSuggest,
	type EditorSuggestContext,
	type EditorSuggestTriggerInfo,
} from "obsidian";
import type { CustomSuggester } from "../settings/interface";
import {
	sharedGetMonoFileSuggestion,
	sharedGetSuggestions,
} from "../shared-suggestion/sharedGetSuggestions";
import sharedRenderSuggestion from "../shared-suggestion/sharedRenderSuggestion";
import { sharedSelectSuggestion } from "../shared-suggestion/sharedSelectSuggestion";
import type { FileSuggestion } from "../types";
import { isValidFileNameCharacter, removeAccents } from "../utils/valid-file-name";

export default class SuggestionPopup extends EditorSuggest<FileSuggestion> {
	private readonly settings: CustomSuggester;
	private typedChar: string;
	private originalQuery = "";

	private firstOpenedCursor: null | EditorPosition = null;
	private focused = false;
	public name = "Symbol linking suggest";

	constructor(app: App, settings: CustomSuggester) {
		super(app);
		this.settings = settings;
		this.typedChar = settings.triggerSymbol;

		//Remove default key registrations
		this.scope.keys = [];
	}

	open() {
		super.open();
		this.focused = true;
	}

	close() {
		super.close();
		this.focused = false;
	}

	getSuggestions(context: EditorSuggestContext): FileSuggestion[] {
		if (this.settings.limitToFile.length > 0)
			return sharedGetMonoFileSuggestion(
				context.query,
				this.settings,
				this.app,
				this.typedChar,
				this.originalQuery,
			);

		const files = this.app.vault.getFiles();
		return sharedGetSuggestions(
			files,
			context.query,
			this.settings,
			this.app,
			this.typedChar,
			this.originalQuery,
		);
	}

	onTrigger(cursor: EditorPosition, editor: Editor): EditorSuggestTriggerInfo | null {
		let query = "";
		const typedChar = editor.getRange(
			{ ...cursor, ch: cursor.ch - 1 },
			{ ...cursor, ch: cursor.ch },
		);

		// When open and user enters newline or tab, close
		if (this.firstOpenedCursor && (typedChar === "\n" || typedChar === "\t")) {
			return this.closeSuggestion();
		}

		// If user's cursor is inside a code block, don't attempt to link
		let isInCodeBlock = false;
		const cm = editor.cm as typeof editor.cm | undefined;
		if (cm) {
			const cursor = cm.state.selection.main;
			syntaxTree(cm.state).iterate({
				from: cursor.from,
				to: cursor.to,
				enter(node) {
					if (node.type.name === "inline-code" || node.type.name?.includes("codeblock")) {
						isInCodeBlock = true;
					}
				},
			});
		}

		// If already open, allow backticks to be part of file name
		if (isInCodeBlock && !this.firstOpenedCursor) {
			return null;
		}

		// Open suggestion when trigger is typed
		const triggerFileSymbol = this.settings.limitToFile.map((file) => file.triggerSymbol);
		const triggerFolderSymbol = this.settings.limitToDirectories.map(
			(dir) => dir.triggerSymbol,
		);
		if (
			typedChar === this.settings.triggerSymbol ||
			triggerFileSymbol.includes(typedChar) ||
			triggerFolderSymbol.includes(typedChar)
		) {
			this.typedChar = typedChar;
			this.firstOpenedCursor = cursor;
			this.originalQuery = query;
			return {
				start: { ...cursor, ch: cursor.ch - 1 },
				end: cursor,
				query: this.settings.removeAccents ? removeAccents(query) : query,
			};
		}

		// Don't continue evaluating if not opened
		if (!this.firstOpenedCursor) {
			return null;
		} else {
			query = editor.getRange(this.firstOpenedCursor, {
				...cursor,
				ch: cursor.ch,
			});
		}

		// If query has more spaces alloted by the leavePopupOpenForXSpaces setting, close
		if (
			query.split(" ").length - 1 > this.settings.leavePopupOpenForXSpaces ||
			// Also close if query starts with a space, regardless of space settings
			query.startsWith(" ")
		) {
			return this.closeSuggestion();
		}

		// If query is empty or doesn't have valid filename characters, close
		if (!query || !isValidFileNameCharacter(typedChar, this.settings)) {
			return this.closeSuggestion();
		}
		this.originalQuery = query;
		return {
			start: { ...cursor, ch: cursor.ch - 1 },
			end: cursor,
			query: this.settings.removeAccents ? removeAccents(query) : query,
		};
	}

	renderSuggestion(value: FileSuggestion, el: HTMLElement): void {
		sharedRenderSuggestion(
			value,
			el,
			this.settings.limitToFile.length,
			this.settings.removeAccents,
		);
	}

	selectSuggestion(value: FileSuggestion): void {
		void this.insertSuggestion(value);
	}

	private async insertSuggestion(value: FileSuggestion): Promise<void> {
		// The context is reset when the popup closes, so keep it across the await
		const context = this.context;
		if (!context) return;
		const line = context.editor.getRange(
			{ line: context.start.line, ch: 0 },
			context.end,
		);

		const linkText = await sharedSelectSuggestion(
			this.app,
			this.settings,
			this.typedChar,
			this.originalQuery,
			value,
		);
		context.editor.replaceRange(
			linkText,
			{
				line: context.start.line,
				ch: line.lastIndexOf(this.typedChar),
			},
			context.end,
		);

		// Close suggestion popup
		this.closeSuggestion();
	}

	selectNextItem(dir: SelectionDirection) {
		if (!this.focused) {
			this.focused = true;
			dir = dir === SelectionDirection.PREVIOUS ? dir : SelectionDirection.NONE;
		}

		// HACK: The second parameter has to be an instance of KeyboardEvent to force scrolling the selected item into
		// view
		this.suggestions.setSelectedItem(
			this.suggestions.selectedItem + dir,
			new KeyboardEvent("keydown"),
		);
	}

	closeSuggestion() {
		this.firstOpenedCursor = null;
		this.close();
		return null;
	}

	getSelectedItem(): FileSuggestion | undefined {
		return this.suggestions.values?.[this.suggestions.selectedItem];
	}

	applySelectedItem() {
		this.suggestions.useSelectedItem(new KeyboardEvent("keydown"));
	}

	isVisible(): boolean {
		return this.isOpen;
	}

	isFocused(): boolean {
		return this.focused;
	}
}

export enum SelectionDirection {
	NEXT = 1,
	PREVIOUS = -1,
	NONE = 0,
}
