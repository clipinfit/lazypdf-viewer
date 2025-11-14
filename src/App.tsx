import { useEffect, useState } from "react";
// import { PDFViewerComponent } from "@/components/pdf-viewer";
import {
  LazyPDFViewer,
  type LazyPDFDocumentData,
} from "@/components/lazy-pdf-viewer";
import "./index.css";

// const PDF_URL =
//   "https://pub-513161e404dd4d40812c46297917c1ad.r2.dev/368_pages_276MB.pdf";

// Only works if the r2 bucket is public
// const MANIFEST_URL =
//   "https://pub-a6f660970d8e4609b9c9c8cd0268a2f6.r2.dev/documents/js731jmkrz64x0e4je9kmpm0dd7vcgex/manifest.json";

// const BASE_URL =
//   "https://pub-a6f660970d8e4609b9c9c8cd0268a2f6.r2.dev/documents/js731jmkrz64x0e4je9kmpm0dd7vcgex";

const MANIFEST_URL = "/manifest.json";

// Type for the raw manifest structure from the filesystem
type RawManifest = {
  documentId: string;
  filename: string;
  pageCount: number;
  createdAt?: string;
  pages: Array<{
    n: number;
    pdfUrl: string;
  }>;
};

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
        const data = (await response.json()) as RawManifest;
        if (cancelled) return;

        // Transform the manifest to match LazyPDFDocumentData format
        // documentId -> docId, and keep page URLs as relative paths
        const trimmed: LazyPDFDocumentData = {
          docId: data.documentId,
          filename: data.filename,
          pageCount: data.pageCount,
          createdAt: data.createdAt,
          pages: data.pages.map((page) => ({
            n: page.n,
            pdfUrl: page.pdfUrl, // Keep as relative URL like "pages/1.pdf"
          })),
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
