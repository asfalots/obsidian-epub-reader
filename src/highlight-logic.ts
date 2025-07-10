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
	 * Uses text-based mapping to handle transformed DOM structure
	 */
	static async generateCfiFromRange(range: Range, spineItems: any, currentIndex: number, book: any): Promise<string> {
		const currentItem = spineItems[currentIndex];
		if (!currentItem) {
			throw new Error('Current section not available');
		}

		try {
			await currentItem.load(book.load.bind(book));
			
			// Get the selected text content for validation
			const selectedText = range.toString().trim();
			console.debug('Generating CFI for selected text:', selectedText.substring(0, 50) + '...');
			
			// Try to use the range directly first (may work if DOM structure is similar enough)
			try {
				const cfi = currentItem.cfiFromRange(range);
				if (cfi && typeof cfi === 'string') {
					console.debug('Successfully generated CFI directly:', cfi);
					return cfi;
				}
			} catch (error) {
				console.debug('Direct CFI generation failed, trying text-based approach:', error.message);
			}
			
			// Fallback: Create a CFI based on text content position
			const cfi = this.generateCfiFromTextContent(currentItem, selectedText);
			
			if (!cfi || typeof cfi !== 'string') {
				throw new Error('Invalid CFI generated');
			}
			
			console.debug('Generated CFI for highlight:', cfi, 'from text:', selectedText.substring(0, 50));
			return cfi;
		} catch (error) {
			console.error('Error generating CFI:', error);
			throw new Error('Failed to generate position reference');
		} finally {
			currentItem.unload();
		}
	}

	/**
	 * Generates CFI based on text content position (fallback method)
	 */
	private static generateCfiFromTextContent(currentItem: any, selectedText: string): string {
		try {
			// Get document content
			const doc = currentItem.document;
			if (!doc) {
				throw new Error('Document not available');
			}
			
			// Find the text in the document and create a simple range
			const bodyElement = doc.body || doc.documentElement;
			const textContent = bodyElement.textContent || '';
			const textIndex = textContent.indexOf(selectedText);
			
			if (textIndex === -1) {
				// Try normalized search
				const normalizedText = textContent.replace(/\s+/g, ' ');
				const normalizedSelected = selectedText.replace(/\s+/g, ' ');
				const normalizedIndex = normalizedText.indexOf(normalizedSelected);
				
				if (normalizedIndex === -1) {
					throw new Error('Text not found in document');
				}
			}
			
			// Create a simple range at the beginning of the found text
			const range = doc.createRange();
			const walker = doc.createTreeWalker(bodyElement, NodeFilter.SHOW_TEXT);
			
			let currentPos = 0;
			let targetPos = textIndex >= 0 ? textIndex : 0;
			
			while (walker.nextNode()) {
				const textNode = walker.currentNode as Text;
				const nodeLength = textNode.textContent?.length || 0;
				
				if (currentPos + nodeLength > targetPos) {
					// Found the target text node
					const offset = targetPos - currentPos;
					range.setStart(textNode, offset);
					range.setEnd(textNode, Math.min(offset + selectedText.length, nodeLength));
					break;
				}
				currentPos += nodeLength;
			}
			
			// Generate CFI from the created range
			return currentItem.cfiFromRange(range);
			
		} catch (error) {
			console.warn('Text-based CFI generation failed:', error);
			// Return a basic CFI as ultimate fallback
			return currentItem.cfiBase + '/4'; // Basic chapter reference
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
