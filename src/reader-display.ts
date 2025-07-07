import { AnnotationData } from './types';

export class ReaderDisplay {
	
	/**
	 * Applies highlights to the current page content
	 */
	static async applyHighlightsToPage(annotations: AnnotationData[], containerEl: HTMLElement): Promise<void> {
		try {
			for (const annotation of annotations) {
				await this.applyHighlightToContent(annotation, containerEl);
			}
		} catch (error) {
			console.error('Error displaying highlights in reader:', error);
		}
	}

	/**
	 * Applies a single highlight to the page content
	 */
	static async applyHighlightToContent(annotation: AnnotationData, containerEl: HTMLElement): Promise<void> {
		const contentDiv = containerEl.querySelector('#epub-content');
		if (!contentDiv) return;

		try {
			// Create a simple text-based highlight by finding and wrapping the text
			// This is a simplified approach since we have the text content directly
			const walker = document.createTreeWalker(
				contentDiv,
				NodeFilter.SHOW_TEXT,
				null
			);

			const textNodes: Text[] = [];
			let node;
			while (node = walker.nextNode()) {
				textNodes.push(node as Text);
			}

			// Find text nodes that contain the highlight text
			const highlightText = annotation.text.trim();
			
			// Try exact match first, then fuzzy match
			let matchFound = false;
			
			for (const textNode of textNodes) {
				if (matchFound) break;
				
				const textContent = textNode.textContent || '';
				let startIndex = textContent.indexOf(highlightText);
				
				// If exact match not found, try fuzzy matching (accounting for formatting differences)
				if (startIndex === -1) {
					const normalizedText = textContent.replace(/\s+/g, ' ').trim();
					const normalizedHighlight = highlightText.replace(/\s+/g, ' ').trim();
					startIndex = normalizedText.indexOf(normalizedHighlight);
					
					if (startIndex !== -1) {
						// Map back to original text position
						const beforeText = normalizedText.substring(0, startIndex);
						const beforeOriginal = textContent.substring(0, textContent.replace(/\s+/g, ' ').indexOf(beforeText) + beforeText.length);
						startIndex = beforeOriginal.length;
					}
				}
				
				if (startIndex !== -1) {
					// Create range for the found text
					const range = document.createRange();
					range.setStart(textNode, startIndex);
					range.setEnd(textNode, Math.min(startIndex + highlightText.length, textContent.length));
					
					// Create highlight span
					const span = this.createHighlightSpan(annotation);
					
					try {
						// Wrap the range with the highlight span
						this.wrapRangeWithHighlight(range, span);
						matchFound = true;
					} catch (error) {
						console.warn('Error wrapping text with highlight:', error);
					}
				}
			}
			
			if (!matchFound) {
				console.warn('Could not find text to highlight:', highlightText.substring(0, 50) + '...');
			}
		} catch (error) {
			console.warn('Error applying highlight to content:', error);
		}
	}

	/**
	 * Creates a highlight span element with proper styling
	 */
	static createHighlightSpan(annotation: AnnotationData): HTMLSpanElement {
		const span = document.createElement('span');
		span.style.backgroundColor = annotation.color;
		span.style.cursor = 'pointer';
		span.style.borderRadius = '2px';
		span.style.padding = '1px 2px';
		span.style.margin = '0 1px';
		span.style.transition = 'opacity 0.2s ease';
		span.setAttribute('data-annotation-id', annotation.id);
		span.setAttribute('data-annotation-type', annotation.type);
		span.title = `${annotation.type}: ${annotation.text.substring(0, 100)}${annotation.text.length > 100 ? '...' : ''}`;
		
		// Add hover effect
		span.addEventListener('mouseenter', () => {
			span.style.opacity = '0.8';
		});
		
		span.addEventListener('mouseleave', () => {
			span.style.opacity = '1';
		});
		
		// Add click handler for future interaction
		span.addEventListener('click', () => {
			console.log('Clicked highlight:', annotation);
			// TODO: Could show annotation details or allow editing
		});
		
		return span;
	}

	/**
	 * Wraps a text range with a highlight span
	 */
	static wrapRangeWithHighlight(range: Range, span: HTMLSpanElement): void {
		try {
			// Extract contents and wrap with span
			const contents = range.extractContents();
			span.appendChild(contents);
			range.insertNode(span);
		} catch (error) {
			console.error('Error wrapping range with highlight:', error);
		}
	}

	/**
	 * Applies styling to a highlighted range (alternative approach)
	 */
	static applyHighlightStyling(range: Range, annotation: AnnotationData): void {
		try {
			const span = this.createHighlightSpan(annotation);
			this.wrapRangeWithHighlight(range, span);
		} catch (error) {
			console.error('Error applying highlight styling:', error);
		}
	}

	/**
	 * Refreshes all highlights on the current page
	 */
	static async refreshHighlights(annotations: AnnotationData[], containerEl: HTMLElement): Promise<void> {
		// Clear existing highlights first
		this.clearDisplayedHighlights(containerEl);
		
		// Reapply all highlights
		await this.applyHighlightsToPage(annotations, containerEl);
	}

	/**
	 * Clears all displayed highlights from the page
	 */
	static clearDisplayedHighlights(containerEl: HTMLElement): void {
		const contentDiv = containerEl.querySelector('#epub-content');
		if (!contentDiv) return;

		// Remove all highlight spans
		const highlightSpans = contentDiv.querySelectorAll('span[data-annotation-id]');
		highlightSpans.forEach(span => {
			// Unwrap the span, keeping only its text content
			const parent = span.parentNode;
			if (parent) {
				// Move all child nodes before the span
				while (span.firstChild) {
					parent.insertBefore(span.firstChild, span);
				}
				// Remove the span element
				parent.removeChild(span);
				
				// Normalize the parent to merge adjacent text nodes
				parent.normalize();
			}
		});
	}

	/**
	 * Renders the main EPUB reader UI structure
	 */
	static renderReaderUI(containerEl: HTMLElement): void {
		containerEl.innerHTML = `
			<div id="epub-reader">
				<div id="epub-toolbar" style="padding: 10px; border-bottom: 1px solid var(--background-modifier-border); display: flex; justify-content: center; align-items: center; gap: 10px;">
					<button id="prev-btn">← Previous</button>
					<span id="chapter-info">Loading...</span>
					<button id="next-btn">Next →</button>
				</div>
				<div id="epub-content" style="padding: 20px; max-width: 800px; margin: 0 auto; line-height: 1.6; overflow-y: auto; height: calc(100vh - 100px);">
					<p>Loading EPUB...</p>
				</div>
			</div>
		`;
	}
}
