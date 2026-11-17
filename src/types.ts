import type * as Fuzzysort from "fuzzysort";

export type FileOption = {
	isCreateNewOption?: boolean;
	query?: string;
	fileName: string;
	filePath: string;
	alias?: string;
	originalAlias?: string;
};

/**
 * An entry of the suggestion popup: a fuzzysort match (one result per searched key),
 * or a plain option when there is no query or for "create new" entries.
 * `Fuzzysort.KeysResult<FileOption>` is assignable to it.
 */
export interface FileSuggestion {
	readonly obj: FileOption;
	readonly [key: number]: Fuzzysort.Result | undefined;
}
