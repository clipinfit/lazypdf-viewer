import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import {
  EventBus,
  PDFViewer,
  PDFLinkService,
} from "pdfjs-dist/web/pdf_viewer.mjs";
import type { PDFDocumentProxy } from "pdfjs-dist";
import "./index.css";
import "./pdf_viewer.css";

// Configure the worker - use relative path served by Bun
pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

const PDF_URL =
  "https://pub-513161e404dd4d40812c46297917c1ad.r2.dev/docs/94430318-16c8-4f67-b735-7297299ced55/original.pdf";

export function App() {
  const viewerContainerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const viewerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eventBusRef = useRef<any>(null);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [scale, setScale] = useState<string | number>("auto");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const maxScaleRef = useRef<number | null>(null);
  const containerWrapperRef = useRef<HTMLDivElement>(null);

  // Initialize PDF viewer
  useEffect(() => {
    if (!viewerContainerRef.current || viewerRef.current) return;

    const container = viewerContainerRef.current;

    // Create event bus and link service
    const eventBus = new EventBus();
    const linkService = new PDFLinkService({ eventBus });

    eventBusRef.current = eventBus;

    // Create PDF viewer with proper configuration
    const pdfViewer = new PDFViewer({
      container: container,
      eventBus: eventBus,
      linkService,
      textLayerMode: 2, // Enable text selection layer
      removePageBorders: true,
      maxCanvasPixels: 33554432,
    });

    linkService.setViewer(pdfViewer);
    viewerRef.current = pdfViewer;

    // Listen to page changes from viewer
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    eventBus.on("pagechanging", (evt: any) => {
      setPageNum(evt.pageNumber);
    });

    // Listen to scale changes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    eventBus.on("scalechanging", (evt: any) => {
      const newScale = evt.scale;
      setScale(newScale);
      // Track the maximum scale (the current rendered size)
      // This becomes our maximum limit when resizing
      // Only update max if it's a numeric scale (not "auto" string)
      if (typeof newScale === "number") {
        if (maxScaleRef.current === null || newScale > maxScaleRef.current) {
          maxScaleRef.current = newScale;
        }
      }
    });

    // Load PDF document
    setLoading(true);
    setError(null);

    pdfjsLib
      .getDocument(PDF_URL)
      .promise.then((pdf) => {
        setPdfDoc(pdf);
        setPageCount(pdf.numPages);
        pdfViewer.setDocument(pdf);
        linkService.setDocument(pdf);
        // Set initial scale to auto (fits page width)
        pdfViewer.currentScaleValue = String(scale);
        // Wait for initial render to capture the max scale
        setTimeout(() => {
          if (
            pdfViewer.currentScale &&
            typeof pdfViewer.currentScale === "number"
          ) {
            maxScaleRef.current = pdfViewer.currentScale;
          }
        }, 200);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error loading PDF:", err);
        setError(`Failed to load PDF: ${err.message}`);
        setLoading(false);
      });

    // Cleanup
    return () => {
      if (viewerRef.current) {
        viewerRef.current.cleanup();
      }
    };
  }, [scale]);

  // Update scale when changed
  useEffect(() => {
    if (viewerRef.current && pdfDoc) {
      if (typeof scale === "string") {
        viewerRef.current.currentScaleValue = scale;
      } else {
        viewerRef.current.currentScale = scale;
      }
    }
  }, [scale, pdfDoc]);

  // Update current page when changed programmatically
  useEffect(() => {
    if (viewerRef.current && viewerRef.current.currentPageNumber !== pageNum) {
      viewerRef.current.currentPageNumber = pageNum;
    }
  }, [pageNum]);

  // Force update viewer when document is loaded
  useEffect(() => {
    if (viewerRef.current && pdfDoc) {
      viewerRef.current.update();
    }
  }, [pdfDoc]);

  // Handle window resize for automatic scaling
  useEffect(() => {
    if (!viewerRef.current || !pdfDoc || !containerWrapperRef.current) return;

    const calculateAutoScale = () => {
      const viewer = viewerRef.current;
      const container = containerWrapperRef.current;
      if (!viewer || !container) return;

      // Get current page view using public API
      const currentPageView = viewer.getPageView(pageNum - 1);
      if (!currentPageView || !currentPageView.pdfPage) return;

      // Get container dimensions (accounting for padding/borders)
      const containerWidth = container.clientWidth;
      const SCROLLBAR_PADDING = 40; // PDF.js default padding

      // Get page dimensions from the page view
      const pageWidth = currentPageView.width;
      const currentPageScale = currentPageView.scale;

      // Calculate scale needed to fit page width
      const pageWidthScale =
        ((containerWidth - SCROLLBAR_PADDING) / pageWidth) * currentPageScale;

      // Cap at maximum scale (the current rendered size)
      let finalScale = pageWidthScale;
      if (
        maxScaleRef.current !== null &&
        pageWidthScale > maxScaleRef.current
      ) {
        finalScale = maxScaleRef.current;
      }

      // Apply the scale only if it's different enough
      if (Math.abs(viewer.currentScale - finalScale) > 0.001) {
        viewer.currentScale = finalScale;
        setScale(finalScale);
      }
    };

    const applyAutoScale = () => {
      calculateAutoScale();
      if (viewerRef.current) {
        viewerRef.current.update();
      }
    };

    const handleResize = () => {
      applyAutoScale();
    };

    window.addEventListener("resize", handleResize);
    // Also listen to container resize (in case of flexbox changes)
    const resizeObserver = new ResizeObserver(() => {
      applyAutoScale();
    });
    resizeObserver.observe(containerWrapperRef.current);

    const rafId = requestAnimationFrame(() => {
      applyAutoScale();
    });

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", handleResize);
      resizeObserver.disconnect();
    };
  }, [pdfDoc, pageNum]);

  const goToPrevPage = () => {
    if (pageNum > 1) setPageNum(pageNum - 1);
  };

  const goToNextPage = () => {
    if (pageNum < pageCount) setPageNum(pageNum + 1);
  };

  const zoomIn = () => {
    if (viewerRef.current) {
      const currentScale = viewerRef.current.currentScale;
      viewerRef.current.currentScale = currentScale * 1.1;
      setScale(viewerRef.current.currentScale);
    }
  };

  const zoomOut = () => {
    if (viewerRef.current) {
      const currentScale = viewerRef.current.currentScale;
      viewerRef.current.currentScale = currentScale * 0.9;
      setScale(viewerRef.current.currentScale);
    }
  };

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
              <span>
                Scale:{" "}
                {typeof scale === "number"
                  ? `${(scale * 100).toFixed(0)}%`
                  : "Auto"}
              </span>
              <button type="button" onClick={zoomIn}>
                Zoom In
              </button>
            </div>
          </>
        )}
      </div>

      <div ref={containerWrapperRef} className="pdf-viewer-container-wrapper">
        <div ref={viewerContainerRef} className="pdf-canvas-container">
          <div className="pdfViewer" />
        </div>
      </div>
    </div>
  );
}

export default App;
