# EPUB Canonical Fragment Identifier (CFI) Specification for AI Agents

This document provides a detailed specification of the EPUB Canonical Fragment Identifier (CFI). It's designed to be used by an AI coding agent for parsing, generating, and resolving CFIs within EPUB documents.

---

## 1. Introduction to CFI

An **EPUB Canonical Fragment Identifier (CFI)** is a standardized method for creating a unique reference to a specific location within any publication that conforms to the EPUB standard. A CFI can point to an entire content document, a specific element, or even a precise character within the text.

The primary purpose of a CFI is to enable features like:
- **Bookmarks:** Allowing a user to save and return to a specific location.
- **Annotations:** Linking notes or highlights to a specific piece of content.
- **Last Read Position:** Automatically returning a user to where they left off.
- **Inter-document linking:** Creating robust links between different parts of an EPUB.

A CFI is designed to be **resilient** to changes in formatting, such as font size adjustments or screen orientation changes, which can cause content to "reflow".

---

## 2. CFI Syntax

A CFI is a string that follows a specific syntax, always enclosed within `epubcfi(...)`.

**General Structure:**
`epubcfi(<path_to_spine>!<path_within_content_document>)`

**Example:**
`epubcfi(/6/4[chapter-2]!/4/2/1:5)`

### 2.1. Core Components

| Component | Symbol | Description |
|---|---|---|
| **Step** | `/` | Navigates down one level in the document tree. Each step is followed by an integer. |
| **Integer** | `N` | An integer following a `/` that specifies a child node. Even integers represent element nodes, and odd integers represent non-element nodes (like text nodes). The indexing is 1-based, but elements start at 2 and text nodes at 1. |
| **Indirection** | `!` | A redirection operator. It signifies a transition from the EPUB's package file (`.opf`) into a specific content document (e.g., an `.xhtml` file). |
| **Character Offset** | `:` | Specifies a character position within a text node. It is 0-indexed. `:0` is before the first character. |
| **ID Assertion**| `[...]` | An optional component that provides the `id` attribute of an element. This is used for error correction and to make the CFI more robust. |

---

## 3. Path Resolution

A CFI path is resolved from the root of the EPUB package document (`.opf` file).

### 3.1. Navigating the EPUB Package (Spine)

The part of the CFI *before* the `!` navigates the package document, which is an XML file.

- The path starts from the root `<package>` element.
- The first step must point to the `<spine>` element.
- Subsequent steps navigate to the specific `<itemref>` within the spine that references the desired content document.

**Example: ` /6/4 `**

- `/6`: This would typically point to the `<spine>` element within the `<package>` element. The number `6` means it's the 3rd child *element* (2*3=6) of the package.
- `/4`: This points to the second child *element* (2*2=4) of the `<spine>`, which would be an `<itemref>`.

### 3.2. Indirection (`!`)

The `!` character is a crucial part of the CFI. It resolves the `href` from the `<itemref>` element (or other linking elements) and redirects the path resolution to the root of the referenced content document (the `.xhtml` file).

### 3.3. Navigating the Content Document

The part of the CFI *after* the `!` navigates the DOM of the content document (the XHTML file).

- The path starts from the root element of the XHTML document (usually `<html>`).
- The steps navigate through the elements of the document.
- Even integers are used for element nodes (`<body>`, `<div>`, `<p>`, etc.).
- Odd integers are for text nodes.

**Example: ` /4/2/1:5 `**

- `/4`: This would typically point to the `<body>` element inside the `<html>` element.
- `/2`: This points to the first child *element* of the `<body>` (e.g., a `<p>`).
- `/1`: This points to the first child of the `<p>`, which is a text node.
- `:5`: This specifies the 5th character (0-indexed) within that text node.

### 3.4. Node Indexing Rules

- **Element Nodes:** Are indexed with **even** positive integers (2, 4, 6, ...). The first element child is `/2`, the second is `/4`, and so on.
- **Non-Element Nodes (Text, CDATA):** Are indexed with **odd** positive integers (1, 3, 5, ...). The text node before the first element child is `/1`. The text node between the first and second element children is `/3`, and so on. Comments and processing instructions are ignored.

This indexing scheme ensures that whitespace-only text nodes between elements don't break the CFI.

---

## 4. Advanced CFI Features

### 4.1. ID Assertions

To make CFIs more robust, an ID assertion can be added to any step that points to an element with an `id` attribute.

**Syntax:** `/<step_number>[<id_of_element>]`

**Example:** `epubcfi(/6/4[chapter-2]!/4/2)`

Here, `[chapter-2]` asserts that the `<itemref>` element being pointed to by `/4` has `id="chapter-2"`. If the step number is incorrect but an element with that ID is found nearby, a reading system can attempt to correct the path.

### 4.2. Text Location Assertions

This is a way to add a snippet of the text at the target location to further validate the CFI. This is less commonly used than ID assertions.

**Syntax:** `.../1:5[;s=snippet]`

### 4.3. Ranges

A CFI can also define a range between two points in the EPUB.

**Syntax:** `epubcfi(/.../start_location,/end_location)`

**Example:** `epubcfi(/6/4!/4/2/1:10,/4/2/1:25)`

This would select the characters from the 10th to the 25th position in the specified text node. The start and end points of the range are separated by a comma.

---

## 5. Implementation Considerations for an AI Agent

### 5.1. Parsing a CFI

1.  **Validate Prefix:** Check if the string starts with `epubcfi(` and ends with `)`.
2.  **Split by Indirection:** The most important delimiter is `!`, which separates the package path from the content path.
3.  **Tokenize Steps:** For each path segment, split the string by the `/` character.
4.  **Parse Each Step:** For each token, parse the integer value and any ID assertion (text within `[...]`).
5.  **Handle Offsets:** If a `:` is present, parse the character offset.

### 5.2. Resolving a CFI

1.  **Load Package Document:** Start with the `.opf` file of the EPUB.
2.  **Traverse Package DOM:** Follow the steps of the CFI before the `!` to navigate the DOM of the package file and find the correct `<itemref>`.
3.  **Get Content Document:** From the `<itemref>`, get the `href` of the content document.
4.  **Load Content Document:** Load and parse the specified `.xhtml` file.
5.  **Traverse Content DOM:** Follow the steps of the CFI after the `!` to navigate the DOM of the content document to the target element or text node.
6.  **Apply Offset:** If a character offset is specified, locate that precise point within the target text node.

### 5.3. Generating a CFI

1.  **Get Target Node:** Start with the target DOM node (and character offset, if any) in the content document.
2.  **Generate Content Path:** Traverse up the DOM tree from the target node to the `<html>` element, generating the CFI steps at each level. Remember to use the even/odd indexing rule. Include ID assertions where available for robustness.
3.  **Identify Content Document:** Determine the file path of the current content document.
4.  **Find `itemref`:** In the package document's spine, find the `<itemref>` that points to the current content document.
5.  **Generate Spine Path:** Traverse up from the `<itemref>` to the `<package>` element to generate the spine path portion of the CFI.
6.  **Combine and Format:** Combine the spine path, the `!` indirection, and the content path, and wrap it in `epubcfi(...)`.