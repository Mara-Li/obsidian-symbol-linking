// Code derived from https://github.com/tth05/obsidian-completr
import type { App, Command, KeymapContext, KeymapInfo } from "obsidian";
import type AtSymbolLinking from "../main";
import { SelectionDirection } from "./suggest-popup";

/**
 * Extra fields read by the hotkey handler below (not part of Obsidian's API):
 * `isVisible` hides a command's hotkey while the popup is closed, and commands from
 * completr can declare themselves as "bypass" commands.
 */
type HotkeyHackCommand = Command & {
	isVisible?: () => boolean;
	isBypassCommand?: () => boolean;
};

// Hacky override that lets us use hotkeys when the popup is open from completr
export function applyHotKeyHack(plugin: AtSymbolLinking, app: App) {
	// This replaces the default handler for commands. This is needed because the default handler always consumes
	// the event if the command exists.
	app.scope.keys = [];

	const isHotkeyMatch = (
		hotkey: KeymapInfo,
		context: KeymapContext,
		isBypassCommand: boolean,
	): boolean => {
		// Copied from original isMatch function, modified to not require exactly the same modifiers for
		// completr-bypass commands. This allows triggering for example Ctrl+Enter even when
		// pressing Ctrl+Shift+Enter. The additional modifier is then passed to the editor.

		/* Original isMatch function:
            var n = e.modifiers
                , i = e.key;
            return (null === n || n === t.modifiers) && (!i || (i === t.vkey || !(!t.key || i.toLocaleLowerCase() !== t.key.toLocaleLowerCase())))
            */

		const { modifiers, key } = hotkey;
		if (
			modifiers !== null &&
			(isBypassCommand
				? !context.modifiers?.contains(modifiers)
				: modifiers !== context.modifiers)
		)
			return false;
		return (
			!key ||
			key === context.vkey ||
			!(!context.key || key.toLocaleLowerCase() !== context.key.toLocaleLowerCase())
		);
	};
	app.scope.register(null, null, (e: KeyboardEvent, t: KeymapContext) => {
		const hotkeyManager = app.hotkeyManager;
		hotkeyManager.bake();
		for (const [index, hotkey] of hotkeyManager.bakedHotkeys.entries()) {
			const id = hotkeyManager.bakedIds[index];
			if (id === undefined) continue;
			const command: HotkeyHackCommand | undefined = app.commands.findCommand(id);
			const isBypassCommand = command?.isBypassCommand?.() ?? false;
			if (!isHotkeyMatch(hotkey, t, isBypassCommand)) continue;
			// Condition taken from original function
			if (!command || (e.repeat && !command.repeatable)) {
				continue;
			} else if (command.isVisible && !command.isVisible()) {
				//HACK: Hide our commands when to popup is not visible to allow the keybinds to execute their default action.
				continue;
			} else if (isBypassCommand) {
				plugin.suggestionPopup?.close();

				const validMods = (t.modifiers ?? "")
					.replace(new RegExp(`${hotkey.modifiers},*`), "")
					.split(",");
				// Sends the event again, only keeping the modifiers which didn't activate this command
				const event = new KeyboardEvent("keydown", {
					key: hotkeyManager.defaultKeys[id]?.[0]?.key,
					ctrlKey: validMods.contains("Ctrl"),
					shiftKey: validMods.contains("Shift"),
					altKey: validMods.contains("Alt"),
					metaKey: validMods.contains("Meta"),
				});
				e.target?.dispatchEvent(event);
				return false;
			}

			if (app.commands.executeCommandById(id)) return false;
		}
		return undefined;
	});

	const isPopupVisible = () => plugin.suggestionPopup?.isVisible() ?? false;
	const addPopupCommand = (command: HotkeyHackCommand) => plugin.addCommand(command);

	// The popup clears its own key scope, so these default hotkeys are what navigate it.
	addPopupCommand({
		id: "select-next-suggestion",
		name: "Select next suggestion",
		hotkeys: [
			{
				key: "ArrowDown",
				modifiers: [],
			},
		],
		repeatable: true,
		editorCallback: () => {
			plugin.suggestionPopup?.selectNextItem(SelectionDirection.NEXT);
		},
		isVisible: isPopupVisible,
	});
	addPopupCommand({
		id: "select-previous-suggestion",
		name: "Select previous suggestion",
		hotkeys: [
			{
				key: "ArrowUp",
				modifiers: [],
			},
		],
		repeatable: true,
		editorCallback: () => {
			plugin.suggestionPopup?.selectNextItem(SelectionDirection.PREVIOUS);
		},
		isVisible: isPopupVisible,
	});
	addPopupCommand({
		id: "insert-selected-suggestion",
		name: "Insert selected suggestion",
		hotkeys: [
			{
				key: "Enter",
				modifiers: [],
			},
		],
		editorCallback: () => plugin.suggestionPopup?.applySelectedItem(),
		isVisible: isPopupVisible,
	});
	addPopupCommand({
		id: "exit-suggestion",
		name: "Exit suggestions",
		hotkeys: [
			{
				key: "Escape",
				modifiers: [],
			},
		],
		editorCallback: () => plugin.suggestionPopup?.closeSuggestion(),
		isVisible: isPopupVisible,
	});
}
