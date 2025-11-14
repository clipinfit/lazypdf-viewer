import { useEffect, useState } from "react";
// import { PDFViewerComponent } from "@/components/pdf-viewer";
import {
  LazyPDFViewer,
  type LazyPDFDocumentData,
} from "@/components/lazy-pdf-viewer";
import "./index.css";

// const PDF_URL =
//   "https://pub-513161e404dd4d40812c46297917c1ad.r2.dev/368_pages_276MB.pdf";

const MANIFEST_URL =
  "https://pub-513161e404dd4d40812c46297917c1ad.r2.dev/documents/js76p480gfcjw1d3c1jdv8e0897vbpjb/manifest2.json";

export function App() {
  const [documentData, setDocumentData] = useState<LazyPDFDocumentData | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadManifest = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(MANIFEST_URL);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const data = (await response.json()) as LazyPDFDocumentData;
        if (cancelled) return;

        const trimmed: LazyPDFDocumentData = {
          docId: data.docId,
          filename: data.filename,
          pageCount: data.pageCount,
          createdAt: data.createdAt,
          pages: Array.isArray(data.pages)
            ? data.pages.map((page) => ({
                n: page.n,
                pdfUrl: page.pdfUrl,
              }))
            : [],
        };

        setDocumentData(trimmed);
      } catch (err) {
        if (cancelled) return;
        setError((err as Error)?.message ?? "Failed to load manifest");
        setDocumentData(null);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadManifest();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      {loading && <p>Loading document manifest...</p>}
      {error && <p className="text-red-600">Error: {error}</p>}
      {documentData && <LazyPDFViewer document={documentData} />}
    </div>
  );
}

export default App;
