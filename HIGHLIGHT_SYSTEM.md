# EPUB Highlight System

## Overview
The EPUB reader now supports highlighting text with automatic saving to the associated note file using EPUB.js CFI (Canonical Fragment Identifier) API. Highlights are persisted as structured HTML comments and can be displayed back in the reader.

## How it works

### 1. Text Selection
- Select any text in the EPUB reader
- A highlight overlay will appear with configured highlight options

### 2. CFI Generation
- The system uses EPUB.js `Section.cfiFromRange()` method to generate a precise CFI
- The CFI uniquely identifies the selected text location within the EPUB

### 3. Saving to Note
- Highlights are saved to the markdown note associated with the EPUB
- Each highlight includes:
  - HTML comment with structured annotation data
  - Human-readable formatted text according to template
  - Automatic duplicate prevention (same CFI)

### 4. Annotation Format
Each highlight is saved with an HTML comment containing structured data:

```html
<!-- EPUB_ANNOTATION: {"id":"1751657658301","cfi":"epubcfi(/6/12!/4/76,/1:38,/1:88)","text":"selected text","color":"#4caf50","timestamp":1751657658301,"type":"quote"} -->
> Selected text content
```

### 5. Highlight Display
- Existing highlights are automatically loaded and displayed when viewing EPUB pages
- Highlights appear with colored background matching the original highlight type
- Click on highlights to see annotation details (future feature)
- Highlights are cleared and reloaded when navigating between pages

### Template System
Templates support these variables:
- `{{text}}` - The selected text
- `{{cfi}}` - The generated CFI
- `{{timestamp}}` - ISO timestamp
- `{{section}}` - Current section number
- `{{date}}` - Local date
- `{{time}}` - Local time

## Default Highlight Configurations

1. **Important** (Yellow) - `> {{text}} ^{{cfi}}`
2. **Question** (Orange) - `**Q**: {{text}}\n**A**: \n\n^{{cfi}}`
3. **Note** (Blue) - `- {{text}} ^{{cfi}}`

## Technical Implementation

### Annotation Data Structure
```typescript
interface AnnotationData {
  id: string;           // Unique timestamp-based ID
  cfi: string;          // EPUB CFI for precise location
  text: string;         // Selected text content
  color: string;        // Highlight color
  timestamp: number;    // Unix timestamp in milliseconds
  type: string;         // Highlight type (e.g., "quote", "note")
}
```

### Features
- **Duplicate Prevention**: Automatically removes existing highlights at the same CFI
- **Visual Feedback**: Shows success/error states when saving
- **Persistent Display**: Highlights are shown when returning to previously highlighted pages
- **Text-based Matching**: Uses text content matching for reliable highlight display
- **Memory Management**: Clears highlights when navigating to prevent visual artifacts

### Error Handling
- Validates text selection (max 5000 chars)
- Handles CFI generation failures gracefully
- Shows visual feedback (success/error states)
- Provides meaningful error messages
- Graceful degradation when annotations can't be parsed

### File Integration
- Automatically creates section headers if they don't exist
- Inserts highlights in appropriate sections
- Maintains markdown formatting
- Supports regex-based section matching
- Preserves existing content structure
