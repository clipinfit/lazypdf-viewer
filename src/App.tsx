import { PDFViewerComponent } from "@/components/pdf-viewer";
import "./index.css";

const PDF_URL =
  "https://pub-513161e404dd4d40812c46297917c1ad.r2.dev/368_pages_276MB.pdf";

export function App() {
  return <PDFViewerComponent pdfUrl={PDF_URL} />;
}

export default App;
