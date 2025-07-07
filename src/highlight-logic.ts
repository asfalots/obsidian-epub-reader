import { HighlightData, AnnotationData, MAX_HIGHLIGHT_LENGTH } from './types';

export class HighlightLogic {
	
	/**
	 * Validates that all required components are available for saving a highlight
	 */
	static validateHighlightRequirements(noteFilePath: string, pluginInstance: any, spineItems: any): void {
		if (!noteFilePath || !pluginInstance || !spineItems) {
			throw new Error('Missing required components for saving highlight');
		}
	}

	/**
	 * Validates and processes selected text for highlighting
	 */
	static validateSelectedText(text: string): string {
		if (!text) {
			throw new Error('No text selected');
		}
		
		if (text.length > MAX_HIGHLIGHT_LENGTH) {
			console.warn('Selected text is very long, truncating to 5000 characters');
			return text.substring(0, MAX_HIGHLIGHT_LENGTH) + '...';
		}
		
		return text;
	}

	/**
	 * Generates CFI (Canonical Fragment Identifier) from a text selection range
	 */
	static async generateCfiFromRange(range: Range, spineItems: any, currentIndex: number, book: any): Promise<string> {
		const currentItem = spineItems[currentIndex];
		if (!currentItem) {
			throw new Error('Current section not available');
		}

		try {
			await currentItem.load(book.load.bind(book));
			const cfi = currentItem.cfiFromRange(range);
			
			if (!cfi || typeof cfi !== 'string') {
				throw new Error('Invalid CFI generated');
			}
			
			console.debug('Generated CFI for highlight:', cfi);
			return cfi;
		} catch (error) {
			console.error('Error generating CFI:', error);
			throw new Error('Failed to generate position reference');
		} finally {
			currentItem.unload();
		}
	}

	/**
	 * Creates highlight data structure
	 */
	static createHighlightData(text: string, cfi: string, config: any, currentIndex: number): HighlightData {
		return {
			text,
			cfi,
			color: config.color,
			timestamp: new Date().toISOString(),
			section: currentIndex + 1
		};
	}

	/**
	 * Creates annotation data structure for internal tracking
	 */
	static createAnnotationData(highlightData: HighlightData, config: any): AnnotationData {
		const timestampMs = Date.now();
		return {
			id: timestampMs.toString(),
			cfi: highlightData.cfi,
			text: highlightData.text,
			color: config.color,
			timestamp: timestampMs,
			type: config.name.toLowerCase()
		};
	}

	/**
	 * Applies template to highlight data with variable substitution
	 */
	static applyTemplate(template: string, data: HighlightData): string {
		return template
			.replace(/\{\{text\}\}/g, data.text)
			.replace(/\{\{cfi\}\}/g, data.cfi)
			.replace(/\{\{timestamp\}\}/g, data.timestamp)
			.replace(/\{\{section\}\}/g, data.section.toString())
			.replace(/\{\{date\}\}/g, new Date().toLocaleDateString())
			.replace(/\{\{time\}\}/g, new Date().toLocaleTimeString());
	}
}
