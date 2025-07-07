import { ItemView, WorkspaceLeaf } from 'obsidian';

export const EPUB_READER_VIEW_TYPE = 'epub-reader-view';

export class EpubReaderView extends ItemView {
	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
		console.log('EpubReaderView constructor called');
	}

	getViewType() {
		return EPUB_READER_VIEW_TYPE;
	}

	getDisplayText() {
		return 'Epub Reader';
	}

	async onOpen() {
		console.log('EpubReaderView onOpen called');
		const container = this.containerEl.children[1];
		container.empty();
		container.createEl('div', { text: 'EPUB Reader - Ready to load content' });
	}

	async onClose() {
		// Clean up any resources
	}
}
