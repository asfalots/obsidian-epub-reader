import { App, TFile } from 'obsidian';
import { AnnotationData, HIGHLIGHT_DISPLAY_DELAY } from './types';

export class AnnotationParser {
	
	/**
	 * Loads existing highlights from the markdown note file
	 */
	static async loadExistingHighlights(app: App, noteFilePath: string): Promise<AnnotationData[]> {
		if (!noteFilePath) {
			return [];
		}

		try {
			const file = app.vault.getAbstractFileByPath(noteFilePath);
			if (!file || !(file instanceof TFile)) {
				return [];
			}

			const content = await app.vault.read(file);
			const annotations: AnnotationData[] = [];
			
			// Parse annotation comments
			const annotationRegex = /<!-- EPUB_ANNOTATION: (.+?) -->/g;
			let match;
			
			while ((match = annotationRegex.exec(content)) !== null) {
				try {
					const annotationData = JSON.parse(match[1]) as AnnotationData;
					annotations.push(annotationData);
				} catch (error) {
					console.warn('Failed to parse annotation:', match[1], error);
				}
			}
			
			console.debug('Loaded existing highlights:', annotations.length);
			return annotations;
		} catch (error) {
			console.error('Error loading existing highlights:', error);
			return [];
		}
	}

	/**
	 * Filters annotations for the current EPUB section
	 */
	static filterAnnotationsForCurrentSection(annotations: AnnotationData[], currentSectionCfi: string): AnnotationData[] {
		return annotations.filter(annotation => 
			annotation.cfi.startsWith(currentSectionCfi)
		);
	}

	/**
	 * Schedules highlight display with delay to ensure content is rendered
	 */
	static scheduleHighlightDisplay(annotations: AnnotationData[], applyCallback: (annotations: AnnotationData[]) => void): void {
		if (!annotations.length) return;
		setTimeout(() => applyCallback(annotations), HIGHLIGHT_DISPLAY_DELAY);
	}
}
