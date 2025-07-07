export const EPUB_READER_VIEW_TYPE = 'epub-reader-view';

// Constants
export const MAX_HIGHLIGHT_LENGTH = 5000;
export const HIGHLIGHT_DISPLAY_DELAY = 100;
export const SUCCESS_FEEDBACK_DURATION = 500;
export const ERROR_FEEDBACK_DURATION = 1000;

// Data interfaces
export interface HighlightData {
	text: string;
	cfi: string;
	color: string;
	timestamp: string;
	section: number;
}

export interface AnnotationData {
	id: string;
	cfi: string;
	text: string;
	color: string;
	timestamp: number;
	type: string;
}

// Config interfaces
export interface HighlightConfig {
	name: string;
	color: string;
	section: string;
	template: string;
}

export interface EpubReaderState {
	epubPath: string;
	noteFile: string;
	savedProgress?: string;
	plugin?: any;
}
