# bun-react-template

To install dependencies:

```bash
bun install
```

## PDF Viewer Component Setup

To use the `PDFViewerComponent`, you need to install `pdfjs-dist` and copy the worker file:

### 1. Install pdfjs-dist

```bash
bun add pdfjs-dist
```

### 2. Copy Worker File

Copy the PDF.js worker file to your public directory (e.g., `src/` or `public/`):

```bash
cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs src/pdf.worker.min.mjs
```

### 3. Import CSS

The `pdf_viewer.css` file can be imported directly in your component from `node_modules`:

```typescript
import "../../node_modules/pdfjs-dist/web/pdf_viewer.css";
```

Or using a package import (if your bundler supports it):

```typescript
import "pdfjs-dist/web/pdf_viewer.css";
```

### 4. Configure Server Routes

Make sure your server (e.g., Bun server) serves the worker file at `/pdf.worker.min.mjs`. For example, in your Bun server:

```typescript
routes: {
  "/pdf.worker.min.mjs": new Response(
    Bun.file(import.meta.dir + "/pdf.worker.min.mjs")
  ),
  // ... other routes
}
```

### Usage

```tsx
import { PDFViewerComponent } from "@/components/pdf-viewer";

function App() {
  return <PDFViewerComponent pdfUrl="https://example.com/document.pdf" />;
}
```

## Development

To start a development server:

```bash
bun dev
```

To run for production:

```bash
bun start
```

This project was created using `bun init` in bun v1.3.0. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
