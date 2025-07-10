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
		return annotations.filter(annotation => {
			// Extract the base CFI from the annotation CFI
			// Handle different CFI formats:
			// 1. "epubcfi(/6/26!/4/32/...)" -> "/6/26"
			// 2. "/6/26!/4/32/..." -> "/6/26"
			// 3. "/6/26" -> "/6/26"
			
			let annotationBaseCfi = annotation.cfi;
			
			// Remove epubcfi( prefix if present
			if (annotationBaseCfi.startsWith('epubcfi(')) {
				annotationBaseCfi = annotationBaseCfi.slice(8); // Remove "epubcfi("
				if (annotationBaseCfi.endsWith(')')) {
					annotationBaseCfi = annotationBaseCfi.slice(0, -1); // Remove ")"
				}
			}
			
			// Extract base CFI (everything before the first "!")
			const exclamationIndex = annotationBaseCfi.indexOf('!');
			if (exclamationIndex !== -1) {
				annotationBaseCfi = annotationBaseCfi.substring(0, exclamationIndex);
			}
			
			return annotationBaseCfi === currentSectionCfi;
		});
	}

	/**
	 * Schedules highlight display with delay to ensure content is rendered
	 */
	static scheduleHighlightDisplay(annotations: AnnotationData[], applyCallback: (annotations: AnnotationData[]) => void): void {
		if (!annotations.length) return;
		setTimeout(() => applyCallback(annotations), HIGHLIGHT_DISPLAY_DELAY);
	}
}
