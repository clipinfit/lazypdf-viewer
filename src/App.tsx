import { useEffect, useState } from "react";
import { PDFViewerComponent } from "@/components/pdf-viewer";
import {
  LazyPDFViewer,
  type LazyPDFDocumentData,
} from "@/components/lazy-pdf-viewer";
import "./index.css";

const MODE: "lazy" | "single" = "lazy";
const PDF_URL = "original.pdf";
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

  const Viewer = () => MODE === "single" ? (
    <PDFViewerComponent pdfUrl={PDF_URL} />
  ) : MODE === "lazy" && documentData ? (
    <LazyPDFViewer document={documentData} />
  ) : null;

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      {loading && <p>Loading document manifest...</p>}
      {error && <p className="text-red-600">Error: {error}</p>}
      <Viewer />
    </div>
  );
}

export default App;
