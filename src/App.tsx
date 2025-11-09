import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import {
  EventBus,
  PDFViewer,
  PDFLinkService,
} from "pdfjs-dist/web/pdf_viewer.mjs";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import "./index.css";
import "./pdf_viewer.css";

// Configure the worker - use relative path served by Bun
pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

const PDF_URL =
  "https://pub-513161e404dd4d40812c46297917c1ad.r2.dev/docs/94430318-16c8-4f67-b735-7297299ced55/original.pdf";

const ZOOM_PRESET_OPTIONS = [
  { value: "auto", label: "Automatic Zoom" },
  { value: "page-actual", label: "Actual Size" },
  { value: "page-fit", label: "Page Fit" },
  { value: "page-width", label: "Page Width" },
] as const;

const ZOOM_PERCENTAGE_OPTIONS = [
  { value: "0.5", label: "50%" },
  { value: "0.75", label: "75%" },
  { value: "1", label: "100%" },
  { value: "1.25", label: "125%" },
  { value: "1.5", label: "150%" },
  { value: "2", label: "200%" },
  { value: "3", label: "300%" },
  { value: "4", label: "400%" },
] as const;

type PageChangingEvent = {
  pageNumber: number;
};

type ScaleChangingEvent = {
  scale: number;
  presetValue?: string;
};

export function App() {
  const viewerContainerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<PDFViewer | null>(null);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [scale, setScale] = useState<string | number>("auto");
  const [scalePreset, setScalePreset] = useState<string>("auto");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const maxScaleRef = useRef<number | null>(null);
  const containerWrapperRef = useRef<HTMLDivElement>(null);
  const zoomLabelLookup = useMemo(() => {
    const presetEntries = ZOOM_PRESET_OPTIONS.map<[string, string]>((item) => [
      item.value,
      item.label,
    ]);
    const percentageEntries = ZOOM_PERCENTAGE_OPTIONS.map<[string, string]>(
      (item) => [item.value, item.label]
    );
    return new Map<string, string>([...presetEntries, ...percentageEntries]);
  }, []);
  const percentageValues = useMemo(
    () =>
      new Set(
        ZOOM_PERCENTAGE_OPTIONS.map((item) =>
          Number.parseFloat(item.value).toFixed(2)
        )
      ),
    []
  );
  const knownZoomValues = useMemo(
    () =>
      new Set<string>([
        ...ZOOM_PRESET_OPTIONS.map((item) => item.value),
        ...ZOOM_PERCENTAGE_OPTIONS.map((item) => item.value),
        "custom",
      ]),
    []
  );

  // Initialize PDF viewer
  useEffect(() => {
    if (!viewerContainerRef.current || viewerRef.current) return;

    const container = viewerContainerRef.current;

    // Create event bus and link service
    const eventBus = new EventBus();
    const linkService = new PDFLinkService({ eventBus });

    // Create PDF viewer with proper configuration
    const pdfViewer = new PDFViewer({
      container,
      eventBus,
      linkService,
      textLayerMode: 2, // Enable text selection layer
      removePageBorders: true,
      maxCanvasPixels: 33554432,
    });

    linkService.setViewer(pdfViewer);
    viewerRef.current = pdfViewer;

    // Listen to page changes from viewer
    eventBus.on("pagechanging", (evt: PageChangingEvent) => {
      setPageNum(evt.pageNumber);
    });

    // Listen to scale changes
    eventBus.on("scalechanging", (evt: ScaleChangingEvent) => {
      const newScale = evt.scale;
      const presetValue = evt.presetValue;
      setScale(newScale);
      if (presetValue && knownZoomValues.has(presetValue)) {
        setScalePreset(presetValue);
      } else if (typeof newScale === "number") {
        const normalizedValue = newScale.toFixed(2);
        if (percentageValues.has(normalizedValue)) {
          const matchedOption = ZOOM_PERCENTAGE_OPTIONS.find(
            (item) =>
              Number.parseFloat(item.value).toFixed(2) === normalizedValue
          );
          setScalePreset(matchedOption?.value ?? "custom");
        } else {
          setScalePreset("custom");
        }
      } else {
        setScalePreset("custom");
      }
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
  }, [scale, knownZoomValues, percentageValues]);

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

  // Helper function to round to nearest 10% and clamp between 10% and 500%
  const roundToNearestTenPercent = (scale: number): number => {
    // Convert scale to percentage (e.g., 1.0 -> 100%)
    const percentage = scale * 100;
    // Round to nearest 10
    const roundedPercentage = Math.round(percentage / 10) * 10;
    // Clamp between 10% and 500%
    const clampedPercentage = Math.max(10, Math.min(500, roundedPercentage));
    // Convert back to scale (e.g., 100% -> 1.0)
    return clampedPercentage / 100;
  };

  const zoomIn = () => {
    if (viewerRef.current) {
      const currentScale = viewerRef.current.currentScale;
      // Increment by 10% (add 0.1 to the scale value)
      const nextScale = currentScale + 0.1;
      // Round to nearest 10% and clamp to max 500%
      const roundedScale = roundToNearestTenPercent(nextScale);
      viewerRef.current.currentScale = roundedScale;
      setScale(roundedScale);
      setScalePreset("custom");
    }
  };

  const zoomOut = () => {
    if (viewerRef.current) {
      const currentScale = viewerRef.current.currentScale;
      // Decrement by 10% (subtract 0.1 from the scale value)
      const nextScale = currentScale - 0.1;
      // Round to nearest 10% and clamp to min 10%
      const roundedScale = roundToNearestTenPercent(nextScale);
      viewerRef.current.currentScale = roundedScale;
      setScale(roundedScale);
      setScalePreset("custom");
    }
  };

  const handleZoomPresetChange = (value: string) => {
    if (value === "custom") {
      return;
    }
    if (value === "auto" || value.startsWith("page-")) {
      setScale(value);
      setScalePreset(value);
      return;
    }
    const numericValue = Number.parseFloat(value);
    if (!Number.isNaN(numericValue)) {
      setScale(numericValue);
      setScalePreset(value);
    }
  };

  const selectValue = knownZoomValues.has(scalePreset) ? scalePreset : "custom";
  const customZoomLabel =
    typeof scale === "number"
      ? `Custom (${Math.round(scale * 100)}%)`
      : "Custom";

  return (
    <div className="pdf-viewer">
      <div className="pdf-toolbar">
        {loading && <div className="status-chip">Loading PDF…</div>}
        {error && <p className="error">{error}</p>}
        {!loading && !error && (
          <>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={goToPrevPage}
                disabled={pageNum <= 1}
                aria-label="Go to previous page"
              >
                <ChevronLeft className="icon-16" />
                <span className="label-desktop">Previous</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={goToNextPage}
                disabled={pageNum >= pageCount}
                aria-label="Go to next page"
              >
                <span className="label-desktop">Next</span>
                <ChevronRight className="icon-16" />
              </Button>
              <span className="">{`Page ${pageNum} of ${pageCount}`}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={zoomOut}
                aria-label="Zoom out"
              >
                <Minus className="icon-16" />
              </Button>
              <Select
                value={selectValue}
                onValueChange={handleZoomPresetChange}
              >
                <SelectTrigger size="sm" className="zoom-select-trigger">
                  <SelectValue placeholder="Zoom" />
                </SelectTrigger>
                <SelectContent className="zoom-select-content">
                  <SelectGroup>
                    <SelectLabel>Presets</SelectLabel>
                    {ZOOM_PRESET_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel>Zoom levels</SelectLabel>
                    {ZOOM_PERCENTAGE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                  {selectValue === "custom" && (
                    <>
                      <SelectSeparator />
                      <SelectGroup>
                        <SelectLabel>Current</SelectLabel>
                        <SelectItem value="custom">
                          {customZoomLabel}
                        </SelectItem>
                      </SelectGroup>
                    </>
                  )}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={zoomIn}
                aria-label="Zoom in"
              >
                <Plus className="icon-16" />
              </Button>
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
