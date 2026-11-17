/**
 * Compatibility Mode Extension Handler
 * Necessary to handle the suggester with somes other plugins, as Various Complement, nl-date, Task or older plugin that doesn't use last Obsidian API.
 * This extension made Linking works with them without any issue.
 * It is optional and can be enabled in the settings. By default, it is disabled and use the last API for editor inputs.
 */

import { syntaxTree } from "@codemirror/language";
import type { EditorView, PluginValue } from "@codemirror/view";
import { ViewPlugin } from "@codemirror/view";
import { type App, type EditorPosition, Platform } from "obsidian";
import type { CustomSuggester } from "../settings/interface";
import { isValidFileNameCharacter } from "../utils/valid-file-name";
import { LINE_HEIGHT, LinkSuggest } from "./extension-popup";

// Max parents we will iterate through to determine if a click event is outside the suggestion popup
const maxParentDepth = 5;

export function atSymbolTriggerExtension(app: App, settings: CustomSuggester) {
	return ViewPlugin.fromClass(
		class AtSymbolTriggerExtension implements PluginValue {
			private readonly view: EditorView;
			private firstOpenedCursor: EditorPosition | null = null;
			private openQuery = "";
			private isOpen = false;
			private suggestionEl: HTMLDivElement | null = null;
			private suggestionPopup: LinkSuggest | null = null;
			// Listeners bound to this instance, kept to remove them in destroy()
			private readonly keyListener: (event: KeyboardEvent) => void;
			private readonly clickListener: (event: MouseEvent) => void;

			constructor(view: EditorView) {
				this.view = view;
				this.keyListener = (event) => {
					this.handleKeyEvent(event);
				};
				this.clickListener = (event) => {
					this.handleClickEvent(event);
				};
				window.addEventListener("click", this.clickListener);
				this.view.dom.addEventListener("keydown", this.keyListener);
			}

			public destroy(): void {
				this.view.dom.removeEventListener("keydown", this.keyListener);
				window.removeEventListener("click", this.clickListener);
			}

			public closeSuggestion(): boolean {
				this.isOpen = false;
				this.firstOpenedCursor = null;
				this.openQuery = "";
				this.suggestionPopup?.close();
				this.suggestionEl?.remove();
				this.suggestionPopup = null;
				this.suggestionEl = null;
				return true;
			}

			private openSuggestion(): boolean {
				this.isOpen = true;
				this.firstOpenedCursor = this.getCursor();
				return true;
			}

			private handleKeyEvent(event: KeyboardEvent): boolean {
				// Don't enable when editing title
				const target = event.target as Node | null;
				if (
					target?.instanceOf(HTMLElement) &&
					target.classList.contains("inline-title")
				) {
					return false;
				}

				const typedChar = event.key;

				// When open and user enters newline or tab, close
				if (this.isOpen && (typedChar === "\n" || typedChar === "\t")) {
					return this.closeSuggestion();
				}

				let isInValidContext = true;
				const cursor = this.view.state.selection.main;
				syntaxTree(this.view.state).iterate({
					from: cursor.from,
					to: cursor.to,
					enter(node) {
						// When node.type name is:
						// hmd-frontmatter - Cursor is in Title (don't open)
						// inline-code - Cursor is in code block (don't open)
						// .includes("codeblock") - Cursor is in multiline code block (don't open)
						// Otherwise, open
						if (
							node.type.name === "hmd-frontmatter" ||
							node.type.name === "inline-code" ||
							node.type.name?.includes("codeblock")
						) {
							isInValidContext = false;
						}
					},
				});

				if (!isInValidContext) {
					return false;
				}
				const triggerFileSymbol = settings.limitToFile.map((file) => file.triggerSymbol);
				const triggerFolderSymbol = settings.limitToDirectories.map(
					(dir) => dir.triggerSymbol,
				);
				let justOpened = false;
				if (
					(!this.isOpen && typedChar === settings.triggerSymbol) ||
					triggerFileSymbol.includes(typedChar) ||
					triggerFolderSymbol.includes(typedChar)
				) {
					justOpened = true;
					this.openSuggestion();
				} else if (!this.isOpen) {
					return false;
				}

				// Build query when open
				const key = event.key.toLocaleLowerCase();
				const excludeFrom = [
					"backspace",
					"shift",
					"arrow",
					"tab",
					"capslock",
					"alt",
				].find((excluded) => key.includes(excluded));
				if (typedChar === "Backspace") {
					if (this.openQuery.length === 0) {
						return this.closeSuggestion();
					}
					this.openQuery = this.openQuery.slice(0, -1);
				} else if (typedChar === "Escape") {
					this.closeSuggestion();
				} else if (
					!isValidFileNameCharacter(typedChar, settings) ||
					event.altKey ||
					event.metaKey ||
					event.ctrlKey ||
					excludeFrom
				) {
					return false;
				} else if (!justOpened) {
					this.openQuery += typedChar;
				}

				// If query has more spaces alloted by the leavePopupOpenForXSpaces setting, close
				if (
					this.openQuery.split(" ").length - 1 > settings.leavePopupOpenForXSpaces ||
					// Also close if the query starts with a space, regardless of space settings
					this.openQuery.startsWith(" ")
				) {
					return this.closeSuggestion();
				}
				//if (settings.removeAccents) this.openQuery = removeAccents(this.openQuery);

				if (!this.suggestionEl && this.firstOpenedCursor && this.view) {
					const container = app.dom.appContainerEl;
					// Zero-size anchor the popup is positioned against
					this.suggestionEl = createDiv({ cls: "at-symbol-linking-anchor" });
					this.suggestionEl.id = "at-symbol-suggestion-root";

					if (Platform.isDesktop) {
						const coords = this.view.coordsAtPos(this.firstOpenedCursor.ch);
						if (coords) {
							this.suggestionEl.setCssStyles({
								left: `${coords.left}px`,
								top: `${coords.top + LINE_HEIGHT}px`,
							});
						}
					} else {
						this.suggestionEl.addClass("is-mobile");
					}
					container.appendChild(this.suggestionEl);
					this.suggestionPopup = new LinkSuggest(
						app,
						this.suggestionEl,
						settings,
						typedChar,
						(linkText) => this.onSelect(linkText),
					);
					this.suggestionPopup.onInputChanged(this.openQuery);
				}

				if (this.suggestionPopup) {
					this.suggestionPopup.onInputChanged(this.openQuery);
				}

				return true;
			}

			private handleClickEvent(event: MouseEvent): void {
				if (this.isOpen) {
					// Determine if click is outside the suggestion popup
					let currentDepth = 0;
					let parent = event.target as Node | null;
					let shouldClose = true;
					while (event.target && currentDepth < maxParentDepth) {
						currentDepth++;
						if (
							parent?.instanceOf(HTMLElement) &&
							parent.id === "at-symbol-suggestion-context"
						) {
							shouldClose = false;
							break;
						}
						parent = parent?.parentNode ?? null;
					}
					if (shouldClose) {
						this.closeSuggestion();
					}
				}
			}

			private onSelect(linkText: string) {
				const cursor = this.getCursor();
				const from = this.firstOpenedCursor?.ch ?? cursor.ch;
				try {
					this.view.dispatch(
						this.view.state.update({
							changes: {
								from,
								to: cursor.ch,
								insert: linkText,
							},
						}),
					);
				} catch (error) {
					console.error("Symbol Linking: Error creating first link", error);
					this.view.dispatch(
						this.view.state.update({
							changes: {
								from,
								insert: linkText,
							},
						}),
					);
				}

				this.closeSuggestion();
			}

			private getCursor(): EditorPosition {
				const ch = this.view.state.selection.main.head;
				const line = this.view.state.doc.lineAt(ch).number;
				return {
					ch,
					line,
				};
			}
		},
	);
}
