import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import "./index.css";

// Configure the worker - use relative path served by Bun
pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

const PDF_URL =
  "https://pub-513161e404dd4d40812c46297917c1ad.r2.dev/docs/94430318-16c8-4f67-b735-7297299ced55/original.pdf";

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [scale, setScale] = useState(1.5);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load PDF document
  useEffect(() => {
    setLoading(true);
    setError(null);

    pdfjsLib
      .getDocument(PDF_URL)
      .promise.then((pdf) => {
        setPdfDoc(pdf);
        setPageCount(pdf.numPages);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error loading PDF:", err);
        setError(`Failed to load PDF: ${err.message}`);
        setLoading(false);
      });
  }, []);

  // Render current page
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;

    const renderPage = async () => {
      try {
        const page = await pdfDoc.getPage(pageNum);
        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext("2d");
        if (!context) return;

        const viewport = page.getViewport({ scale });
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
          canvas: canvas,
        };

        await page.render(renderContext).promise;
      } catch (err) {
        console.error("Error rendering page:", err);
        setError(
          `Failed to render page: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    };

    renderPage();
  }, [pdfDoc, pageNum, scale]);

  const goToPrevPage = () => {
    if (pageNum > 1) setPageNum(pageNum - 1);
  };

  const goToNextPage = () => {
    if (pageNum < pageCount) setPageNum(pageNum + 1);
  };

  const zoomIn = () => setScale(scale + 0.25);
  const zoomOut = () => setScale(Math.max(0.5, scale - 0.25));

  return (
    <div className="pdf-viewer">
      <div className="pdf-controls">
        <h1>PDF Viewer</h1>
        {loading && <p>Loading PDF...</p>}
        {error && <p className="error">{error}</p>}
        {!loading && !error && (
          <>
            <div className="control-buttons">
              <button
                type="button"
                onClick={goToPrevPage}
                disabled={pageNum <= 1}
              >
                Previous
              </button>
              <span className="page-info">
                Page {pageNum} of {pageCount}
              </span>
              <button
                type="button"
                onClick={goToNextPage}
                disabled={pageNum >= pageCount}
              >
                Next
              </button>
            </div>
            <div className="zoom-controls">
              <button type="button" onClick={zoomOut}>
                Zoom Out
              </button>
              <span>Scale: {(scale * 100).toFixed(0)}%</span>
              <button type="button" onClick={zoomIn}>
                Zoom In
              </button>
            </div>
          </>
        )}
      </div>
      <div className="pdf-canvas-container">
        <canvas ref={canvasRef} className="pdf-canvas" />
      </div>
    </div>
  );
}

export default App;
