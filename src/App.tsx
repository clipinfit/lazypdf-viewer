// import { PDFViewerComponent } from "@/components/pdf-viewer";
import { LazyPDFViewer } from "@/components/lazy-pdf-viewer";
import "./index.css";

// const PDF_URL =
//   "https://pub-513161e404dd4d40812c46297917c1ad.r2.dev/368_pages_276MB.pdf";

const MANIFEST_URL =
  "https://pub-513161e404dd4d40812c46297917c1ad.r2.dev/documents/js76p480gfcjw1d3c1jdv8e0897vbpjb/manifest2.json";

export function App() {
  // Use the lazy viewer with manifest for better performance
  // To use the traditional full-PDF viewer, uncomment the imports above and use:
  // return <PDFViewerComponent pdfUrl={PDF_URL} />;

  return <LazyPDFViewer manifestUrl={MANIFEST_URL} />;
}

export default App;
